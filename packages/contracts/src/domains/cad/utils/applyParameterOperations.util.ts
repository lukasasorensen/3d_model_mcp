import * as z from "zod/v4";
import type { ProjectParameter } from "../parameter.schema.js";
import type { ParameterOperation } from "../parameterOperations.schema.js";
import { canonicalParameterSnapshot } from "./parameterSnapshot.util.js";

/** Transform one immutable parent snapshot; validate bindings after the entire batch. */
export function applyParameterOperations(
  parameters: readonly ProjectParameter[],
  operations: readonly ParameterOperation[],
): ProjectParameter[] {
  const result = new Map<string, unknown>(
    parameters.map((parameter) => [parameter.id, parameter]),
  );
  const seen = new Set<string>();
  operations.forEach((operation, index) => {
    const id = "parameter" in operation ? operation.parameter.id : operation.id;
    const previous = parameters.find((parameter) => parameter.id === id);
    const message = seen.has(id)
      ? "Each parameter ID may be targeted only once per batch."
      : operation.op === "create"
        ? previous
          ? "Parameter ID already exists."
          : undefined
        : previous
          ? undefined
          : "Parameter ID does not exist.";
    if (message)
      throw new z.ZodError([
        { code: "custom", message, path: ["operations", index] },
      ]);
    seen.add(id);
    if (operation.op === "delete") result.delete(id);
    else if (operation.op === "set_value")
      result.set(id, { ...previous, value: operation.value });
    else result.set(id, operation.parameter);
  });
  const entries = [...result.entries()];
  try {
    return canonicalParameterSnapshot(
      entries.map(([, parameter]) => parameter),
    );
  } catch (error) {
    if (!(error instanceof z.ZodError)) throw error;
    // Identify the definition, not an index into the separately ordered edit batch.
    throw new z.ZodError(
      error.issues.map((issue) => ({
        ...issue,
        path:
          typeof issue.path[0] === "number"
            ? ["parameters", entries[issue.path[0]]![0], ...issue.path.slice(1)]
            : ["parameters", ...issue.path],
      })),
    );
  }
}
