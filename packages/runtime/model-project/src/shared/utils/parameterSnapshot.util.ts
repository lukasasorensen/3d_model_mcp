import {
  canonicalParameterSnapshot,
  type ProjectParameter,
} from "@theoryfoundry/contracts";
import { CadDomainError } from "./cadDomainError.util.js";
import { parameterTokens } from "./parameterTokens.util.js";
import { assertSourcePolicy } from "./sourcePolicy.util.js";

export const PARAMETER_HEADER_START = "// theoryfoundry:parameters:start v1";
export const PARAMETER_HEADER_END = "// theoryfoundry:parameters:end";

export function checkedParameterSnapshot(raw: unknown): ProjectParameter[] {
  try {
    return canonicalParameterSnapshot(raw);
  } catch (error) {
    throw invalidParameters(
      error instanceof Error ? error.message : "Invalid parameter snapshot.",
    );
  }
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
  const parameters = checkedParameterSnapshot(
    input.parameters === undefined ? inherited : input.parameters,
  );
  if (input.modelBody === undefined) {
    if (parameters.length)
      throw invalidParameters(
        "Parameterized proposals require a separate modelBody.",
      );
    assertSourcePolicy(input.source!);
    return { source: input.source!, parameters };
  }
  if (typeof input.modelBody !== "string" || !input.modelBody.length)
    throw invalidParameters("modelBody must be a nonempty string.");
  assertBodyBindings(input.modelBody, parameters);
  const source = assembleModelSource(input.modelBody, parameters);
  assertSourcePolicy(source);
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

function assertBodyBindings(
  body: string,
  parameters: ProjectParameter[],
): void {
  // Conservative body conflict guard, not a parser/editor for generated headers.
  if (!parameters.length) return;
  try {
    const tokens = parameterTokens(body);
    if (
      tokens.some(
        (token) =>
          token.kind === "comment" &&
          token.text.startsWith("// theoryfoundry:parameters:"),
      )
    )
      throw new Error("modelBody must not contain a managed parameter header.");
    const code = tokens.filter((token) => token.kind !== "comment");
    const bindings = new Set(parameters.map((parameter) => parameter.binding));
    for (let index = 0; index < code.length; index++)
      if (
        code[index]?.kind === "identifier" &&
        bindings.has(code[index]!.text) &&
        code[index + 1]?.text === "=" &&
        code[index + 2]?.text !== "="
      )
        throw new Error(
          `Conflicting assignment to ${code[index]!.text} in modelBody.`,
        );
  } catch (error) {
    throw invalidParameters(
      error instanceof Error ? error.message : "Invalid model body.",
    );
  }
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
