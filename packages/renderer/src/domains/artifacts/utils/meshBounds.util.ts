import { type ParsedMesh } from "../artifact.types.js";
import { RendererError } from "./rendererError.util.js";

export function checkedBounds(
  vertices: Array<[number, number, number]>,
): ParsedMesh["boundingBox"] {
  if (vertices.length === 0)
    throw new RendererError(
      "INVALID_ARTIFACT",
      "Artifact contains no vertices.",
    );
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const vertex of vertices) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = vertex[axis];
      if (value === undefined || !Number.isFinite(value))
        throw new RendererError(
          "INVALID_ARTIFACT",
          "Artifact contains a non-finite coordinate.",
        );
      min[axis] = Math.min(min[axis] ?? Infinity, value);
      max[axis] = Math.max(max[axis] ?? -Infinity, value);
    }
  }
  return { min, max };
}
