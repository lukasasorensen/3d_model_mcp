/** Bound this caller's wait without cancelling the shared workspace refresh. */
export function waitForParameterRefresh(
  refresh: () => Promise<boolean>,
  signal: AbortSignal,
): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const finish = (result: boolean): void => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", cancel);
      resolve(result);
    };
    const cancel = (): void => finish(false);
    const timeout = setTimeout(cancel, 15_000);
    signal.addEventListener("abort", cancel, { once: true });
    void Promise.resolve().then(refresh).then(finish, cancel);
  });
}
