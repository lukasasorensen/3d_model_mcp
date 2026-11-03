export const PROJECT_CREATE_BODY_BYTES = 24 * 1024;

export class ProjectBodyTooLargeError extends Error {
  constructor() {
    super("Project request exceeds the byte limit.");
    this.name = "ProjectBodyTooLargeError";
  }
}

export async function readProjectRequestBody(
  request: Request,
): Promise<unknown> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength))
      throw new SyntaxError("Invalid Content-Length.");
    if (Number(declaredLength) > PROJECT_CREATE_BODY_BYTES)
      throw new ProjectBodyTooLargeError();
  }

  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError("Missing request body.");
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > PROJECT_CREATE_BODY_BYTES)
        throw new ProjectBodyTooLargeError();
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }

  const body = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(body),
  ) as unknown;
}
