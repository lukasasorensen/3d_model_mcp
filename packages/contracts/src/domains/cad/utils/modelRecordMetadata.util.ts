/** Body text belongs in source reads, not mutation metadata responses. */
export function modelRecordMetadata<
  T extends { modelBody?: string | undefined; modelFiles?: unknown },
>(record: T): Omit<T, "modelBody" | "modelFiles"> {
  const { modelBody, modelFiles, ...metadata } = record;
  void modelBody;
  void modelFiles;
  return metadata;
}
