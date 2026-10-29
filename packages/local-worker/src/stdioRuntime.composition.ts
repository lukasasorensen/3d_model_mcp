import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, join, sep } from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { WorkerAuthentication } from "@theoryfoundry/worker-auth";
import type { WorkerRenderer } from "./domains/compute/index.js";
import type { WorkerTarget } from "./domains/installation/index.js";
import {
  createAuthorizedFetch,
  createHostedWorkerApi,
  createHostedToolCaller,
} from "./infrastructure/hosted/index.js";
import { createWorkerRenderer } from "./renderer.composition.js";
import { createLocalWorkerServer } from "./workerServer.composition.js";
export async function serveWorker(
  target: WorkerTarget,
  signal: AbortSignal,
  assets: URL = pathToFileURL(
    join(dirname(fileURLToPath(import.meta.url)), "assets") + sep,
  ),
  version = "0.1.0",
  renderer: WorkerRenderer = createWorkerRenderer(assets),
): Promise<void> {
  signal.throwIfAborted();
  let authentication: Promise<WorkerAuthentication> | undefined;
  const auth = (): Promise<WorkerAuthentication> =>
    (authentication ??= import("@theoryfoundry/worker-auth").then(
      ({ createWorkerAuthentication }) =>
        createWorkerAuthentication(target.server, {
          allowLoopbackHttp: target.allowLoopbackHttp,
        }),
    ));
  const account = target.account!;
  const request = createAuthorizedFetch(
    target.server,
    async (signal) => (await (await auth()).accessToken(account, signal)).token,
  );
  const worker = createLocalWorkerServer(
    {
      api: createHostedWorkerApi(target.server, request),
      renderer,
      callHosted: createHostedToolCaller(target.server, request),
    },
    version,
  );
  let stopping: Promise<void> | undefined;
  const stop = (): void => {
    stopping ??= worker.close();
    void stopping.catch(() => undefined);
  };
  signal.addEventListener("abort", stop, { once: true });
  process.stdin.once("end", stop);
  const closed = new Promise<void>((resolve) => {
    const existing = worker.server.server.onclose;
    worker.server.server.onclose = (): void => {
      existing?.();
      resolve();
    };
  });
  try {
    await worker.server.connect(new StdioServerTransport());
    if (signal.aborted) stop();
    await closed;
  } finally {
    signal.removeEventListener("abort", stop);
    process.stdin.off("end", stop);
    await worker.close();
  }
}
