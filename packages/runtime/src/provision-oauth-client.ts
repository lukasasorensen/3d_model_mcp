import { getProjectDatabase } from "./infrastructure.js";
import { provisionCodexClient } from "./oauth-provisioning.js";
import { validateOAuthCallback } from "./remote-mcp-policy.js";

const callback = process.argv.slice(2).filter((argument) => argument !== "--")[0];
try {
  if (!callback) throw new Error("Usage: pnpm oauth:provision -- <exact-loopback-callback-url>");
  validateOAuthCallback(callback);
  const database = getProjectDatabase();
  try { process.stdout.write(`Codex client ID: ${await provisionCodexClient(database.pool, callback)}\n`); }
  finally { await database.close(); }
} catch (error) {
  process.stderr.write(`${error instanceof Error && error.message.startsWith("Usage:") ? error.message : "OAuth client provisioning failed. Check the callback URL, database, and migrations."}\n`);
  process.exitCode = 1;
}
