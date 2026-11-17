/** Extract source text only from bounded model documents and file operations for redaction. */
export function modelSourceTexts(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") return [];
  const value = raw as Record<string, unknown>;
  const model =
    value.model && typeof value.model === "object"
      ? (value.model as Record<string, unknown>)
      : value;
  const texts = [model.source, model.modelBody].filter(
    (value): value is string => typeof value === "string",
  );
  const collectFile = (file: unknown): void => {
    if (
      file &&
      typeof file === "object" &&
      "body" in file &&
      typeof file.body === "string"
    )
      texts.push(file.body);
  };
  collectFile(model.file);
  const snapshot = model.modelFiles;
  if (
    snapshot &&
    typeof snapshot === "object" &&
    "files" in snapshot &&
    Array.isArray(snapshot.files)
  ) {
    for (const file of snapshot.files) collectFile(file);
  }
  if (Array.isArray(model.operations)) {
    for (const operation of model.operations) {
      if (!operation || typeof operation !== "object") continue;
      if (operation.op === "create_file") collectFile(operation.file);
      if (operation.op === "update_file") collectFile(operation);
    }
  }
  return texts;
}
