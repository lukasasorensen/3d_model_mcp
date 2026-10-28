import { HEADLESS_RENDER_LIMITS } from "@theoryfoundry/contracts";
import { LocalWorkerError } from "../../../shared/utils/workerError.util.js";
interface Work {
  start(): void;
  reject(error: unknown): void;
  signal: AbortSignal;
  remove(): void;
}
export class WorkQueue {
  private pending: Work[] = [];
  private active = false;
  private stopping = new AbortController();
  private idle: (() => void)[] = [];
  get busy(): boolean {
    return this.active;
  }
  run<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    signal: AbortSignal,
  ): Promise<T> {
    const queued = AbortSignal.any([signal, this.stopping.signal]);
    queued.throwIfAborted();
    if (this.pending.length >= HEADLESS_RENDER_LIMITS.queue)
      return Promise.reject(
        new LocalWorkerError(
          "WORKER_BUSY",
          "Local renderer queue is full; retry shortly.",
        ),
      );
    return new Promise<T>((resolve, reject) => {
      const cancel = (): void => {
        this.pending = this.pending.filter((value) => value !== work);
        work.remove();
        reject(queued.reason);
      };
      const work: Work = {
        signal: queued,
        reject,
        remove: () => queued.removeEventListener("abort", cancel),
        start: () => {
          work.remove();
          this.active = true;
          const active = AbortSignal.any([
            queued,
            AbortSignal.timeout(HEADLESS_RENDER_LIMITS.operationMs),
          ]);
          void Promise.resolve()
            .then(() => {
              active.throwIfAborted();
              return operation(active);
            })
            .then(resolve, reject)
            .finally(() => {
              this.active = false;
              this.next();
            });
        },
      };
      queued.addEventListener("abort", cancel, { once: true });
      this.pending.push(work);
      if (!this.active) this.next();
    });
  }
  private next(): void {
    const work = this.pending.shift();
    if (work) work.start();
    else if (!this.active) this.idle.splice(0).forEach((resolve) => resolve());
  }
  async close(): Promise<void> {
    this.stopping.abort();
    if (this.active)
      await new Promise<void>((resolve) => this.idle.push(resolve));
  }
}
