import type { DownloadFormat } from "./rendering.types.js";
export const DOWNLOAD_MIME_TYPES: Readonly<Record<DownloadFormat, string>> =
  Object.freeze({
    stl: "model/stl",
    "3mf": "model/3mf",
    glb: "model/gltf-binary",
  });
