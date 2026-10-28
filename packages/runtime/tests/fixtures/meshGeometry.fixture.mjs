export function quad(triangles, a, b, c, d) {
  triangles.push([a, b, c], [a, c, d]);
}

export function horizontalAxis(min, max) {
  const values = [min, min + 0.5];
  for (let value = min + 1.5; value < max; value += 1) values.push(value);
  values.push(max);
  return values;
}

export function geometry(source) {
  const width = /width\s*=\s*100\s*;/.test(source) ? 100 : 80;
  const holeX = width === 100 ? 35 : 25;
  const xs = [
    ...new Set([...horizontalAxis(-width / 2, width / 2), -38, -32, 32, 38]),
  ]
    .filter((value) => value >= -width / 2 && value <= width / 2)
    .sort((a, b) => a - b);
  const ys = horizontalAxis(-20, 20);
  const zs = [0, 6, ...Array.from({ length: 40 }, (_, index) => index + 7)];
  const occupied = new Set();
  const key = (x, y, z) => `${x}:${y}:${z}`;
  const hasGussets = /gusset\(-35\).*gusset\(35\)/s.test(source);

  for (let x = 0; x < xs.length - 1; x += 1) {
    for (let y = 0; y < ys.length - 1; y += 1) {
      for (let z = 0; z < zs.length - 1; z += 1) {
        const centerX = (xs[x] + xs[x + 1]) / 2;
        const centerY = (ys[y] + ys[y + 1]) / 2;
        const inHole = [-holeX, holeX].some(
          (center) => Math.hypot(centerX - center, centerY) < 2.5,
        );
        const base = zs[z + 1] <= 6 && !inHole;
        const upright = zs[z] >= 6 && centerY >= 14;
        const gusset =
          hasGussets &&
          [-35, 35].some((center) => Math.abs(centerX - center) < 3) &&
          zs[z] >= 6 &&
          zs[z] < 26 &&
          ys[y] < 14 &&
          ys[y + 1] > zs[z] - 12;
        if (base || upright || gusset) occupied.add(key(x, y, z));
      }
    }
  }

  const triangles = [];
  for (const entry of occupied) {
    const [x, y, z] = entry.split(":").map(Number);
    const [x0, x1] = [xs[x], xs[x + 1]];
    const [y0, y1] = [ys[y], ys[y + 1]];
    const [z0, z1] = [zs[z], zs[z + 1]];
    if (!occupied.has(key(x - 1, y, z)))
      quad(triangles, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]);
    if (!occupied.has(key(x + 1, y, z)))
      quad(triangles, [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]);
    if (!occupied.has(key(x, y - 1, z)))
      quad(triangles, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);
    if (!occupied.has(key(x, y + 1, z)))
      quad(triangles, [x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]);
    if (!occupied.has(key(x, y, z - 1)))
      quad(triangles, [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]);
    if (!occupied.has(key(x, y, z + 1)))
      quad(triangles, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]);
  }
  return triangles;
}
