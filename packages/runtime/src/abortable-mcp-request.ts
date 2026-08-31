/** Bound transport waits while propagating cancellation into the domain operation. */
export async function awaitMcpOperation<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  let onAbort: () => void = () => undefined;
  const interrupted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(new DOMException("MCP request cancelled", "AbortError"));
    if (signal.aborted) onAbort(); else signal.addEventListener("abort", onAbort, { once: true });
  });
  try { return await Promise.race([operation, interrupted]); }
  finally { signal.removeEventListener("abort", onAbort); }
}
