import {
  BROWSER_RENDERER,
  browserRenderCompletionSchema,
  rendererProvenanceSchema,
  type BrowserRenderCompletion,
} from "@theoryfoundry/contracts";
import { randomBytes } from "node:crypto";
export class BrowserRenderCompletionError extends Error {}

export const BROWSER_COMMAND_POLICY_VERSION = "openscad-browser-manifold-v1";

export const BROWSER_RENDERER_VERSION = "1.0.0";

export const storedBrowserCompletionSchema = browserRenderCompletionSchema.pick(
  {
    outcome: true,
    diagnostics: true,
    provenance: true,
    geometry: true,
  },
);

export function sanitizeBrowserRenderCompletion(
  completion: BrowserRenderCompletion,
): Pick<
  BrowserRenderCompletion,
  "outcome" | "diagnostics" | "provenance" | "geometry"
> {
  return storedBrowserCompletionSchema.parse({
    outcome: completion.outcome,
    diagnostics: completion.diagnostics,
    provenance: completion.provenance,
    ...(completion.geometry ? { geometry: completion.geometry } : {}),
  });
}

export function opaqueRandomId(prefix: string): string {
  return `${prefix}-${randomBytes(18).toString("hex")}`;
}

export function expectedBrowserProvenance(
  validationPolicyVersion: string,
): ReturnType<typeof rendererProvenanceSchema.parse> {
  return rendererProvenanceSchema.parse({
    profile: "browser-wasm",
    renderer: "openscad-wasm",
    rendererVersion: BROWSER_RENDERER_VERSION,
    openscadVersion: BROWSER_RENDERER.openscadVersion,
    openscadWasmHash: `sha256:${BROWSER_RENDERER.openscadWasmSha256}`,
    openscadGlueHash: `sha256:${BROWSER_RENDERER.openscadGlueSha256}`,
    bosl2Version: BROWSER_RENDERER.bosl2Version,
    bosl2Digest: `sha256:${BROWSER_RENDERER.bosl2ArchiveSha256}`,
    backend: BROWSER_RENDERER.backend,
    commandPolicyVersion: BROWSER_COMMAND_POLICY_VERSION,
    validationPolicyVersion,
  });
}
