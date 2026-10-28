export function createMeshCache(): {
  get(sourceHash: string): Uint8Array<ArrayBufferLike> | undefined;
  set(sourceHash: string, bytes: Uint8Array): void;
} {
  const previews = new Map<string, Uint8Array>();
  return {
    get(sourceHash: string): Uint8Array<ArrayBufferLike> | undefined {
      return previews.get(sourceHash);
    },
    set(sourceHash: string, bytes: Uint8Array): void {
      previews.set(sourceHash, bytes);
    },
  };
}
