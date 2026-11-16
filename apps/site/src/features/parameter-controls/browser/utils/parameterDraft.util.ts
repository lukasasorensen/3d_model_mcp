import {
  projectParameterSchema,
  type ProjectParameter,
  type ApplyParameterValues,
} from "@theoryfoundry/contracts";

export type ParameterDraft = Record<string, string | boolean>;
export function parameterDraft(
  parameters: readonly ProjectParameter[],
  defaults = false,
): ParameterDraft {
  return Object.fromEntries(
    parameters.map((p) => [
      p.id,
      typeof p.value === "boolean"
        ? defaults
          ? p.defaultValue
          : p.value
        : String(defaults ? p.defaultValue : p.value),
    ]),
  );
}

export function validateParameterDraft(
  parameters: readonly ProjectParameter[],
  draft: ParameterDraft,
): {
  operations: ApplyParameterValues["operations"];
  errors: Record<string, string>;
  dirty: boolean;
} {
  const errors: Record<string, string> = Object.create(null) as Record<
    string,
    string
  >;
  const operations: ApplyParameterValues["operations"] = [];
  const accepted = parameterDraft(parameters);
  for (const p of parameters) {
    const raw = draft[p.id];
    let value: unknown = raw;
    if (
      p.type === "number" ||
      p.type === "integer" ||
      (p.type === "enum" && typeof p.value === "number")
    ) {
      // Decimal/exponent notation only; empty and incomplete drafts are never coerced.
      value =
        typeof raw === "string" &&
        /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw.trim())
          ? Number(raw)
          : NaN;
    }
    const parsed = projectParameterSchema.safeParse({ ...p, value });
    if (!parsed.success)
      errors[p.id] = parsed.error.issues[0]?.message ?? "Enter a valid value.";
    else if (parsed.data.value !== p.value)
      operations.push({ op: "set_value", id: p.id, value: parsed.data.value });
  }
  return {
    operations,
    errors,
    dirty: parameters.some((p) => draft[p.id] !== accepted[p.id]),
  };
}

export function reapplyParameterDraft(
  previous: readonly ProjectParameter[],
  draft: ParameterDraft,
  latest: readonly ProjectParameter[],
): { draft: ParameterDraft; conflicts: string[] } {
  const result = parameterDraft(latest);
  const original = parameterDraft(previous);
  const conflicts: string[] = [];
  for (const old of previous) {
    if (draft[old.id] === original[old.id]) continue;
    const next = latest.find((p) => p.id === old.id);
    const definition = (p: ProjectParameter): string => {
      const { value, ...rest } = p;
      void value;
      return JSON.stringify(rest);
    };
    if (!next || definition(old) !== definition(next))
      conflicts.push(old.label);
    else result[old.id] = draft[old.id]!;
  }
  return { draft: result, conflicts };
}
