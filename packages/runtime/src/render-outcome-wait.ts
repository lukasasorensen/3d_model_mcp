import type { ProjectChangeSource } from "@rjls/model-project";

/** Subscribe before reading, retain wakeups during reads, and recheck at persisted deadlines. */
export async function waitForRenderOutcome<T>(options: {
  changes: ProjectChangeSource; ownerId: string; jobId: string; signal?: AbortSignal;
  read: () => Promise<{ result?: T; deadline: number }>;
}): Promise<T> {
  let dirty = true;
  let wake: (() => void) | undefined;
  const notify = () => { dirty = true; wake?.(); };
  const unsubscribe = await options.changes.subscribe((event) => {
    if (!event || (event.ownerId === options.ownerId && event.jobId === options.jobId)) notify();
  });
  options.signal?.addEventListener("abort", notify);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    for (;;) {
      options.signal?.throwIfAborted();
      dirty = false;
      const state = await options.read();
      if (state.result !== undefined) return state.result;
      if (dirty) continue;
      await new Promise<void>((resolve) => {
        wake = resolve;
        timer = setTimeout(resolve, Math.max(0, state.deadline - Date.now()));
        if (dirty || options.signal?.aborted) resolve();
      });
      clearTimeout(timer); wake = undefined;
    }
  } finally {
    clearTimeout(timer); unsubscribe(); options.signal?.removeEventListener("abort", notify);
  }
}
