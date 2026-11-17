/** Extract source text only from bounded model documents for response redaction. */
export function modelSourceTexts(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") return [];
  const model = raw as Record<string, unknown>;
  const texts = [model.source, model.modelBody].filter(
    (value): value is string => typeof value === "string",
  );
  const snapshot = model.modelFiles;
  if (
    snapshot &&
    typeof snapshot === "object" &&
    "files" in snapshot &&
    Array.isArray(snapshot.files)
  ) {
    for (const file of snapshot.files)
      if (
        file &&
        typeof file === "object" &&
        "body" in file &&
        typeof file.body === "string"
      )
        texts.push(file.body);
  }
  return texts;
}
