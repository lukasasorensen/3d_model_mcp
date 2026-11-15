import {
  canonicalParameterSnapshot,
  parameterSnapshotSchema,
  type ProjectParameter,
} from "@theoryfoundry/contracts";
import { CadDomainError } from "./cadDomainError.util.js";
import { assertParameterBody } from "./parameterBody.util.js";
import { assertSourcePolicy } from "./sourcePolicy.util.js";

export const PARAMETER_HEADER_START = "// theoryfoundry:parameters:start v1";
export const PARAMETER_HEADER_END = "// theoryfoundry:parameters:end";

export function checkedParameterSnapshot(raw: unknown): ProjectParameter[] {
  const parsed = parameterSnapshotSchema.safeParse(
    raw === undefined ? [] : raw,
  );
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    throw invalidParameters(
      `parameters${issue.path.map((part) => `.${String(part)}`).join("")}: ${issue.message}`,
    );
  }
  return canonicalParameterSnapshot(parsed.data);
}

/** Structured parameters own declarations; the editable body is never rewritten. */
export function assembleModelSource(
  modelBody: string,
  parameters: ProjectParameter[],
): string {
  const declarations = parameters.map(
    (parameter) => `${parameter.binding} = ${encodeLiteral(parameter.value)};`,
  );
  return declarations.length
    ? `${PARAMETER_HEADER_START}\n${declarations.join("\n")}\n${PARAMETER_HEADER_END}\n${modelBody}`
    : modelBody;
}

export function resolveModelDocument(
  input: {
    source?: string | undefined;
    modelBody?: string | undefined;
    parameters?: unknown;
  },
  inherited: unknown,
): { source: string; modelBody?: string; parameters: ProjectParameter[] } {
  if ((input.source === undefined) === (input.modelBody === undefined))
    throw invalidParameters("Supply exactly one of source or modelBody.");
  const previous = checkedParameterSnapshot(inherited);
  const parameters =
    input.parameters === undefined
      ? previous
      : checkedParameterSnapshot(input.parameters);
  assertRenderableParameters(parameters);
  if (input.modelBody === undefined) {
    if (parameters.length)
      throw invalidParameters(
        "Parameterized proposals require a separate modelBody.",
      );
    assertSourcePolicy(input.source!);
    assertParameterBody(input.source!, parameters, previous);
    return { source: input.source!, parameters };
  }
  if (typeof input.modelBody !== "string" || !input.modelBody.length)
    throw invalidParameters("modelBody must be a nonempty string.");
  const source = assembleModelSource(input.modelBody, parameters);
  assertSourcePolicy(source);
  assertParameterBody(input.modelBody, parameters, previous);
  return { source, modelBody: input.modelBody, parameters };
}

/** Reassembly verifies persisted body/metadata without parsing generated headers. */
export function checkedStoredModelDocument(
  source: string,
  modelBody: string | undefined,
  raw: unknown,
): ProjectParameter[] {
  const parameters = checkedParameterSnapshot(raw);
  if (
    modelBody !== undefined &&
    assembleModelSource(modelBody, parameters) !== source
  )
    throw new CadDomainError(
      "CORRUPT_PROJECT",
      "Stored source disagrees with its body and parameters.",
    );
  return parameters;
}

// The pinned OpenSCAD lexer rejects subnormal literals. Apply this only to new
// proposals: historical documents retain their v1 bytes and remain readable.
function assertRenderableParameters(parameters: ProjectParameter[]): void {
  parameters.forEach((parameter, index) => {
    const values: [string, unknown][] = [
      ["value", parameter.value],
      ["defaultValue", parameter.defaultValue],
    ];
    if (parameter.type === "enum")
      parameter.options.forEach((option, optionIndex) =>
        values.push([`options.${optionIndex}.value`, option.value]),
      );
    for (const [path, value] of values)
      if (
        typeof value === "number" &&
        value !== 0 &&
        Math.abs(value) < 2.2250738585072014e-308
      )
        throw invalidParameters(
          `parameters.${index}.${path}: Nonzero magnitudes below 2.2250738585072014e-308 are unsupported by the pinned OpenSCAD lexer.`,
        );
  });
}

function encodeLiteral(value: string | number | boolean): string {
  if (typeof value !== "string") return String(value);
  let encoded = '"';
  const escapes: Record<string, string> = {
    '"': '\\"',
    "\\": "\\\\",
    "\n": "\\n",
    "\r": "\\r",
    "\t": "\\t",
  };
  for (const character of value) {
    if (character.charCodeAt(0) < 32 && !(character in escapes))
      throw invalidParameters(
        "String values contain an unsupported control character.",
      );
    encoded += escapes[character] ?? character;
  }
  return `${encoded}"`;
}

function invalidParameters(reason: string): CadDomainError {
  return new CadDomainError(
    "INVALID_PARAMETERS",
    "Invalid parameters or model body.",
    { reason: reason.slice(0, 200) },
  );
}
