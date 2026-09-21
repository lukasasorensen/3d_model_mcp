import type { GeometrySummary } from "@rjls/contracts";
export function summarizeStl(bytes: Uint8Array): GeometrySummary {
    const invalid = () => Object.assign(new Error("Invalid binary STL geometry."), { failureKind: "model" });
    if (bytes.byteLength < 84)
        throw invalid();
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), count = view.getUint32(80, true);
    if (!count || count > 250000 || 84 + 50 * count !== bytes.byteLength)
        throw invalid();
    const min: [
        number,
        number,
        number
    ] = [Infinity, Infinity, Infinity], max: [
        number,
        number,
        number
    ] = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < count; i++)
        for (let v = 0; v < 3; v++)
            for (let axis = 0; axis < 3; axis++) {
                const value = view.getFloat32(84 + i * 50 + 12 + v * 12 + axis * 4, true);
                if (!Number.isFinite(value))
                    throw invalid();
                min[axis] = Math.min(min[axis], value);
                max[axis] = Math.max(max[axis], value);
            }
    return { units: "mm", triangleCount: count, bounds: { min, max }, dimensions: [max[0] - min[0], max[1] - min[1], max[2] - min[2]], checks: ["binary-stl-length", "finite-coordinates", "nonempty-mesh"], scope: "geometry-only" };
}
