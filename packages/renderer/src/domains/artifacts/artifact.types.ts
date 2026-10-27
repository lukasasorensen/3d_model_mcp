export interface ParsedMesh {
  triangleCount: number;
  boundingBox: { min: [number, number, number]; max: [number, number, number] };
}

export type Triangle = readonly [number, number, number];

export interface ZipEntry {
  name: string;
  bytes: Uint8Array;
}

export interface CentralZipEntry {
  name: string;
  flags: number;
  method: number;
  crc: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
}
