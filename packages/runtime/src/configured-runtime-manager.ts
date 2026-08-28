import type { ConfiguredCadRuntime } from "./configured-runtime.js";

interface RuntimeCacheEntry {
  runtime: Promise<ConfiguredCadRuntime>;
  leases: number;
  lastReleasedAt: number;
}

export interface ConfiguredCadRuntimeManagerOptions {
  createRuntime: (ownerId: string) => Promise<ConfiguredCadRuntime>;
  maxEntries?: number;
  idleTtlMs?: number;
  clock?: () => number;
}

function releaseWithResponseBody(response: Response, release: () => Promise<void>): Response {
  if (!response.body) {
    void release();
    return response;
  }
  const reader = response.body.getReader();
  let released = false;
  const releaseOnce = async () => {
    if (released) return;
    released = true;
    await release();
  };
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const result = await reader.read();
        if (result.done) {
          controller.close();
          await releaseOnce();
        } else {
          controller.enqueue(result.value);
        }
      } catch (error) {
        controller.error(error);
        await releaseOnce();
      }
    },
    async cancel(reason) {
      try { await reader.cancel(reason); }
      finally { await releaseOnce(); }
    },
  });
  return new Response(body, response);
}

export class ConfiguredCadRuntimeManager {
  private readonly entries = new Map<string, RuntimeCacheEntry>();
  private readonly maxEntries: number;
  private readonly idleTtlMs: number;
  private readonly clock: () => number;

  constructor(private readonly options: ConfiguredCadRuntimeManagerOptions) {
    this.maxEntries = options.maxEntries ?? 64;
    this.idleTtlMs = options.idleTtlMs ?? 5 * 60_000;
    this.clock = options.clock ?? Date.now;
    if (!Number.isSafeInteger(this.maxEntries) || this.maxEntries < 1) throw new Error("Runtime cache capacity must be a positive integer.");
    if (!Number.isFinite(this.idleTtlMs) || this.idleTtlMs < 0) throw new Error("Runtime cache TTL must be non-negative.");
  }

  async withRuntime<T>(ownerId: string, operation: (runtime: ConfiguredCadRuntime) => Promise<T>): Promise<T> {
    if (!ownerId) throw new Error("An authenticated owner is required.");
    await this.evictExpiredEntries();
    let entry = this.entries.get(ownerId);
    if (!entry) {
      await this.ensureCapacity();
      entry = { runtime: this.options.createRuntime(ownerId), leases: 0, lastReleasedAt: this.clock() };
      this.entries.set(ownerId, entry);
      const createdEntry = entry;
      void entry.runtime.catch(() => {
        if (this.entries.get(ownerId) === createdEntry) this.entries.delete(ownerId);
      });
    }
    entry.leases += 1;
    let runtime: ConfiguredCadRuntime;
    try {
      runtime = await entry.runtime;
    } catch (error) {
      await this.release(ownerId, entry);
      throw error;
    }
    try {
      const result = await operation(runtime);
      if (result instanceof Response) return releaseWithResponseBody(result, () => this.release(ownerId, entry)) as T;
      await this.release(ownerId, entry);
      return result;
    } catch (error) {
      await this.release(ownerId, entry);
      throw error;
    }
  }

  async close(): Promise<void> {
    const entries = [...this.entries.values()];
    this.entries.clear();
    await Promise.allSettled(entries.map(async (entry) => (await entry.runtime).close()));
  }

  get size(): number {
    return this.entries.size;
  }

  private async release(ownerId: string, entry: RuntimeCacheEntry): Promise<void> {
    entry.leases = Math.max(0, entry.leases - 1);
    entry.lastReleasedAt = this.clock();
    if (this.entries.get(ownerId) === entry && this.idleTtlMs === 0 && entry.leases === 0) await this.evict(ownerId, entry);
  }

  private async evictExpiredEntries(): Promise<void> {
    const now = this.clock();
    for (const [ownerId, entry] of this.entries) {
      if (entry.leases === 0 && now - entry.lastReleasedAt >= this.idleTtlMs) await this.evict(ownerId, entry);
    }
  }

  private async ensureCapacity(): Promise<void> {
    if (this.entries.size < this.maxEntries) return;
    const available = [...this.entries.entries()]
      .filter(([, entry]) => entry.leases === 0)
      .sort((left, right) => left[1].lastReleasedAt - right[1].lastReleasedAt)[0];
    if (!available) throw new Error("The configured runtime cache is at capacity.");
    await this.evict(available[0], available[1]);
  }

  private async evict(ownerId: string, entry: RuntimeCacheEntry): Promise<void> {
    if (this.entries.get(ownerId) !== entry || entry.leases !== 0) return;
    this.entries.delete(ownerId);
    await entry.runtime.then((runtime) => runtime.close()).catch(() => undefined);
  }
}
