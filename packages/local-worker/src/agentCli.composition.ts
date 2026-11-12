import { homedir } from "node:os";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
import { WorkerAuthError } from "@theoryfoundry/worker-auth/errors";
import { createWorkerAuthentication } from "@theoryfoundry/worker-auth";
import {
  parseAgentCommand,
  runAgentCommand,
} from "./features/agent-cli/index.js";
import { openSystemBrowser } from "./infrastructure/installation/index.js";
const abort = new AbortController();
const stop = (): void => abort.abort();
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
try {
  if (process.versions.node.split(".")[0] !== "24")
    throw new Error("NODE_VERSION: This worker requires Node 24.");
  const entry = resolve(process.argv[1]!);
  const result = await runAgentCommand(
    parseAgentCommand(process.argv.slice(2)),
    {
      home: resolve(
        process.env.THEORYFOUNDRY_CONNECTION_HOME ??
          process.env.THEORYFOUNDRY_LOCAL_HOME ??
          join(homedir(), ".theoryfoundry", "local"),
      ),
      entry,
      signal: abort.signal,
      setup: () =>
        new Promise<void>((resolve, reject) => {
          const child = spawn(process.execPath, [entry, "setup"], {
            signal: abort.signal,
            stdio: ["ignore", "ignore", "inherit"],
          });
          child.once("error", () =>
            reject(new Error("SETUP_FAILED: Could not launch renderer setup.")),
          );
          child.once("close", (code) =>
            code === 0
              ? resolve()
              : reject(
                  new Error("SETUP_FAILED: Check renderer prerequisites."),
                ),
          );
        }),
      authenticate: async (server, allowLoopbackHttp, account) => {
        const auth = createWorkerAuthentication(server, { allowLoopbackHttp });
        if (account) {
          try {
            return (await auth.accessToken(account, abort.signal)).account;
          } catch (error) {
            if (
              !(error instanceof WorkerAuthError) ||
              error.code !== "LOGIN_REQUIRED"
            )
              throw error;
          }
        }
        return auth.login(
          (url) => openSystemBrowser(url, abort.signal),
          abort.signal,
        );
      },
    },
  );
  process.stdout.write(JSON.stringify(result) + "\n");
  if (result.isError) process.exitCode = 1;
} catch (error) {
  const message =
    error instanceof Error && /^[A-Z_]+:/.test(error.message)
      ? error.message
      : "AGENT_COMMAND_FAILED: Check connection, input schema, renderer setup and OS credentials. Run connect to authorize again if access expired or was revoked.";
  process.stderr.write(message + "\n");
  process.exitCode = 1;
} finally {
  process.off("SIGINT", stop);
  process.off("SIGTERM", stop);
}
