import { type ZipEntry, type CentralZipEntry } from "../artifact.types.js";
import { RendererError } from "./rendererError.util.js";
import { zipDirectory, zipEntrySizes } from "./zip64.util.js";
import { crc32 } from "./crc32.util.js";
import { CAD_LIMITS } from "@theoryfoundry/contracts";
import { inflateRawSync } from "node:zlib";

export function unzip(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 22)
    throw new RendererError(
      "INVALID_ARTIFACT",
      "3MF is not a complete ZIP package.",
    );
  let eocd = -1;
  for (
    let cursor = bytes.byteLength - 22;
    cursor >= Math.max(0, bytes.byteLength - 65_557);
    cursor -= 1
  ) {
    if (view.getUint32(cursor, true) === 0x06054b50) {
      eocd = cursor;
      break;
    }
  }
  if (
    eocd < 0 ||
    eocd + 22 + view.getUint16(eocd + 20, true) !== bytes.byteLength
  )
    throw new RendererError(
      "INVALID_ARTIFACT",
      "3MF ZIP end record is missing or inconsistent.",
    );
  const {
    count: entryCount,
    offset: centralOffset,
    end: centralEnd,
  } = zipDirectory(view, eocd);
  const central: CentralZipEntry[] = [];
  let centralCursor = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (
      centralCursor + 46 > centralEnd ||
      view.getUint32(centralCursor, true) !== 0x02014b50
    )
      throw new RendererError(
        "INVALID_ARTIFACT",
        "3MF ZIP central directory is malformed.",
      );
    const nameLength = view.getUint16(centralCursor + 28, true);
    const extraLength = view.getUint16(centralCursor + 30, true);
    const commentLength = view.getUint16(centralCursor + 32, true);
    const end = centralCursor + 46 + nameLength + extraLength + commentLength;
    if (end > centralEnd)
      throw new RendererError(
        "INVALID_ARTIFACT",
        "3MF ZIP central directory is truncated.",
      );
    const sizes = zipEntrySizes(
      view,
      centralCursor + 46 + nameLength,
      extraLength,
      {
        compressedSize: view.getUint32(centralCursor + 20, true),
        uncompressedSize: view.getUint32(centralCursor + 24, true),
        localOffset: view.getUint32(centralCursor + 42, true),
      },
    );
    central.push({
      name: new TextDecoder().decode(
        bytes.subarray(centralCursor + 46, centralCursor + 46 + nameLength),
      ),
      flags: view.getUint16(centralCursor + 8, true),
      method: view.getUint16(centralCursor + 10, true),
      crc: view.getUint32(centralCursor + 16, true),
      compressedSize: sizes.compressedSize,
      uncompressedSize: sizes.uncompressedSize,
      localOffset: sizes.localOffset!,
    });
    centralCursor = end;
  }
  if (
    centralCursor !== centralEnd ||
    new Set(central.map((entry) => entry.name)).size !== central.length
  )
    throw new RendererError(
      "INVALID_ARTIFACT",
      "3MF ZIP central directory has trailing or duplicate entries.",
    );
  const entries: ZipEntry[] = [];
  let offset = 0;
  let expanded = 0;
  for (const expected of central) {
    if (
      expected.localOffset !== offset ||
      offset + 30 > centralOffset ||
      view.getUint32(offset, true) !== 0x04034b50
    )
      throw new RendererError(
        "INVALID_ARTIFACT",
        "3MF ZIP local headers do not match the central directory.",
      );
    const flags = view.getUint16(offset + 6, true);
    const method = view.getUint16(offset + 8, true);
    let compressedSize = view.getUint32(offset + 18, true);
    let uncompressedSize = view.getUint32(offset + 22, true);
    const expectedCrc = view.getUint32(offset + 14, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    ({ compressedSize, uncompressedSize } = zipEntrySizes(
      view,
      offset + 30 + nameLength,
      extraLength,
      { compressedSize, uncompressedSize },
    ));
    if ((flags & 0x09) !== 0 || (method !== 0 && method !== 8))
      throw new RendererError(
        "INVALID_ARTIFACT",
        "3MF ZIP uses an unsupported streaming or compression mode.",
      );
    const dataOffset = offset + 30 + nameLength + extraLength;
    const end = dataOffset + compressedSize;
    if (end > bytes.byteLength || uncompressedSize > CAD_LIMITS.exportBytes)
      throw new RendererError(
        "INVALID_ARTIFACT",
        "3MF ZIP entry is truncated or oversized.",
      );
    const name = new TextDecoder().decode(
      bytes.subarray(offset + 30, offset + 30 + nameLength),
    );
    if (
      name !== expected.name ||
      flags !== expected.flags ||
      method !== expected.method ||
      compressedSize !== expected.compressedSize ||
      uncompressedSize !== expected.uncompressedSize ||
      expectedCrc !== expected.crc
    )
      throw new RendererError(
        "INVALID_ARTIFACT",
        "3MF ZIP local and central metadata disagree.",
      );
    if (
      !name ||
      name.startsWith("/") ||
      name.includes("\\") ||
      name.split("/").includes("..")
    )
      throw new RendererError(
        "INVALID_ARTIFACT",
        "3MF ZIP contains an unsafe entry path.",
      );
    const compressed = bytes.subarray(dataOffset, end);
    const output =
      method === 0
        ? compressed
        : inflateRawSync(compressed, {
            maxOutputLength: CAD_LIMITS.exportBytes,
          });
    if (output.byteLength !== uncompressedSize)
      throw new RendererError(
        "INVALID_ARTIFACT",
        "3MF ZIP entry size is inconsistent.",
      );
    if (crc32(output) !== expectedCrc)
      throw new RendererError(
        "INTEGRITY_FAILURE",
        "3MF ZIP entry checksum is invalid.",
      );
    expanded += output.byteLength;
    if (expanded > CAD_LIMITS.exportBytes)
      throw new RendererError(
        "RESOURCE_LIMIT",
        "Expanded 3MF exceeds the byte budget.",
      );
    entries.push({ name, bytes: output });
    offset = end;
  }
  if (entries.length === 0 || offset !== centralOffset)
    throw new RendererError(
      "INVALID_ARTIFACT",
      "3MF ZIP local entry table is inconsistent.",
    );
  return entries;
}
