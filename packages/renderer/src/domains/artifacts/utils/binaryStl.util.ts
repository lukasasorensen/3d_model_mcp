import { type ParsedMesh, type Triangle } from "../artifact.types.js";
import { RendererError } from "./rendererError.util.js";
import { checkedBounds } from "./meshBounds.util.js";
import { assertClosedOrientedManifold } from "./meshTopology.util.js";
import { CAD_LIMITS } from "@theoryfoundry/contracts";

export function parseBinaryStl(bytes: Uint8Array): ParsedMesh {
  if (bytes.byteLength > CAD_LIMITS.previewBytes)
    throw new RendererError(
      "RESOURCE_LIMIT",
      "Preview exceeds the byte budget.",
    );
  if (bytes.byteLength < 84)
    throw new RendererError("INVALID_ARTIFACT", "Binary STL is truncated.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const triangleCount = view.getUint32(80, true);
  if (triangleCount === 0 || triangleCount > CAD_LIMITS.previewTriangles)
    throw new RendererError(
      "RESOURCE_LIMIT",
      "Preview triangle budget is invalid or exceeded.",
    );
  if (84 + triangleCount * 50 !== bytes.byteLength)
    throw new RendererError(
      "INVALID_ARTIFACT",
      "Binary STL length does not match its triangle table.",
    );
  const vertices: Array<[number, number, number]> = [];
  const triangles: Triangle[] = [];
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const base = 84 + triangle * 50 + 12;
    for (let vertex = 0; vertex < 3; vertex += 1) {
      const offset = base + vertex * 12;
      vertices.push([
        view.getFloat32(offset, true),
        view.getFloat32(offset + 4, true),
        view.getFloat32(offset + 8, true),
      ]);
    }
    const first = triangle * 3;
    triangles.push([first, first + 1, first + 2]);
  }
  const boundingBox = checkedBounds(vertices);
  assertClosedOrientedManifold(vertices, triangles);
  return { triangleCount, boundingBox };
}
