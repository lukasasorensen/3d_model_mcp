import { WorkerAuthError } from "../../shared/utils/authenticationError.util.js";
import { createHash } from "node:crypto";
import { lstat, mkdir, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { type CredentialLock } from "../../domains/authentication/index.js";
export function createCredentialLock(
  directory: string,
  origin: string,
  timeoutMs = 30_000,
): CredentialLock {
  const lockPath = join(
    directory,
    createHash("sha256").update(origin).digest("hex") + ".lock",
  );
  return {
    async run<T>(
      operation: () => Promise<T>,
      signal?: AbortSignal,
    ): Promise<T> {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const info = await lstat(directory);
      if (
        !info.isDirectory() ||
        info.isSymbolicLink() ||
        (process.platform !== "win32" &&
          ((info.mode & 0o077) !== 0 || info.uid !== process.getuid?.()))
      ) {
        throw new WorkerAuthError(
          "UNSAFE_LOCK_DIRECTORY",
          "Worker lock directory must be private, owned by you, and not a symlink.",
        );
      }
      const deadline = Date.now() + timeoutMs;
      while (true) {
        signal?.throwIfAborted();
        try {
          await mkdir(lockPath, { mode: 0o700 });
          break;
        } catch (error) {
          if (!(
            error &&
            typeof error === "object" &&
            "code" in error &&
            error.code === "EEXIST"
          ))
            throw error;
          if (Date.now() >= deadline)
            throw new WorkerAuthError(
              "CREDENTIAL_LOCKED",
              "Another worker holds the credential lock. If it crashed, stop all workers before removing the lock directory and logging in again.",
            );
          await setTimeout(50, undefined, signal ? { signal } : {});
        }
      }
      try {
        signal?.throwIfAborted();
        return await operation();
      } finally {
        await rmdir(lockPath);
      }
    },
  };
}
