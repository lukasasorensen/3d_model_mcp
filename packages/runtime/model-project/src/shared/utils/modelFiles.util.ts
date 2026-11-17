import {
  canonicalModelFiles,
  visibleModelObjectIds,
  modelFilesSchema,
  objectTransformIsIdentity,
  type ModelFiles,
} from "@theoryfoundry/contracts";
import { CadDomainError } from "./cadDomainError.util.js";
import { parameterTokens } from "./parameterTokens.util.js";
import { assertSourcePolicy } from "./sourcePolicy.util.js";

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
export function assembleModelFiles(snapshot: ModelFiles): string {
  const files = new Map(snapshot.files.map((file) => [file.id, file.body]));
  const objects = new Map(
    snapshot.objects.map((object) => [object.id, object]),
  );
  const ids =
    snapshot.version === 1
      ? snapshot.composition.objectIds
      : visibleModelObjectIds(snapshot);
  if (ids.length === 0) return "union() {\n\n}";
  const operands = ids.map((id) => {
    const object = objects.get(id)!;
    const source = `union() {\n${files.get(object.fileId)!}\n}`;
    const transform = object.transform;
    if (!transform || objectTransformIsIdentity(transform)) return source;
    return `translate(${JSON.stringify(transform.position)}) rotate(${JSON.stringify(transform.rotation)}) scale(${JSON.stringify(transform.scale)}) ${source}`;
  });
  return `${snapshot.composition.operation}() {\n${operands.join("\n")}\n}`;
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
            "Model files must be self-contained; compose objects through fileId references.",
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
