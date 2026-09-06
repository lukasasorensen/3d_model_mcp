import { deflateSync } from "node:zlib";
export function pngFixture(width = 768, height = 768) {
  const chunk = (kind, bytes) => {
    const encoded = Buffer.alloc(bytes.length + 12); encoded.writeUInt32BE(bytes.length); encoded.write(kind, 4); bytes.copy(encoded, 8);
    let crc = 0xffffffff;
    for (const value of encoded.subarray(4, -4)) { crc ^= value; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    encoded.writeUInt32BE((crc ^ 0xffffffff) >>> 0, encoded.length - 4); return encoded;
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", header), chunk("IDAT", deflateSync(Buffer.alloc((width * 4 + 1) * height))), chunk("IEND", Buffer.alloc(0))]).toString("base64");
}
