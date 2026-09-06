import { inflateSync } from "node:zlib";
import { PREVIEW_LIMITS } from "@rjls/contracts";
import { CadDomainError } from "@rjls/model-project";

/** Decode only bounded 8-bit RGB/RGBA PNGs produced by the browser canvas. */
export function validatePreviewPng(encoded: string): Buffer {
  const reject = (): never => { throw new CadDomainError("INVALID_PREVIEW", "Preview must be a valid bounded 768×768 PNG."); };
  if (encoded.length > Math.ceil(PREVIEW_LIMITS.pngBytes / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) return reject();
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length > PREVIEW_LIMITS.pngBytes || bytes.length < 45 || bytes.toString("base64") !== encoded || !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return reject();
  const compressed: Buffer[] = [];
  let channels = 0; let ended = false; let sawData = false; let dataEnded = false;
  for (let offset = 8; offset < bytes.length;) {
    if (offset + 12 > bytes.length) return reject();
    const length = bytes.readUInt32BE(offset); const end = offset + 12 + length;
    if (end > bytes.length) return reject();
    const kind = bytes.toString("ascii", offset + 4, offset + 8);
    const chunk = bytes.subarray(offset + 8, end - 4);
    let crc = 0xffffffff;
    for (const value of bytes.subarray(offset + 4, end - 4)) { crc ^= value; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    if (((crc ^ 0xffffffff) >>> 0) !== bytes.readUInt32BE(end - 4)) return reject();
    if (offset === 8) {
      if (kind !== "IHDR" || length !== 13 || chunk.readUInt32BE(0) !== 768 || chunk.readUInt32BE(4) !== 768 || chunk[8] !== 8 || ![2,6].includes(chunk[9]!) || chunk[10] || chunk[11] || chunk[12]) return reject();
      channels = chunk[9] === 6 ? 4 : 3;
    } else if (kind === "IDAT") {
      if (dataEnded) return reject();
      sawData = true; compressed.push(chunk);
    } else if (kind === "IEND") {
      if (length || end !== bytes.length || !sawData) return reject();
      ended = true;
    } else {
      if (sawData) dataEnded = true;
      if (kind === "IHDR" || (kind[0] === kind[0]?.toUpperCase() && kind !== "PLTE")) return reject();
    }
    offset = end;
  }
  if (!ended) return reject();
  const stride = 768 * channels + 1;
  try {
    const decoded = inflateSync(Buffer.concat(compressed), { maxOutputLength: stride * 768 });
    if (decoded.length !== stride * 768) return reject();
    for (let row = 0; row < 768; row++) if (decoded[row * stride]! > 4) return reject();
  } catch { return reject(); }
  return bytes;
}
