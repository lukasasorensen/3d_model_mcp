import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, join, sep } from "node:path";
import { parseArgs } from "node:util";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createWorkerAuthentication } from "@theoryfoundry/worker-auth";
import {
  createAuthorizedFetch,
  createHostedWorkerApi,
  createHostedToolCaller,
} from "./infrastructure/hosted/index.js";
import { createWorkerRenderer } from "./renderer.composition.js";
import { createLocalWorkerServer } from "./workerServer.composition.js";
async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      server: { type: "string" },
      account: { type: "string" },
      "allow-loopback-http": { type: "boolean", default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  if (!values.server || !values.account || values.account.length > 200)
    throw new Error(
      "Usage: worker:serve --server https://your-host --account <account-id> [--allow-loopback-http]",
    );
  const authentication = createWorkerAuthentication(values.server, {
    allowLoopbackHttp: values["allow-loopback-http"],
  });
  const account = values.account;
  const request = createAuthorizedFetch(
    values.server,
    async (signal) => (await authentication.accessToken(account, signal)).token,
  );
  const worker = createLocalWorkerServer({
    api: createHostedWorkerApi(values.server, request),
    renderer: createWorkerRenderer(
      pathToFileURL(
        join(dirname(fileURLToPath(import.meta.url)), "assets") + sep,
      ),
    ),
    callHosted: createHostedToolCaller(values.server, request),
  });
  const stop = (): void => {
    void worker.close().catch(() => {
      process.exitCode = 1;
    });
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  process.stdin.once("end", stop);
  try {
    await worker.server.connect(new StdioServerTransport());
  } catch (error) {
    await worker.close();
    throw error;
  }
}
void main().catch(() => {
  process.stderr.write(
    "Worker startup failed. Supply --server and --account; see docs/local-stdio-worker.md.\n",
  );
  process.exitCode = 1;
});
