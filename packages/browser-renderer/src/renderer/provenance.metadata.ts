import { BROWSER_RENDERER } from "@theoryfoundry/contracts";

export const browserRendererProvenance = Object.freeze({
  profile: "browser-wasm" as const,
  renderer: "openscad-wasm" as const,
  rendererVersion: "1.0.0",
  openscadVersion: BROWSER_RENDERER.openscadVersion,
  openscadWasmHash: `sha256:${BROWSER_RENDERER.openscadWasmSha256}`,
  openscadGlueHash: `sha256:${BROWSER_RENDERER.openscadGlueSha256}`,
  bosl2Version: BROWSER_RENDERER.bosl2Version,
  bosl2Digest: `sha256:${BROWSER_RENDERER.bosl2ArchiveSha256}` as const,
  backend: BROWSER_RENDERER.backend,
  commandPolicyVersion: "openscad-browser-manifold-v1",
  validationPolicyVersion: "cad-validation-v1",
});
