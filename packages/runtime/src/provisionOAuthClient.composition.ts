import { getProjectDatabase } from "./database.composition.js";
import {
  provisionCodexClient,
  provisionWorkerClient,
} from "./features/authentication/index.js";
import { validateOAuthCallback } from "./shared/utils/remoteMcpPolicy.util.js";
const arguments_ = process.argv
  .slice(2)
  .filter((argument) => argument !== "--");
const worker = arguments_[0] === "--worker";
const replaceCallbacks = arguments_[0] === "--replace";
const callback = arguments_[replaceCallbacks ? 1 : 0];
try {
  if (
    worker
      ? arguments_.length !== 1
      : !callback || arguments_.length !== (replaceCallbacks ? 2 : 1)
  ) {
    throw new Error(
      "Usage: pnpm oauth:provision -- --worker | [--replace] <exact-loopback-callback-url>",
    );
  }
  if (!worker) validateOAuthCallback(callback!);
  const database = getProjectDatabase();
  try {
    const clientId = worker
      ? await provisionWorkerClient(database.pool)
      : await provisionCodexClient(database.pool, callback!, {
          replaceCallbacks,
        });
    process.stdout.write(
      `OAuth client ID: ${clientId}\nCallback mode: ${worker ? "fixed worker callback" : replaceCallbacks ? "replaced" : "added"}\n`,
    );
  } finally {
    await database.close();
  }
} catch (error) {
  process.stderr.write(
    `${error instanceof Error && error.message.startsWith("Usage:") ? error.message : "OAuth client provisioning failed. Check the callback URL, database, and migrations."}\n`,
  );
  process.exitCode = 1;
}
