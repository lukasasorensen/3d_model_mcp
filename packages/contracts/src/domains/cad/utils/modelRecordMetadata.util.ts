/** Body text belongs in source reads, not mutation metadata responses. */
export function modelRecordMetadata<
  T extends { modelBody?: string | undefined },
>(record: T): Omit<T, "modelBody"> {
  const { modelBody, ...metadata } = record;
  void modelBody;
  return metadata;
}
