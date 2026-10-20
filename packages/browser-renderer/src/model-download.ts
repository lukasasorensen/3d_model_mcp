import { CAD_LIMITS } from "@theoryfoundry/contracts";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { Group, Mesh, MeshStandardMaterial } from "three";
import type { createOpenScadRenderer } from "./open-scad-renderer.js";

export type DownloadFormat = "stl" | "3mf" | "glb";

export const DOWNLOAD_MIME_TYPES: Readonly<Record<DownloadFormat, string>> = Object.freeze({
  stl: "model/stl",
  "3mf": "model/3mf",
  glb: "model/gltf-binary",
});

function checkedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  if (bytes.byteLength === 0 || bytes.byteLength > CAD_LIMITS.exportBytes) throw new Error("Generated download exceeds the browser artifact limit.");
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function convertStlToGlb(stl: Uint8Array): Promise<Uint8Array> {
  const geometry = new STLLoader().parse(checkedArrayBuffer(stl));
  geometry.computeVertexNormals();
  const material = new MeshStandardMaterial({ color: "#dde5dd", roughness: 0.72, metalness: 0.05 });
  const mesh = new Mesh(geometry, material);
  const scene = new Group();
  scene.rotation.x = -Math.PI / 2;
  scene.scale.setScalar(0.001);
  scene.add(mesh);
  try {
    const output = await new GLTFExporter().parseAsync(scene, { binary: true, onlyVisible: true });
    if (!(output instanceof ArrayBuffer)) throw new Error("GLB generation returned an unexpected result.");
    return new Uint8Array(output);
  } finally {
    geometry.dispose();
    material.dispose();
  }
}

export function createDownloadRenderer(renderOpenScad: ReturnType<typeof createOpenScadRenderer>) {
  return async function generateDownload(source: string, format: DownloadFormat, signal?: AbortSignal): Promise<{ bytes: Uint8Array; mimeType: string; extension: DownloadFormat }> {
    if (format === "3mf") {
      const result = await renderOpenScad(source, "3mf", signal);
      checkedArrayBuffer(result.bytes);
      return { bytes: result.bytes, mimeType: DOWNLOAD_MIME_TYPES[format], extension: format };
    }
    const result = await renderOpenScad(source, "stl", signal);
    if (format === "stl") {
      checkedArrayBuffer(result.bytes);
      return { bytes: result.bytes, mimeType: DOWNLOAD_MIME_TYPES[format], extension: format };
    }
    const bytes = await convertStlToGlb(result.bytes);
    checkedArrayBuffer(bytes);
    return { bytes, mimeType: DOWNLOAD_MIME_TYPES[format], extension: format };
  };
}
