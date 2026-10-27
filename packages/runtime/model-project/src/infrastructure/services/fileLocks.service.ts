import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import * as z from "zod/v4";
import type { ModelProjectRepositoryOptions } from "../../domains/project/index.js";
import { CadDomainError } from "../../shared/utils/cadDomainError.util.js";
import type { DurableFiles } from "../filesystem.port.js";
import { FileProjectPaths, safeJson } from "../utils/fileLayout.util.js";
function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new CadDomainError("CANCELLED", "Operation cancelled."));
      return;
    }
    const cleanup = () => signal?.removeEventListener("abort", onAbort);
    const onAbort = () => {
      clearTimeout(timer);
      cleanup();
      reject(new CadDomainError("CANCELLED", "Operation cancelled."));
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, milliseconds);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
export class FileProjectLocks {
  private readonly paths: FileProjectPaths;
  private readonly clock: () => Date;
  private readonly lockTimeoutMs: number;
  private readonly lockStaleMs: number;
  constructor(
    options: ModelProjectRepositoryOptions,
    private readonly files: DurableFiles,
  ) {
    this.paths = new FileProjectPaths(options);
    this.clock = options.clock ?? (() => new Date());
    this.lockTimeoutMs = options.lockTimeoutMs ?? 5000;
    this.lockStaleMs = options.lockStaleMs ?? 120000;
  }
  async ensureProject(projectId: string): Promise<void> {
    const control = this.paths.controlRoot(projectId);
    await mkdir(join(control, "versions"), { recursive: true });
    await mkdir(join(control, "candidates"), { recursive: true });
    await mkdir(join(control, "artifacts"), { recursive: true });
    await mkdir(join(control, "locks"), { recursive: true });
  }
  async withProjectLock<T>(
    projectId: string,
    lockName: string,
    operation: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    await this.ensureProject(projectId);
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(lockName))
      throw new CadDomainError(
        "CORRUPT_PROJECT",
        "Invalid internal lock name.",
      );
    const lock = join(
      this.paths.controlRoot(projectId),
      "locks",
      `${lockName}.lock`,
    );
    const deadline = Date.now() + this.lockTimeoutMs;
    for (;;) {
      if (signal?.aborted)
        throw new CadDomainError("CANCELLED", "Operation cancelled.");
      try {
        await mkdir(lock);
        try {
          await this.files.writeDurable(
            join(lock, "owner.json"),
            safeJson({
              pid: process.pid,
              token: randomUUID(),
              acquiredAt: this.clock().toISOString(),
            }),
          );
          await this.files.fsyncDirectory(lock);
          await this.files.fsyncDirectory(dirname(lock));
        } catch (ownerWriteError) {
          await rm(lock, { recursive: true, force: true });
          throw ownerWriteError;
        }
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        let stale = false;
        try {
          const owner: unknown = JSON.parse(
            await readFile(join(lock, "owner.json"), "utf8"),
          );
          const ownerRecord = z
            .object({
              pid: z.number().int().positive(),
              token: z.string().uuid(),
              acquiredAt: z.string().datetime({ offset: true }),
            })
            .strict()
            .safeParse(owner);
          const lockStat = await stat(lock);
          if (ownerRecord.success) {
            const leaseStart = Math.max(
              Date.parse(ownerRecord.data.acquiredAt),
              lockStat.mtimeMs,
            );
            const leaseExpired = Date.now() - leaseStart >= this.lockStaleMs;
            let ownerDead = false;
            try {
              process.kill(ownerRecord.data.pid, 0);
            } catch (killError) {
              ownerDead = (killError as NodeJS.ErrnoException).code === "ESRCH";
            }
            stale = leaseExpired && ownerDead;
          }
        } catch {
          // Missing, partial, or malformed ownership cannot prove the holder is dead.
          // Contenders time out instead of stealing a potentially live lock.
          stale = false;
        }
        if (stale) {
          const abandoned = `${lock}.abandoned.${randomUUID()}`;
          try {
            await rename(lock, abandoned);
            await this.files.fsyncDirectory(dirname(lock));
            await rm(abandoned, { recursive: true, force: true });
            continue;
          } catch (recoveryError) {
            if ((recoveryError as NodeJS.ErrnoException).code !== "ENOENT")
              throw recoveryError;
          }
        }
        if (Date.now() >= deadline)
          throw new CadDomainError(
            "LOCK_TIMEOUT",
            "Timed out waiting for the project promotion lock.",
          );
        await delay(10, signal);
      }
    }
    try {
      return await operation();
    } finally {
      await rm(lock, { recursive: true, force: true });
    }
  }
}
