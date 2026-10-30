import { lstat, readFile, writeFile, rename, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { LocalWorkerError } from "../../shared/utils/workerError.util.js";
import { safeDirectory } from "../../shared/utils/safeDirectory.util.js";
import type { ConfigurationReceipt } from "../../domains/installation/index.js";

async function originalFile(path: string): Promise<string | undefined> {
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new LocalWorkerError(
        "UNSAFE_PATH",
        "Refusing to replace a symlink or non-file configuration.",
      );
    return await readFile(path, "utf8");
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    )
      return undefined;
    throw error;
  }
}

export async function writeConfiguration(
  path: string,
  merge: (source: string) => string,
  signal: AbortSignal,
): Promise<ConfigurationReceipt> {
  signal.throwIfAborted();
  await safeDirectory(dirname(path), true);
  const lock = `${path}.theoryfoundry.lock`;
  try {
    await writeFile(lock, "", { flag: "wx", mode: 0o600 });
  } catch {
    throw new LocalWorkerError(
      "CONFIG_BUSY",
      "Configuration is locked by another setup. Stop that setup before removing an abandoned lock.",
    );
  }
  let temporary: string | undefined;
  try {
    const original = await originalFile(path);
    const candidate = merge(original ?? "");
    if (candidate === original) return { path, changed: false };
    signal.throwIfAborted();
    const backup =
      original === undefined
        ? undefined
        : `${path}.theoryfoundry-backup-${randomUUID()}`;
    if (backup) await writeFile(backup, original!, { flag: "wx", mode: 0o600 });
    temporary = join(dirname(path), `.theoryfoundry-${randomUUID()}.tmp`);
    await writeFile(temporary, candidate, { flag: "wx", mode: 0o600 });
    if ((await originalFile(path)) !== original)
      throw new LocalWorkerError(
        "CONFIG_CHANGED",
        "Configuration changed during setup. Retry without overwriting the other change.",
      );
    signal.throwIfAborted();
    await rename(temporary, path);
    temporary = undefined;
    return { path, changed: true, ...(backup ? { backup } : {}) };
  } finally {
    if (temporary) await unlink(temporary).catch(() => undefined);
    await unlink(lock);
  }
}
