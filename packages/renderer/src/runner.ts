import { createHash } from "node:crypto";
import { CAD_LIMITS, type CadRenderer, type CandidateRenderRequest, type RendererProvenance, type RenderValidationResult, type RenderedArtifact } from "@rjls/contracts";
import { bindThreeMfSource, parseBinaryStl, parseThreeMf } from "./artifacts.js";
import { RendererError, parseDiagnostics } from "./diagnostics.js";
import { RUNTIME_LIMITS, TrustedLocalOpenScadRuntime, parseCgroupV2Evidence, parseSameContainerIsolationEvidence, type EffectiveIsolationAttestation, type OciRuntimeController } from "./oci-runtime.js";

export const COMMAND_POLICY_VERSION = "openscad-fixed-command-v1";
export const VALIDATION_POLICY_VERSION = "cad-validation-v1";
export const RENDERER_VERSION = "1.0.0";

export interface IsolatedOpenScadRendererOptions {
  runtime: OciRuntimeController;
  image: string;
  imageDigest: string;
  openscadVersion: string;
  openscadBinaryHash: string;
  openscadHelpHash: string;
  bosl2Path: string;
  bosl2Version: string;
  bosl2Digest: string;
  timeoutMs?: number;
  /** Internal discriminator used only by TrustedLocalOpenScadRenderer. */
  profile?: "production-oci" | "trusted-local-development";
}

export interface TrustedLocalOpenScadRendererOptions {
  openscadExecutable: string;
  openscadVersion: string;
  openscadBinaryHash: string;
  openscadHelpHash: string;
  bosl2Path: string;
  bosl2Version: string;
  bosl2Digest: string;
  timeoutMs?: number;
  warn?: (message: string) => void;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function assertPin(name: string, value: string): void {
  if (!/^sha256:[a-f0-9]{64}$/.test(value)) throw new RendererError("INTEGRITY_FAILURE", `${name} must be pinned by SHA-256 digest.`);
}

type ProductionEffectiveAttestation = EffectiveIsolationAttestation & {
  mode: "rootless" | "vm-backed"; network: "none"; readOnlyRoot: true; capabilitiesDropped: true;
  noNewPrivileges: true; inputReadOnly: true; outputIsolated: true; resourceLimitsEnforced: true; seccompEnforced: true;
};

function assertEffective(attestation: EffectiveIsolationAttestation, expectedDigest: string): asserts attestation is ProductionEffectiveAttestation {
  if ((attestation.mode !== "rootless" && attestation.mode !== "vm-backed") || attestation.imageDigest !== expectedDigest || attestation.effectiveUid === 0 || attestation.network !== "none" || !attestation.readOnlyRoot || !attestation.capabilitiesDropped || !attestation.noNewPrivileges || !attestation.inputReadOnly || !attestation.outputIsolated || !attestation.resourceLimitsEnforced || !attestation.seccompEnforced || attestation.memoryBytes !== RUNTIME_LIMITS.memoryBytes || attestation.nanoCpus !== RUNTIME_LIMITS.nanoCpus || attestation.pids !== RUNTIME_LIMITS.pids || !/^sha256:[a-f0-9]{64}$/.test(attestation.policyEvidenceHash ?? "")) {
    throw new RendererError("ISOLATION_UNAVAILABLE", "Effective runtime isolation attestation failed closed.");
  }
  if (!attestation.cgroupV2Evidence) throw new RendererError("ISOLATION_UNAVAILABLE", "Observed cgroup v2 evidence is missing.");
  parseCgroupV2Evidence({ controllers: attestation.cgroupV2Evidence.controllers.join(" "), memoryMax: attestation.cgroupV2Evidence.memoryMax, pidsMax: attestation.cgroupV2Evidence.pidsMax, cpuMax: attestation.cgroupV2Evidence.cpuMax });
  if (!attestation.containerEvidence?.length || new Set(attestation.containerEvidence.map((evidence) => evidence.containerId)).size !== attestation.containerEvidence.length) throw new RendererError("ISOLATION_UNAVAILABLE", "Same-container isolation evidence is missing or duplicated.");
  for (const evidence of attestation.containerEvidence) {
    const serialized = `uid=${evidence.effectiveUid}\nhostname=${evidence.hostname}\ncgroup=0::${evidence.cgroupPath}\ncontrollers=${evidence.cgroupV2Evidence.controllers.join(" ")}\nmemory_max=${evidence.cgroupV2Evidence.memoryMax}\npids_max=${evidence.cgroupV2Evidence.pidsMax}\ncpu_max=${evidence.cgroupV2Evidence.cpuMax}\n`;
    const validated = parseSameContainerIsolationEvidence(serialized, evidence.containerId);
    if (validated.effectiveUid !== attestation.effectiveUid || JSON.stringify(validated.cgroupV2Evidence) !== JSON.stringify(attestation.cgroupV2Evidence)) throw new RendererError("ISOLATION_UNAVAILABLE", "Container resource evidence is internally inconsistent.");
  }
}

export class IsolatedOpenScadRenderer implements CadRenderer {
  constructor(private readonly options: IsolatedOpenScadRendererOptions) {
    assertPin("Image", options.imageDigest);
    assertPin("OpenSCAD binary", options.openscadBinaryHash);
    assertPin("OpenSCAD help", options.openscadHelpHash);
    assertPin("BOSL2", options.bosl2Digest);
    if (options.image !== `${options.image.split("@")[0]}@${options.imageDigest}`) throw new RendererError("INTEGRITY_FAILURE", "Image reference and digest disagree.");
    const expectedProfile = options.profile ?? "production-oci";
    const limits = options.runtime.configuredLimits;
    if (options.runtime.profile !== expectedProfile || (expectedProfile === "production-oci" && (limits.memoryBytes !== RUNTIME_LIMITS.memoryBytes || limits.nanoCpus !== RUNTIME_LIMITS.nanoCpus || limits.pids !== RUNTIME_LIMITS.pids))) {
      throw new RendererError("ISOLATION_UNAVAILABLE", "Renderer runtime profile and exact limits must satisfy policy before execution.");
    }
  }

  async validateAndRender(request: CandidateRenderRequest): Promise<RenderValidationResult> {
    if (sha256(request.source) !== request.sourceHash) throw new RendererError("INTEGRITY_FAILURE", "Source hash does not match the render request.");
    if (Buffer.byteLength(request.source) > CAD_LIMITS.sourceBytes) throw new RendererError("RESOURCE_LIMIT", "Source exceeds the byte budget.");
    const timeoutMs = Math.min(this.options.timeoutMs ?? RUNTIME_LIMITS.timeoutMs, RUNTIME_LIMITS.timeoutMs);
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new RendererError("RESOURCE_LIMIT", "Renderer timeout must be a positive bounded value.");
    const result = await this.options.runtime.execute({ source: request.source, image: this.options.image, imageDigest: this.options.imageDigest, bosl2HostPath: this.options.bosl2Path, openscadVersion: this.options.openscadVersion, openscadBinaryHash: this.options.openscadBinaryHash, openscadHelpHash: this.options.openscadHelpHash, bosl2Version: this.options.bosl2Version, bosl2Digest: this.options.bosl2Digest, formats: ["stl", "3mf"], timeoutMs }, request.signal);
    if (this.options.profile !== "trusted-local-development") {
      assertEffective(result.attestation, this.options.imageDigest);
      if (result.attestation.openscadVersion !== this.options.openscadVersion || result.attestation.openscadBinaryHash !== this.options.openscadBinaryHash || result.attestation.openscadHelpHash !== this.options.openscadHelpHash || result.attestation.bosl2Version !== this.options.bosl2Version || result.attestation.bosl2Digest !== this.options.bosl2Digest) throw new RendererError("INTEGRITY_FAILURE", "Effective renderer toolchain evidence does not match configured provenance.");
    }
    else if (result.attestation.mode !== "trusted-local") throw new RendererError("ISOLATION_UNAVAILABLE", "Trusted-local renderer received mismatched runtime provenance.");
    const diagnostics = parseDiagnostics(result.stderr, result.exitCode);
    if (result.exitCode !== 0 || diagnostics.some((diagnostic) => diagnostic.severity === "error")) return { outcome: "REJECTED", diagnostics, provenance: this.provenance(result.attestation), validationPolicyVersion: VALIDATION_POLICY_VERSION, artifacts: [] };
    const artifacts: RenderedArtifact[] = [];
    const stl = result.artifacts.get("stl");
    if (!stl) throw new RendererError("INVALID_ARTIFACT", "OpenSCAD did not produce the required binary STL preview.");
    const preview = parseBinaryStl(stl);
    artifacts.push({ format: "stl", mimeType: "model/stl", bytes: stl, ...preview, tessellation: { profile: request.previewProfile, commandPolicy: COMMAND_POLICY_VERSION } });
    const threeMf = result.artifacts.get("3mf");
    if (threeMf) {
      const linkedThreeMf = bindThreeMfSource(threeMf, request.sourceHash);
      const exported = parseThreeMf(linkedThreeMf, request.sourceHash);
      artifacts.push({ format: "3mf", mimeType: "model/3mf", bytes: linkedThreeMf, ...exported, tessellation: { profile: request.previewProfile, commandPolicy: COMMAND_POLICY_VERSION } });
    }
    return { outcome: "VALID", diagnostics, provenance: this.provenance(result.attestation), validationPolicyVersion: VALIDATION_POLICY_VERSION, artifacts };
  }

  private provenance(attestation: EffectiveIsolationAttestation): RendererProvenance {
    const common = {
      renderer: this.options.profile === "trusted-local-development" ? "trusted-local-openscad-bosl2" : "isolated-openscad-bosl2",
      rendererVersion: RENDERER_VERSION,
      openscadVersion: this.options.openscadVersion,
      openscadBinaryHash: this.options.openscadBinaryHash,
      openscadHelpHash: this.options.openscadHelpHash,
      bosl2Version: this.options.bosl2Version,
      bosl2Digest: this.options.bosl2Digest,
      imageDigest: this.options.imageDigest,
      commandPolicyVersion: COMMAND_POLICY_VERSION,
      validationPolicyVersion: VALIDATION_POLICY_VERSION,
    };
    if (this.options.profile === "trusted-local-development") return {
      ...common,
      profile: "trusted-local-development",
      attestation: { engine: "trusted-local-openscad", mode: "trusted-local", effectiveUid: attestation.effectiveUid, network: "host", readOnlyRoot: false, capabilitiesDropped: false, noNewPrivileges: false, inputReadOnly: false, outputIsolated: false, resourceLimitsEnforced: false, seccompEnforced: false, memoryBytes: 0, nanoCpus: 0, pidsLimit: 0 },
    };
    assertEffective(attestation, this.options.imageDigest);
    return {
      ...common,
      profile: "production-oci",
      attestation: { engine: `${attestation.engine};policy=${attestation.policyEvidenceHash}`, mode: attestation.mode, effectiveUid: attestation.effectiveUid, network: attestation.network, readOnlyRoot: attestation.readOnlyRoot, capabilitiesDropped: attestation.capabilitiesDropped, noNewPrivileges: attestation.noNewPrivileges, inputReadOnly: attestation.inputReadOnly, outputIsolated: attestation.outputIsolated, resourceLimitsEnforced: attestation.resourceLimitsEnforced, seccompEnforced: attestation.seccompEnforced, memoryBytes: attestation.memoryBytes as 536870912, nanoCpus: attestation.nanoCpus as 1000000000, pidsLimit: attestation.pids as 128, openscadVersion: attestation.openscadVersion, openscadBinaryHash: attestation.openscadBinaryHash, openscadHelpHash: attestation.openscadHelpHash, bosl2Version: attestation.bosl2Version, bosl2Digest: attestation.bosl2Digest },
    };
  }
}

/** Explicitly opt-in, non-isolated renderer for trusted local source only. */
export class TrustedLocalOpenScadRenderer extends IsolatedOpenScadRenderer {
  constructor(options: TrustedLocalOpenScadRendererOptions) {
    const zeroDigest = `sha256:${"0".repeat(64)}`;
    super({
      runtime: new TrustedLocalOpenScadRuntime(options.openscadExecutable, options.warn),
      image: `trusted-local@${zeroDigest}`,
      imageDigest: zeroDigest,
      openscadVersion: options.openscadVersion,
      openscadBinaryHash: options.openscadBinaryHash,
      openscadHelpHash: options.openscadHelpHash,
      bosl2Path: options.bosl2Path,
      bosl2Version: options.bosl2Version,
      bosl2Digest: options.bosl2Digest,
      timeoutMs: options.timeoutMs,
      profile: "trusted-local-development",
    });
  }
}
