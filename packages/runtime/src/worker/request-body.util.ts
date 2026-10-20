import { WORKER_VALIDATION_LIMITS } from "@theoryfoundry/contracts";

export async function readWorkerRequest(request: Request): Promise<unknown> {
  const announced = request.headers.get("content-length");
  if (announced !== null && (!/^\d+$/.test(announced) || Number(announced) > WORKER_VALIDATION_LIMITS.requestBytes)) throw new RangeError("Worker request exceeds its limit.");
  if (!request.body) throw new SyntaxError("JSON body is required.");
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]);
  const reader = request.body.getReader();
  const abort = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", abort, { once: true });
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > WORKER_VALIDATION_LIMITS.requestBytes) { await reader.cancel(); throw new RangeError("Worker request exceeds its limit."); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } finally { signal.removeEventListener("abort", abort); reader.releaseLock(); }
}
