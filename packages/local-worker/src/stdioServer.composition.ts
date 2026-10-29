import { parseWorkerCommand } from "./features/cli/index.js";
import { serveWorker } from "./stdioRuntime.composition.js";
const abort = new AbortController();
const stop = (): void => abort.abort();
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
try {
  const command = parseWorkerCommand(["serve", ...process.argv.slice(2)]);
  if (command.command === "serve")
    await serveWorker(command.target, abort.signal);
} catch {
  process.stderr.write(
    "Worker startup failed. Supply --server and --account; see docs/local-stdio-worker.md.\n",
  );
  process.exitCode = 1;
} finally {
  process.off("SIGINT", stop);
  process.off("SIGTERM", stop);
}
