import { getProjectDatabase } from "./infrastructure.js";
import { provisionCodexClient } from "./oauth-provisioning.js";
import { validateOAuthCallback } from "./remote-mcp-policy.js";

const arguments_ = process.argv.slice(2).filter((argument) => argument !== "--");
const replaceCallbacks = arguments_[0] === "--replace";
const callback = arguments_[replaceCallbacks ? 1 : 0];
try {
  if (!callback || arguments_.length !== (replaceCallbacks ? 2 : 1)) {
    throw new Error("Usage: pnpm oauth:provision -- [--replace] <exact-loopback-callback-url>");
  }
  validateOAuthCallback(callback);
  const database = getProjectDatabase();
  try {
    const clientId = await provisionCodexClient(database.pool, callback, { replaceCallbacks });
    process.stdout.write(`Codex client ID: ${clientId}\nCallback mode: ${replaceCallbacks ? "replaced" : "added"}\n`);
  }
  finally { await database.close(); }
} catch (error) {
  process.stderr.write(`${error instanceof Error && error.message.startsWith("Usage:") ? error.message : "OAuth client provisioning failed. Check the callback URL, database, and migrations."}\n`);
  process.exitCode = 1;
}
