#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, join, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { workerCli } from "./features/cli/index.js";
import { homedir } from "node:os";
import { createCachedRenderer } from "./cachedRenderer.composition.js";
import { serveWorker } from "./stdioRuntime.composition.js";
import {
  createAssetCache,
  configureClient,
  installBrowser,
  openSystemBrowser,
} from "./infrastructure/installation/index.js";
import type { WorkerAuthentication } from "@theoryfoundry/worker-auth";
import { LocalWorkerError } from "./shared/utils/workerError.util.js";
const abort = new AbortController();
const stop = (): void => abort.abort();
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
try {
  if (process.versions.node.split(".")[0] !== "24")
    throw new LocalWorkerError(
      "NODE_VERSION",
      "This worker requires Node 24. Install Node 24 and retry.",
    );
  const directory = dirname(fileURLToPath(import.meta.url));
  const metadata = JSON.parse(
    await readFile(join(directory, "../package.json"), "utf8"),
  ) as { name: string; version: string };
  const assets = pathToFileURL(join(directory, "assets") + sep);
  const cache = createAssetCache(
    assets,
    join(
      process.env.XDG_CACHE_HOME ??
        (process.platform === "darwin"
          ? join(homedir(), "Library/Caches")
          : join(homedir(), ".cache")),
      "theoryfoundry-worker/renderers",
    ),
  );
  const renderer = createCachedRenderer(cache);
  process.exitCode = await workerCli(
    process.argv.slice(2),
    {
      metadata,
      renderer,
      prepareAssets: (signal) => cache.prepare(signal),
      configureClient: (installation, signal) =>
        configureClient(installation, metadata, signal),
      installBrowser,
      openBrowser: openSystemBrowser,
      loadAuthentication: async (
        target,
      ): Promise<WorkerAuthentication | undefined> => {
        try {
          const { createWorkerAuthentication } =
            await import("@theoryfoundry/worker-auth");
          return target
            ? createWorkerAuthentication(target.server, {
                allowLoopbackHttp: target.allowLoopbackHttp,
              })
            : undefined;
        } catch {
          throw new LocalWorkerError(
            "CREDENTIAL_BACKEND_UNAVAILABLE",
            "The OS credential adapter could not load. Reinstall with optional dependencies enabled; Linux requires Secret Service.",
          );
        }
      },
      serve: (target, signal) =>
        serveWorker(target, signal, assets, metadata.version, renderer),
      stdout: (text) => {
        process.stdout.write(text);
      },
      stderr: (text) => {
        process.stderr.write(text);
      },
    },
    abort.signal,
  );
} catch (error) {
  process.stderr.write(
    `${error instanceof LocalWorkerError ? `${error.code}: ${error.message}` : "Worker startup failed. Check installation and Node 24."}\n`,
  );
  process.exitCode = 1;
} finally {
  process.off("SIGINT", stop);
  process.off("SIGTERM", stop);
}
