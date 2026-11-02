import { getProjectDatabase } from "./database.composition.js";
import {
  provisionOAuthClient,
  provisionWorkerClient,
  validateClientCallback,
  type OAuthClientProfile,
} from "./features/authentication/index.js";
const arguments_ = process.argv
  .slice(2)
  .filter((argument) => argument !== "--");
const worker = arguments_[0] === "--worker";
const profileIndex = arguments_.indexOf("--profile");
const profile = (
  profileIndex < 0 ? "codex" : arguments_[profileIndex + 1]
) as OAuthClientProfile;
const remaining =
  profileIndex < 0
    ? arguments_
    : arguments_.filter(
        (_, index) => index !== profileIndex && index !== profileIndex + 1,
      );
const replaceCallbacks = remaining[0] === "--replace";
const callback = remaining[replaceCallbacks ? 1 : 0];
try {
  if (
    worker
      ? arguments_.length !== 1
      : !callback || !profile || remaining.length !== (replaceCallbacks ? 2 : 1)
  ) {
    throw new Error(
      "Usage: pnpm oauth:provision -- --worker | [--profile codex|openai-plugin|claude-code] [--replace] <exact-callback-url>",
    );
  }
  if (!worker) validateClientCallback(profile, callback!);
  const database = getProjectDatabase();
  try {
    const clientId = worker
      ? await provisionWorkerClient(database.pool)
      : await provisionOAuthClient(database.pool, callback!, {
          replaceCallbacks,
          profile,
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
