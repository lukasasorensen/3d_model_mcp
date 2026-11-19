import {
  canonicalParameterSnapshot,
  parameterSnapshotSchema,
  type ProjectParameter,
  type ModelFiles,
} from "@theoryfoundry/contracts";
import {
  checkedModelFiles,
  assembleModelFiles,
  assertModelFiles,
  assertModelFileStorageText,
} from "./modelFiles.util.js";
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

/** Resolve immutable retry identity; validate new proposals after retry lookup. */
export function resolveModelDocument(
  input: {
    source?: string | undefined;
    modelBody?: string | undefined;
    parameters?: unknown;
    modelFiles?: ModelFiles | undefined;
  },
  inherited: unknown,
): {
  source: string;
  modelBody?: string;
  modelFiles?: ModelFiles;
  parameters: ProjectParameter[];
} {
  if (
    [input.source, input.modelBody, input.modelFiles].filter(
      (value) => value !== undefined,
    ).length !== 1
  )
    throw invalidParameters(
      "Supply exactly one of source, modelBody or modelFiles.",
    );
  const previous = checkedParameterSnapshot(inherited);
  const parameters =
    input.parameters === undefined
      ? previous
      : checkedParameterSnapshot(input.parameters);
  if (input.modelFiles !== undefined) {
    const modelFiles = checkedModelFiles(input.modelFiles);
    assertModelFileStorageText(modelFiles);
    const header = assembleModelSource("", parameters);
    const modelBody = assembleModelFiles(modelFiles, Buffer.byteLength(header));
    return {
      source: header + modelBody,
      modelBody,
      modelFiles,
      parameters,
    };
  }
  if (input.modelBody === undefined) {
    if (parameters.length)
      throw invalidParameters(
        "Parameterized proposals require a separate modelBody.",
      );
    return { source: input.source!, parameters };
  }
  if (typeof input.modelBody !== "string" || !input.modelBody.length)
    throw invalidParameters("modelBody must be a nonempty string.");
  const source = assembleModelSource(input.modelBody, parameters);
  return { source, modelBody: input.modelBody, parameters };
}

export function assertNewModelDocument(
  document: ReturnType<typeof resolveModelDocument>,
  inherited: unknown,
): void {
  if (document.modelFiles) {
    assertModelFiles(document.modelFiles);
    for (const file of document.modelFiles.files)
      assertParameterBody(
        file.body,
        document.parameters,
        checkedParameterSnapshot(inherited),
      );
  }
  assertRenderableParameters(document.parameters);
  assertSourcePolicy(document.source);
  assertParameterBody(
    document.modelBody ?? document.source,
    document.parameters,
    checkedParameterSnapshot(inherited),
  );
}

/** Assemble and check a preview with the same source rules as a new proposal. */
export function prepareModelDocument(
  input: Parameters<typeof resolveModelDocument>[0],
  inherited: unknown,
): ReturnType<typeof resolveModelDocument> {
  const document = resolveModelDocument(input, inherited);
  assertNewModelDocument(document, inherited);
  return document;
}

/** Reassembly verifies persisted body/metadata without parsing generated headers. */
export function checkedStoredModelDocument(
  source: string,
  modelBody: string | undefined,
  raw: unknown,
  modelFiles?: unknown,
): ProjectParameter[] {
  if (modelFiles !== undefined && modelFiles !== null) {
    try {
      if (assembleModelFiles(checkedModelFiles(modelFiles)) !== modelBody)
        throw new Error("assembly mismatch");
    } catch {
      throw new CadDomainError(
        "CORRUPT_PROJECT",
        "Stored files disagree with the assembled body.",
      );
    }
  }
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
  parameters.forEach((parameter) => {
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
          `${path}: Nonzero magnitudes below 2.2250738585072014e-308 are unsupported by the pinned OpenSCAD lexer.`,
          {
            parameterId: parameter.id,
            binding: parameter.binding,
            field: path,
          },
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

function invalidParameters(
  reason: string,
  details: Record<string, string> = {},
): CadDomainError {
  return new CadDomainError(
    "INVALID_PARAMETERS",
    "Invalid parameters or model body.",
    { reason: reason.slice(0, 200), ...details },
  );
}
