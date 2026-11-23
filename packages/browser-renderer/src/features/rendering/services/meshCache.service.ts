import { CAD_LIMITS } from "@theoryfoundry/contracts";
import type { RenderedMesh } from "../rendering.types.js";
/** The cache is process-local to one renderer/pin set; never persists source or meshes. */
export function createMeshCache(
  maxEntries = 8,
  maxBytes = CAD_LIMITS.previewBytes * 2,
): {
  get(sourceHash: string): RenderedMesh | undefined;
  set(sourceHash: string, result: RenderedMesh): void;
} {
  const previews = new Map<string, RenderedMesh>();
  let size = 0;
  return {
    get(sourceHash): RenderedMesh | undefined {
      const value = previews.get(sourceHash);
      if (value) {
        previews.delete(sourceHash);
        previews.set(sourceHash, value);
      }
      return value;
    },
    set(sourceHash, result): void {
      const previous = previews.get(sourceHash);
      if (previous) {
        size -= previous.bytes.byteLength;
        previews.delete(sourceHash);
      }
      if (result.bytes.byteLength > maxBytes || maxEntries < 1) return;
      previews.set(sourceHash, result);
      size += result.bytes.byteLength;
      while (previews.size > maxEntries || size > maxBytes) {
        const oldest = previews.entries().next().value!;
        size -= oldest[1].bytes.byteLength;
        previews.delete(oldest[0]);
      }
    },
  };
}
