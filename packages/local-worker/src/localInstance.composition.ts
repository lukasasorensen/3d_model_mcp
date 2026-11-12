import { homedir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import {
  parseLocalCommand,
  runLocalInstance,
} from "./features/local-instance/index.js";
import {
  localProcess,
  localSecrets,
  hiddenPrompt,
} from "./infrastructure/local-instance/index.js";
import { openSystemBrowser } from "./infrastructure/installation/index.js";
const abort = new AbortController();
const stop = (): void => abort.abort();
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
try {
  if (process.versions.node.split(".")[0] !== "24")
    throw new Error("NODE_VERSION: This worker requires Node 24.");
  const directory = dirname(fileURLToPath(import.meta.url));
  const metadata = JSON.parse(
    await readFile(join(directory, "../package.json"), "utf8"),
  ) as { version: string };
  const result = await runLocalInstance(
    parseLocalCommand(process.argv.slice(3)),
    {
      home: resolve(
        process.env.THEORYFOUNDRY_LOCAL_HOME ??
          join(homedir(), ".theoryfoundry", "local"),
      ),
      assets: join(directory, "local"),
      signal: abort.signal,
      run: localProcess(abort.signal),
      secrets: localSecrets,
      prompt: (message) => hiddenPrompt(message, abort.signal),
      open: (url) => openSystemBrowser(url, abort.signal),
    },
    metadata.version,
  );
  process.stdout.write(JSON.stringify(result) + "\n");
} catch (error) {
  const message =
    error instanceof Error && /^[A-Z_]+:/.test(error.message)
      ? error.message
      : "LOCAL_FAILED: Local operation failed. Check Docker, installation files and OS credentials.";
  process.stderr.write(message + "\n");
  process.exitCode = 1;
} finally {
  process.off("SIGINT", stop);
  process.off("SIGTERM", stop);
}
