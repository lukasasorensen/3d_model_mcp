import { WORKER_VALIDATION_LIMITS } from "@theoryfoundry/contracts";
export async function readWorkerBody(
  request: Request,
  maxBytes: number,
  readMs: number,
): Promise<Buffer> {
  const announced = request.headers.get("content-length");
  if (
    announced !== null &&
    (!/^\d+$/.test(announced) || Number(announced) > maxBytes)
  )
    throw new RangeError("Worker request exceeds its limit.");
  if (!request.body) throw new SyntaxError("Request body is required.");
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(readMs)]);
  const reader = request.body.getReader();
  const abort = (): void => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", abort, { once: true });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new RangeError("Worker request exceeds its limit.");
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally {
    signal.removeEventListener("abort", abort);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export async function readWorkerRequest(request: Request): Promise<unknown> {
  return JSON.parse(
    (
      await readWorkerBody(
        request,
        WORKER_VALIDATION_LIMITS.requestBytes,
        10_000,
      )
    ).toString("utf8"),
  ) as unknown;
}
