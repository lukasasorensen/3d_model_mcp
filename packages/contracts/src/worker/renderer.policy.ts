import { BROWSER_RENDERER, isBrowserRendererProvenance, type RendererProvenance } from "../cad-contracts.js";

/** Compatibility checks on declared metadata, not attestation of client execution. */
export function acceptsWorkerRenderer(provenance: RendererProvenance): boolean {
  return isBrowserRendererProvenance(provenance) && provenance.profile === "browser-wasm"
    && provenance.rendererVersion === "1.0.0"
    && provenance.openscadWasmHash === `sha256:${BROWSER_RENDERER.openscadWasmSha256}`
    && provenance.openscadGlueHash === `sha256:${BROWSER_RENDERER.openscadGlueSha256}`
    && provenance.commandPolicyVersion === "openscad-browser-manifold-v1";
}
