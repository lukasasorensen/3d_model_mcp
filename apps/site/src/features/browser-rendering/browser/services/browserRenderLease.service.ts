/** A user action waits for a background claim, but never queues behind another user action. */
export class BrowserRenderLease {
  private owner: "background" | "foreground" | undefined;
  private preview: (() => void) | undefined;
  private waiting: ((acquired: boolean) => void) | undefined;

  tryPreview(cancel: () => void): (() => void) | undefined {
    if (this.owner || this.preview) return undefined;
    this.preview = cancel;
    return () => {
      if (this.preview === cancel) this.preview = undefined;
    };
  }

  private preemptPreview(): void {
    const cancel = this.preview;
    this.preview = undefined;
    cancel?.();
  }

  tryBackground(): boolean {
    if (this.owner) return false;
    this.owner = "background";
    this.preemptPreview();
    return true;
  }

  async acquireForeground(): Promise<boolean> {
    if (this.owner === "foreground" || this.waiting) return false;
    if (this.owner === "background")
      return new Promise<boolean>((resolve) => {
        this.waiting = resolve;
      });
    this.owner = "foreground";
    this.preemptPreview();
    return true;
  }

  release(): void {
    const waiting = this.waiting;
    this.waiting = undefined;
    this.owner = waiting ? "foreground" : undefined;
    waiting?.(true);
  }
}
