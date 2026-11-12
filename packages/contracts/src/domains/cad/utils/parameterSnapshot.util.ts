import {
  parameterSnapshotSchema,
  type ProjectParameter,
} from "../parameter.schema.js";

/** Empty legacy snapshots retain their original wire shape. */
export function parameterSnapshotFields(raw: unknown): {
  parameters?: ProjectParameter[];
} {
  const parameters = canonicalParameterSnapshot(raw);
  return parameters.length ? { parameters } : {};
}

export function parameterSnapshotsEqual(
  left: unknown,
  right: unknown,
): boolean {
  return (
    JSON.stringify(canonicalParameterSnapshot(left)) ===
    JSON.stringify(canonicalParameterSnapshot(right))
  );
}

export function canonicalParameterSnapshot(raw: unknown): ProjectParameter[] {
  return parameterSnapshotSchema
    .parse(raw === undefined ? [] : raw)
    .sort((left, right) =>
      left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
    );
}
