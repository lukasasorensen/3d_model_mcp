/** Recheck only on invalidations; retain invalidations arriving during a read. */
export class ActivePreview {
  private readonly cancellation = new AbortController();
  private readonly statusRequests = new AbortController();
  private checking = false;
  private dirty = false;
  private closed = false;
  readonly signal: AbortSignal;

  constructor(signal: AbortSignal, private readonly readState: (signal: AbortSignal) => Promise<"pending" | "completed" | "cancelled">) {
    this.signal = AbortSignal.any([signal, this.cancellation.signal]);
  }

  invalidate(): void {
    if (this.closed || this.signal.aborted) return;
    this.dirty = true;
    if (!this.checking) void this.check();
  }

  private async check(): Promise<void> {
    this.checking = true;
    try {
      while (this.dirty && !this.closed && !this.signal.aborted) {
        this.dirty = false;
        const state = await this.readState(AbortSignal.any([this.signal, this.statusRequests.signal]));
        if (this.closed) return;
        if (state === "cancelled") {
          this.cancellation.abort(new DOMException("Preview was cancelled or expired.", "AbortError"));
          this.close();
        } else if (state === "completed") this.close();
      }
    } catch (error) {
      if (!this.closed) this.cancellation.abort(error);
    } finally { this.checking = false; }
  }

  /** Stop monitoring once rendering finishes; delivery can remove the job normally. */
  close(): void { this.closed = true; this.statusRequests.abort(); }
}
