/** A user action waits for a claim poll, but never queues behind another user action. */
export class BrowserRenderLease {
  private owner: "background" | "foreground" | undefined;
  private waiting: ((acquired: boolean) => void) | undefined;

  tryBackground(): boolean {
    if (this.owner) return false;
    this.owner = "background";
    return true;
  }

  async acquireForeground(): Promise<boolean> {
    if (this.owner === "foreground" || this.waiting) return false;
    if (this.owner === "background") return new Promise<boolean>((resolve) => { this.waiting = resolve; });
    this.owner = "foreground";
    return true;
  }

  release(): void {
    const waiting = this.waiting;
    this.waiting = undefined;
    this.owner = waiting ? "foreground" : undefined;
    waiting?.(true);
  }
}
