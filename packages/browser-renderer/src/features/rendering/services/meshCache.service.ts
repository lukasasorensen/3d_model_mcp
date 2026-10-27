export function createMeshCache() {
  const previews = new Map<string, Uint8Array>();
  return {
    get(sourceHash: string) {
      return previews.get(sourceHash);
    },
    set(sourceHash: string, bytes: Uint8Array) {
      previews.set(sourceHash, bytes);
    },
  };
}
