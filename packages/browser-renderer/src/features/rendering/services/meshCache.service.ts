import { CAD_LIMITS } from "@theoryfoundry/contracts";
/** The cache is process-local to one renderer/pin set; never persists source or meshes. */
export function createMeshCache(
  maxEntries = 8,
  maxBytes = CAD_LIMITS.previewBytes * 2,
): {
  get(sourceHash: string): Uint8Array | undefined;
  set(sourceHash: string, bytes: Uint8Array): void;
} {
  const previews = new Map<string, Uint8Array>();
  let size = 0;
  return {
    get(sourceHash): Uint8Array | undefined {
      const value = previews.get(sourceHash);
      if (value) {
        previews.delete(sourceHash);
        previews.set(sourceHash, value);
      }
      return value;
    },
    set(sourceHash, bytes): void {
      const previous = previews.get(sourceHash);
      if (previous) {
        size -= previous.byteLength;
        previews.delete(sourceHash);
      }
      if (bytes.byteLength > maxBytes || maxEntries < 1) return;
      previews.set(sourceHash, bytes);
      size += bytes.byteLength;
      while (previews.size > maxEntries || size > maxBytes) {
        const oldest = previews.entries().next().value!;
        size -= oldest[1].byteLength;
        previews.delete(oldest[0]);
      }
    },
  };
}
