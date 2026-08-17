import { isProductionRendererProvenance } from "@rjls/contracts";
import { CAD_TOOL_NAMES, createCadProvider, type ChatOrchestratorOptions } from "@rjls/gateway";
import { ModelProjectRepository } from "@rjls/model-project";
import { IsolatedOpenScadRenderer, OciCliRuntime } from "@rjls/renderer";
import { attestBosl2Tree, runBoundedCommand } from "@rjls/renderer";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { createInMemoryCadMcpClient, type ConnectedCadMcpClient } from "./mcp-client.js";
import { RuntimeObservabilityStore } from "./observability.js";

export interface ConfiguredCadRuntime extends ChatOrchestratorOptions {
  client: ConnectedCadMcpClient;
  repository: ModelProjectRepository;
  observability: RuntimeObservabilityStore;
  probeReadiness(): Promise<{ status: "ready"; profile: "production-oci" }>;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required local runtime configuration: ${name}`);
  return value;
}

let singleton: Promise<ConfiguredCadRuntime> | undefined;

export interface RendererReadinessConfiguration {
  engine: "docker" | "podman";
  image: string;
  bosl2Path: string;
  bosl2Version: string;
  bosl2Digest: string;
}

export async function probeRendererReadiness(
  configuration: RendererReadinessConfiguration,
  dependencies: {
    runCommand?: typeof runBoundedCommand;
    attestBosl2?: typeof attestBosl2Tree;
    probeEffectiveIsolation?: () => Promise<unknown>;
  } = {},
): Promise<{ status: "ready"; profile: "production-oci" }> {
  const runCommand = dependencies.runCommand ?? runBoundedCommand;
  const attestBosl2 = dependencies.attestBosl2 ?? attestBosl2Tree;
  const expectedDigest = configuration.image.slice(configuration.image.lastIndexOf("@") + 1);
  if (!/^sha256:[a-f0-9]{64}$/.test(expectedDigest) || !configuration.image.endsWith(`@${expectedDigest}`)) throw new Error("Renderer image is not pinned.");
  const bosl2 = await attestBosl2(configuration.bosl2Path, configuration.bosl2Version);
  if (bosl2.digest !== configuration.bosl2Digest) throw new Error("BOSL2 evidence does not match its configured pin.");
  const engine = await runCommand(configuration.engine, ["version"], undefined, 5_000);
  if (engine.code !== 0) throw new Error("Container runtime is unavailable.");
  const image = await runCommand(configuration.engine, ["image", "inspect", configuration.image], undefined, 8_000);
  if (image.code !== 0) throw new Error("Pinned renderer image is unavailable.");
  const records = JSON.parse(image.stdout) as Array<{ RepoDigests?: string[] }>;
  if (!(records[0]?.RepoDigests ?? []).includes(configuration.image)) throw new Error("Local renderer image does not match its configured digest.");
  if (!dependencies.probeEffectiveIsolation) throw new Error("Effective renderer isolation probe is unavailable.");
  await dependencies.probeEffectiveIsolation();
  return { status: "ready", profile: "production-oci" };
}

export async function probeConfiguredReadiness(
  client: Pick<ConnectedCadMcpClient, "listTools">,
  probeRenderer: () => Promise<{ status: "ready"; profile: "production-oci" }>,
): Promise<{ status: "ready"; profile: "production-oci" }> {
  const discovered = [...await client.listTools({})].sort();
  const expected = [...CAD_TOOL_NAMES].sort();
  if (JSON.stringify(discovered) !== JSON.stringify(expected)) throw new Error("Official MCP discovery did not expose the exact CAD tool surface.");
  return probeRenderer();
}

export function createObservedReadinessProbe(
  observability: RuntimeObservabilityStore,
  probe: () => Promise<{ status: "ready"; profile: "production-oci" }>,
  dependencies: { createId?: () => string; clock?: () => Date } = {},
): () => Promise<{ status: "ready"; profile: "production-oci" }> {
  const evidence = observability.createRequestSink();
  const createId = dependencies.createId ?? (() => `readiness-${randomUUID()}`);
  const clock = dependencies.clock ?? (() => new Date());
  return async () => {
    const requestId = createId();
    const timestamp = clock().toISOString();
    let result: { status: "ready"; profile: "production-oci" };
    try {
      result = await probe();
    } catch (error) {
      evidence.probeDependency({ available: false, requestId, timestamp });
      throw error;
    }
    if (evidence.probeDependency({ available: true, requestId, timestamp }) !== "ready") throw new Error("Renderer readiness recovery confirmation is pending.");
    return result;
  };
}

export function getConfiguredCadRuntime(): Promise<ConfiguredCadRuntime> {
  singleton ??= (async () => {
    if ((process.env.RJLS_RENDER_PROFILE ?? "production-oci") !== "production-oci") throw new Error("The chat route requires the production OCI renderer profile.");
    const engine = required("RJLS_RENDER_ENGINE");
    if (engine !== "docker" && engine !== "podman") throw new Error("RJLS_RENDER_ENGINE must be docker or podman.");
    const mode = required("RJLS_RENDER_MODE");
    if (mode !== "rootless" && mode !== "vm-backed") throw new Error("RJLS_RENDER_MODE must be rootless or vm-backed.");
    const image = required("RJLS_OPENSCAD_IMAGE");
    const readinessConfiguration: RendererReadinessConfiguration = {
      engine,
      image,
      bosl2Path: required("RJLS_BOSL2_PATH"),
      bosl2Version: required("RJLS_BOSL2_VERSION"),
      bosl2Digest: required("RJLS_BOSL2_SHA256"),
    };
    const ociRuntime = new OciCliRuntime(engine, mode);
    const renderer = new IsolatedOpenScadRenderer({
      runtime: ociRuntime,
      image,
      imageDigest: image.split("@").at(-1) ?? "",
      openscadVersion: required("RJLS_OPENSCAD_VERSION"),
      openscadBinaryHash: required("RJLS_OPENSCAD_BINARY_SHA256"),
      openscadHelpHash: required("RJLS_OPENSCAD_HELP_SHA256"),
      bosl2Path: readinessConfiguration.bosl2Path,
      bosl2Version: readinessConfiguration.bosl2Version,
      bosl2Digest: readinessConfiguration.bosl2Digest,
    });
    const workspaceRoot = resolve(process.env.RJLS_PROJECTS_ROOT ?? ".rjls-projects");
    const repository = new ModelProjectRepository({ workspaceRoot, renderer, acceptRendererProvenance: isProductionRendererProvenance });
    let lastReadyAt = 0;
    const client = await createInMemoryCadMcpClient(repository);
    const observability = new RuntimeObservabilityStore();
    const observedReadinessProbe = createObservedReadinessProbe(observability, () => probeConfiguredReadiness(client, () => probeRendererReadiness(readinessConfiguration, {
      probeEffectiveIsolation: async () => ociRuntime.probeEffectiveIsolation({
        image,
        imageDigest: image.split("@").at(-1) ?? "",
        bosl2HostPath: readinessConfiguration.bosl2Path,
      }),
    })));
    return {
      client,
      provider: createCadProvider(),
      createObservabilitySink: observability.createRequestSink,
      observability,
      repository,
      async probeReadiness() {
        if (Date.now() - lastReadyAt < 5_000) return { status: "ready", profile: "production-oci" };
        const result = await observedReadinessProbe();
        lastReadyAt = Date.now();
        return result;
      },
    };
  })();
  return singleton;
}
