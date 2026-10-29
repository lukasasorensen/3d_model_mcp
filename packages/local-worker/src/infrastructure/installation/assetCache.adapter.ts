import { createHash, randomUUID } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import {
  lstat,
  mkdir,
  readFile,
  writeFile,
  rename,
  rm,
} from "node:fs/promises";
import { join, dirname, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { LocalWorkerError } from "../../shared/utils/workerError.util.js";
import { safeDirectory } from "../../shared/utils/safeDirectory.util.js";
const files = [
  "index.html",
  "proof.js",
  "openscad-worker.js",
  "vendor/openscad/openscad.js",
  "vendor/openscad/openscad.wasm",
  "vendor/openscad/bosl2.zip",
  "vendor/openscad/manifest.json",
] as const;
const manifestSchema = z.record(
  z.enum(files),
  z.string().regex(/^[a-f0-9]{64}$/),
);
const digest = (bytes: Uint8Array | string): string =>
  createHash("sha256").update(bytes).digest("hex");
export interface AssetCache {
  available(): boolean;
  verify(signal: AbortSignal): Promise<URL>;
  prepare(signal: AbortSignal): Promise<void>;
}
export function createAssetCache(packaged: URL, root: string): AssetCache {
  const manifest = (): {
    hashes: z.infer<typeof manifestSchema>;
    path: string;
  } => {
    try {
      const raw = readFileSync(new URL("integrity.json", packaged), "utf8");
      return {
        hashes: manifestSchema.parse(JSON.parse(raw) as unknown),
        path: join(root, digest(raw)),
      };
    } catch {
      throw new LocalWorkerError(
        "WORKER_SETUP_REQUIRED",
        "Packaged asset manifest is missing or invalid. Reinstall this worker release.",
      );
    }
  };
  const verifyFiles = async (
    path: string,
    hashes: z.infer<typeof manifestSchema>,
    signal: AbortSignal,
  ): Promise<void> => {
    await safeDirectory(path);
    await safeDirectory(join(path, "vendor/openscad"));
    for (const file of files) {
      signal.throwIfAborted();
      const target = join(path, file);
      const stat = await lstat(target);
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        digest(await readFile(target)) !== hashes[file]
      )
        throw new Error("Invalid cached asset.");
    }
  };
  return {
    available: (): boolean => {
      try {
        return existsSync(join(manifest().path, "proof.js"));
      } catch {
        return false;
      }
    },
    verify: async (signal): Promise<URL> => {
      const { hashes, path } = manifest();
      try {
        await verifyFiles(path, hashes, signal);
      } catch {
        signal.throwIfAborted();
        throw new LocalWorkerError(
          "WORKER_SETUP_REQUIRED",
          "Renderer cache is missing or corrupt. Run setup for this worker version to repair it.",
        );
      }
      return pathToFileURL(path + sep);
    },
    prepare: async (signal): Promise<void> => {
      const { hashes, path } = manifest();
      signal.throwIfAborted();
      await safeDirectory(root, true);
      const lock = `${path}.lock`;
      try {
        await mkdir(lock, { mode: 0o700 });
      } catch {
        throw new LocalWorkerError(
          "SETUP_BUSY",
          "Another setup owns the asset cache. Stop it before removing an abandoned cache lock.",
        );
      }
      const temporary = `${path}.tmp-${randomUUID()}`;
      const previous = `${path}.old-${randomUUID()}`;
      let moved = false;
      try {
        try {
          await verifyFiles(path, hashes, signal);
          return;
        } catch {
          signal.throwIfAborted();
        }
        await safeDirectory(temporary, true);
        for (const file of files) {
          signal.throwIfAborted();
          const bytes = await readFile(new URL(file, packaged));
          if (digest(bytes) !== hashes[file])
            throw new LocalWorkerError(
              "RENDERER_INTEGRITY",
              "Packaged renderer integrity failed. Reinstall the worker; cached assets were not replaced.",
            );
          await safeDirectory(dirname(join(temporary, file)), true);
          await writeFile(join(temporary, file), bytes, {
            flag: "wx",
            mode: 0o600,
          });
        }
        await verifyFiles(temporary, hashes, signal);
        signal.throwIfAborted();
        try {
          const stat = await lstat(path);
          if (!stat.isDirectory() || stat.isSymbolicLink())
            throw new LocalWorkerError(
              "UNSAFE_PATH",
              "Refusing to replace a symlink or non-directory asset cache.",
            );
          await rename(path, previous);
          moved = true;
        } catch (error) {
          if (!(
            error &&
            typeof error === "object" &&
            "code" in error &&
            error.code === "ENOENT"
          ))
            throw error;
        }
        try {
          await rename(temporary, path);
        } catch (error) {
          if (moved) await rename(previous, path);
          moved = false;
          throw error;
        }
      } finally {
        await rm(temporary, { recursive: true, force: true });
        if (moved) await rm(previous, { recursive: true, force: true });
        await rm(lock, { recursive: true, force: true });
      }
    },
  };
}
