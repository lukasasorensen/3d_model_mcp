import { lstat, mkdir } from "node:fs/promises";
import { parse, resolve, join } from "node:path";
import { LocalWorkerError } from "./workerError.util.js";

export async function safeDirectory(
  path: string,
  create = false,
): Promise<void> {
  const absolute = resolve(path);
  const root = parse(absolute).root;
  let current = root;
  for (const part of absolute
    .slice(root.length)
    .split(/[\\/]/)
    .filter(Boolean)) {
    current = join(current, part);
    if (create)
      await mkdir(current, { mode: 0o700 }).catch((error: unknown) => {
        if (!(
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "EEXIST"
        ))
          throw error;
      });
    const stat = await lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new LocalWorkerError(
        "UNSAFE_PATH",
        "Refusing a symlink or non-directory in the installation path.",
      );
  }
}
