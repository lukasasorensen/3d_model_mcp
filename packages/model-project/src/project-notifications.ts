import type { Notification, Pool, PoolClient } from "pg";

export interface ProjectNotification {
  kind: "project" | "render";
  ownerId: string;
  projectId: string;
  jobId?: string;
}
export interface ProjectChangeSource {
  subscribe(listener: (event: ProjectNotification | null) => void): Promise<() => void>;
}

/** null invalidates every subscription after a connection gap. Notifications carry no authority. */
export class PostgresProjectNotifications implements ProjectChangeSource {
  private readonly listeners = new Set<(event: ProjectNotification | null) => void>();
  private client?: PoolClient;
  private connecting?: Promise<void>;
  private retry?: ReturnType<typeof setTimeout>;
  private closed = false;
  constructor(private readonly pool: Pool) {}

  async subscribe(listener: (event: ProjectNotification | null) => void): Promise<() => void> {
    if (this.closed) throw new Error("Project notifications are closed.");
    this.listeners.add(listener);
    try { await this.connect(); }
    catch (error) { this.listeners.delete(listener); throw error; }
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) this.disconnect();
    };
  }

  private connect(): Promise<void> {
    if (this.client) return Promise.resolve();
    if (this.connecting) return this.connecting;
    this.connecting = this.open().finally(() => { this.connecting = undefined; });
    return this.connecting;
  }

  private async open(): Promise<void> {
    const client = await this.pool.connect();
    const lost = () => {
      if (this.client !== client) return;
      this.disconnect();
      process.stderr.write("Project notification connection lost; reconnecting.\n");
      for (const listener of this.listeners) listener(null);
      this.scheduleReconnect();
    };
    client.on("error", lost);
    client.on("end", lost);
    client.on("notification", (notification: Notification) => {
      if (notification.channel !== "rjls_changes" || !notification.payload) return;
      try {
        const event = JSON.parse(notification.payload) as ProjectNotification;
        if ((event.kind !== "project" && event.kind !== "render") || typeof event.ownerId !== "string" || typeof event.projectId !== "string") return;
        for (const listener of this.listeners) listener(event);
      } catch { /* Ignore malformed external notification payloads. */ }
    });
    try {
      await client.query("LISTEN rjls_changes");
      if (this.closed || !this.listeners.size) { client.release(true); return; }
      this.client = client;
      for (const listener of this.listeners) listener(null);
    } catch (error) { client.release(true); throw error; }
  }

  private scheduleReconnect(): void {
    if (this.closed || !this.listeners.size || this.retry) return;
    this.retry = setTimeout(() => {
      this.retry = undefined;
      void this.connect().catch(() => { process.stderr.write("Project notification reconnect failed.\n"); this.scheduleReconnect(); });
    }, 1_000 + Math.random() * 1_000);
  }

  private disconnect(): void {
    clearTimeout(this.retry); this.retry = undefined;
    const client = this.client; this.client = undefined;
    client?.release(true);
  }

  close(): void { this.closed = true; this.disconnect(); this.listeners.clear(); }
}
