import { CAD_LIMITS } from "@theoryfoundry/contracts";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { Group, Mesh, MeshStandardMaterial } from "three";

import type { DownloadFormat } from "../rendering.types.js";

import { DOWNLOAD_MIME_TYPES } from "../download.constants.js";
function checkedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  if (bytes.byteLength === 0 || bytes.byteLength > CAD_LIMITS.exportBytes)
    throw new Error("Generated download exceeds the browser artifact limit.");
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

async function convertStlToGlb(stl: Uint8Array): Promise<Uint8Array> {
  const geometry = new STLLoader().parse(checkedArrayBuffer(stl));
  geometry.computeVertexNormals();
  const material = new MeshStandardMaterial({
    color: "#dde5dd",
    roughness: 0.72,
    metalness: 0.05,
  });
  const mesh = new Mesh(geometry, material);
  const scene = new Group();
  scene.rotation.x = -Math.PI / 2;
  scene.scale.setScalar(0.001);
  scene.add(mesh);
  try {
    const output = await new GLTFExporter().parseAsync(scene, {
      binary: true,
      onlyVisible: true,
    });
    if (!(output instanceof ArrayBuffer))
      throw new Error("GLB generation returned an unexpected result.");
    return new Uint8Array(output);
  } finally {
    geometry.dispose();
    material.dispose();
  }
}

export async function encodeDownload(
  sourceBytes: Uint8Array,
  format: DownloadFormat,
): Promise<{
  bytes: Uint8Array<ArrayBufferLike>;
  mimeType: string;
  extension: DownloadFormat;
}> {
  const bytes =
    format === "stl" || format === "3mf"
      ? sourceBytes
      : await convertStlToGlb(sourceBytes);
  checkedArrayBuffer(bytes);
  return { bytes, mimeType: DOWNLOAD_MIME_TYPES[format], extension: format };
}
