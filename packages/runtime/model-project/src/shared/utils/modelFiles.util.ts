import {
  canonicalModelFiles,
  visibleModelObjectIds,
  modelFilesSchema,
  objectTransformIsIdentity,
  type ModelFiles,
} from "@theoryfoundry/contracts";
import { CadDomainError } from "./cadDomainError.util.js";
import { parameterTokens } from "./parameterTokens.util.js";
import {
  assertSourceByteSize,
  assertSourcePolicy,
} from "./sourcePolicy.util.js";

export function checkedModelFiles(raw: unknown): ModelFiles {
  const parsed = modelFilesSchema.safeParse(raw);
  if (!parsed.success)
    throw new CadDomainError(
      "INVALID_MODEL_FILES",
      "Invalid model files or composition.",
      { reason: parsed.error.issues[0]!.message.slice(0, 200) },
    );
  return canonicalModelFiles(parsed.data);
}

/** Frozen v1 assembly: one scoped union per object, explicit CSG operand order. */
export function assembleModelFiles(
  snapshot: ModelFiles,
  headerBytes = 0,
): string {
  const files = new Map(
    snapshot.files.map((file) => [
      file.id,
      { body: file.body, bytes: Buffer.byteLength(file.body) },
    ]),
  );
  const objects = new Map(
    snapshot.objects.map((object) => [object.id, object]),
  );
  const ids =
    snapshot.version === 1
      ? snapshot.composition.objectIds
      : visibleModelObjectIds(snapshot);
  const opening = `${ids.length ? snapshot.composition.operation : "union"}() {\n`;
  const closing = "\n}";
  const parts = [opening];
  let bytes =
    headerBytes + Buffer.byteLength(opening) + Buffer.byteLength(closing);
  for (const [index, id] of ids.entries()) {
    const object = objects.get(id)!;
    const file = files.get(object.fileId)!;
    const transform = object.transform;
    const transformPrefix =
      transform && !objectTransformIsIdentity(transform)
        ? `translate(${JSON.stringify(transform.position)}) rotate(${JSON.stringify(transform.rotation)}) scale(${JSON.stringify(transform.scale)}) `
        : "";
    const operandOpening = `${index ? "\n" : ""}${transformPrefix}union() {\n`;
    bytes +=
      Buffer.byteLength(operandOpening) +
      file.bytes +
      Buffer.byteLength(closing);
    parts.push(operandOpening, file.body, closing);
  }
  assertSourceByteSize(bytes);
  parts.push(closing);
  return parts.join("");
}

function assertStorageText(value: string, fileId: string, field: string): void {
  // In Unicode mode a valid surrogate pair is a single code point outside this range.
  if (value.includes("\0") || /[\uD800-\uDFFF]/u.test(value))
    throw new CadDomainError(
      "INVALID_MODEL_FILES",
      "Invalid model file text.",
      {
        fileId,
        reason: `${field} must contain valid Unicode text without NUL characters.`,
      },
    );
}

/** PostgreSQL JSONB and local project files share the same proposal text rules. */
export function assertModelFileStorageText(snapshot: ModelFiles): void {
  for (const object of snapshot.objects)
    assertStorageText(object.name, object.fileId, "Object name");
  for (const file of snapshot.files) {
    assertStorageText(file.name, file.id, "File name");
    assertStorageText(file.body, file.id, "File body");
  }
}

/** Files cannot escape their object scope or load files outside the snapshot. */
export function assertModelFiles(snapshot: ModelFiles): void {
  if (snapshot.version === 2 && visibleModelObjectIds(snapshot).length === 0)
    throw new CadDomainError(
      "INVALID_MODEL_FILES",
      "Keep at least one object visible and keep the original difference base visible. Empty models cannot be validated or exported.",
    );
  for (const file of snapshot.files) {
    assertSourcePolicy(file.body);
    try {
      const stack: string[] = [];
      for (const token of parameterTokens(file.body)) {
        if (
          token.kind === "identifier" &&
          ["include", "use"].includes(token.text)
        )
          throw new Error(
            "Model files must be self-contained; include/use directives, including BOSL2 imports, cannot be nested in object scopes.",
          );
        if (token.kind !== "punctuation") continue;
        if (["{", "(", "["].includes(token.text)) stack.push(token.text);
        const opening = (
          { "}": "{", ")": "(", "]": "[" } as Record<string, string>
        )[token.text];
        if (opening && stack.pop() !== opening)
          throw new Error("Unbalanced file delimiters.");
      }
      if (stack.length) throw new Error("Unbalanced file delimiters.");
    } catch (error) {
      throw new CadDomainError(
        "INVALID_MODEL_FILES",
        "Invalid model file body.",
        {
          fileId: file.id,
          reason: error instanceof Error ? error.message : "Invalid source.",
        },
      );
    }
  }
}

export function modelFilesEqual(
  left: ModelFiles | undefined,
  right: ModelFiles | undefined,
): boolean {
  return (
    JSON.stringify(left && canonicalModelFiles(left)) ===
    JSON.stringify(right && canonicalModelFiles(right))
  );
}
