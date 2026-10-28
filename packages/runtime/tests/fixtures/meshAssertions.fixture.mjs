import assert from "node:assert/strict";
export function meshVertices(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(80, true);
  const vertices = [];
  for (let triangle = 0; triangle < count; triangle += 1) {
    const offset = 84 + triangle * 50 + 12;
    for (let vertex = 0; vertex < 3; vertex += 1) {
      const vertexOffset = offset + vertex * 12;
      vertices.push([
        view.getFloat32(vertexOffset, true),
        view.getFloat32(vertexOffset + 4, true),
        view.getFloat32(vertexOffset + 8, true),
      ]);
    }
  }
  return vertices;
}

export function meshConnectedComponents(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(80, true);
  const edgeTriangles = new Map();
  const neighbors = Array.from({ length: count }, () => new Set());
  const point = (offset) =>
    `${view.getFloat32(offset, true)},${view.getFloat32(offset + 4, true)},${view.getFloat32(offset + 8, true)}`;

  for (let triangle = 0; triangle < count; triangle += 1) {
    const offset = 84 + triangle * 50 + 12;
    const vertices = [point(offset), point(offset + 12), point(offset + 24)];
    for (let edge = 0; edge < 3; edge += 1) {
      const pair = [vertices[edge], vertices[(edge + 1) % 3]].sort().join("|");
      const prior = edgeTriangles.get(pair);
      if (prior === undefined) {
        edgeTriangles.set(pair, triangle);
      } else {
        neighbors[triangle].add(prior);
        neighbors[prior].add(triangle);
      }
    }
  }

  let components = 0;
  const seen = new Set();
  for (let start = 0; start < count; start += 1) {
    if (seen.has(start)) continue;
    components += 1;
    const pending = [start];
    seen.add(start);
    while (pending.length > 0) {
      const current = pending.pop();
      for (const next of neighbors[current]) {
        if (seen.has(next)) continue;
        seen.add(next);
        pending.push(next);
      }
    }
  }
  return components;
}

export function assertThroughHoles(bytes, expectedCenters) {
  const vertices = meshVertices(bytes);
  for (const centerX of expectedCenters) {
    const wall = vertices.filter(
      ([x, y, z]) =>
        Math.abs(x - centerX) <= 2.5 &&
        Math.abs(y) <= 2.5 &&
        (Math.abs(z) < 0.001 || Math.abs(z - 6) < 0.001),
    );
    assert.equal(
      Math.max(...wall.map(([x]) => x)) - Math.min(...wall.map(([x]) => x)),
      5,
    );
    assert.equal(
      Math.max(...wall.map(([, y]) => y)) - Math.min(...wall.map(([, y]) => y)),
      5,
    );
  }
  assert.equal(
    expectedCenters[1] - expectedCenters[0],
    Math.abs(expectedCenters[0]) * 2,
  );
}

export function meshContainsPoint(bytes, origin) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(80, true);
  const direction = [1, 0.123, 0.057];
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const subtract = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  let intersections = 0;

  for (let triangle = 0; triangle < count; triangle += 1) {
    const offset = 84 + triangle * 50 + 12;
    const points = [];
    for (let vertex = 0; vertex < 3; vertex += 1) {
      const vertexOffset = offset + vertex * 12;
      points.push([
        view.getFloat32(vertexOffset, true),
        view.getFloat32(vertexOffset + 4, true),
        view.getFloat32(vertexOffset + 8, true),
      ]);
    }
    const edge1 = subtract(points[1], points[0]);
    const edge2 = subtract(points[2], points[0]);
    const h = cross(direction, edge2);
    const determinant = dot(edge1, h);
    if (Math.abs(determinant) < 1e-9) continue;
    const inverse = 1 / determinant;
    const offsetFromVertex = subtract(origin, points[0]);
    const u = inverse * dot(offsetFromVertex, h);
    if (u < 0 || u > 1) continue;
    const q = cross(offsetFromVertex, edge1);
    const v = inverse * dot(direction, q);
    if (v < 0 || u + v > 1) continue;
    if (inverse * dot(edge2, q) > 1e-7) intersections += 1;
  }
  return intersections % 2 === 1;
}

export function hasGussetMesh(bytes, centerX) {
  return (
    meshContainsPoint(bytes, [centerX, -5, 6.5]) &&
    meshContainsPoint(bytes, [centerX, 13, 25]) &&
    meshContainsPoint(bytes, [centerX, 8, 15]) &&
    !meshContainsPoint(bytes, [centerX, 0, 20]) &&
    !meshContainsPoint(bytes, [centerX + 3.1, 8, 15])
  );
}

export function signedVolume(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    count = view.getUint32(80, true);
  let volume = 0;
  for (let i = 0; i < count; i += 1) {
    const o = 84 + i * 50 + 12,
      p = [];
    for (let v = 0; v < 3; v += 1)
      p.push([
        view.getFloat32(o + v * 12, true),
        view.getFloat32(o + v * 12 + 4, true),
        view.getFloat32(o + v * 12 + 8, true),
      ]);
    volume +=
      (p[0][0] * (p[1][1] * p[2][2] - p[1][2] * p[2][1]) -
        p[0][1] * (p[1][0] * p[2][2] - p[1][2] * p[2][0]) +
        p[0][2] * (p[1][0] * p[2][1] - p[1][1] * p[2][0])) /
      6;
  }
  return Math.abs(volume);
}
