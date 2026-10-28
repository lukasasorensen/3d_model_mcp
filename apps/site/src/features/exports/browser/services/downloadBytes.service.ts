import { CAD_LIMITS } from "@theoryfoundry/contracts";
function checkedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  if (bytes.byteLength === 0 || bytes.byteLength > CAD_LIMITS.exportBytes)
    throw new Error("Generated download exceeds the browser artifact limit.");
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

export function downloadGeneratedBytes(
  bytes: Uint8Array,
  mimeType: string,
  filename: string,
): void {
  const buffer = checkedArrayBuffer(bytes);
  const objectUrl = URL.createObjectURL(new Blob([buffer], { type: mimeType }));
  try {
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.click();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
}
