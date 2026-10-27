import { type RendererProvenance } from "../cad.types.js";
import { rendererProvenanceSchema } from "../rendererProvenance.schema.js";

export function isProductionRendererProvenance(
  provenance: RendererProvenance,
): boolean {
  const parsed = rendererProvenanceSchema.safeParse(provenance);
  return parsed.success && parsed.data.profile === "production-oci";
}

export function isBrowserRendererProvenance(
  provenance: RendererProvenance,
): boolean {
  const parsed = rendererProvenanceSchema.safeParse(provenance);
  return parsed.success && parsed.data.profile === "browser-wasm";
}
