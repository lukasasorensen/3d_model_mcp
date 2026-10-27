import { type Triangle } from "../artifact.types.js";
import { RendererError } from "./rendererError.util.js";

export function coordinateKey(
  vertex: readonly [number, number, number],
): string {
  return vertex
    .map((value) => (Object.is(value, -0) ? "0" : value.toString()))
    .join(",");
}

/** Bounded exact-topology audit: every triangle has area and every edge is shared twice with opposite orientation. */
export function assertClosedOrientedManifold(
  vertices: Array<[number, number, number]>,
  triangles: readonly Triangle[],
): void {
  const edges = new Map<string, { count: number; balance: number }>();
  for (const [aIndex, bIndex, cIndex] of triangles) {
    const a = vertices[aIndex];
    const b = vertices[bIndex];
    const c = vertices[cIndex];
    if (!a || !b || !c)
      throw new RendererError(
        "INVALID_ARTIFACT",
        "Mesh triangle references an invalid vertex.",
      );
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cross = [
      ab[1]! * ac[2]! - ab[2]! * ac[1]!,
      ab[2]! * ac[0]! - ab[0]! * ac[2]!,
      ab[0]! * ac[1]! - ab[1]! * ac[0]!,
    ];
    if (!cross.every(Number.isFinite) || cross.every((value) => value === 0))
      throw new RendererError(
        "INVALID_ARTIFACT",
        "Mesh contains a degenerate triangle.",
      );
    for (const [fromIndex, toIndex] of [
      [aIndex, bIndex],
      [bIndex, cIndex],
      [cIndex, aIndex],
    ] as const) {
      const from = coordinateKey(vertices[fromIndex]!);
      const to = coordinateKey(vertices[toIndex]!);
      if (from === to)
        throw new RendererError(
          "INVALID_ARTIFACT",
          "Mesh contains a collapsed edge.",
        );
      const forward = from < to;
      const key = forward ? `${from}|${to}` : `${to}|${from}`;
      const edge = edges.get(key) ?? { count: 0, balance: 0 };
      edge.count += 1;
      edge.balance += forward ? 1 : -1;
      if (edge.count > 2)
        throw new RendererError(
          "INVALID_ARTIFACT",
          "Mesh contains a non-manifold edge.",
        );
      edges.set(key, edge);
    }
  }
  if (
    [...edges.values()].some((edge) => edge.count !== 2 || edge.balance !== 0)
  )
    throw new RendererError(
      "INVALID_ARTIFACT",
      "Mesh is open, non-manifold, or inconsistently oriented.",
    );
}
