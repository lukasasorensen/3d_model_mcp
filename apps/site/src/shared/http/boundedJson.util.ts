export class RequestBodyTooLargeError extends Error {
  constructor() {
    super("Request exceeds the byte limit.");
    this.name = "RequestBodyTooLargeError";
  }
}

export async function readBoundedJson(
  request: Request,
  maxBytes: number,
): Promise<unknown> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength))
      throw new SyntaxError("Invalid Content-Length.");
    if (Number(declaredLength) > maxBytes) throw new RequestBodyTooLargeError();
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
      if (byteLength > maxBytes) throw new RequestBodyTooLargeError();
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
