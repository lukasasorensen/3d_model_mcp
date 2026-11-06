import { AsyncEntry } from "@napi-rs/keyring";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import * as z from "zod/v4";
import { AiConnectionError } from "@theoryfoundry/contracts";

const credentialSchema = z
  .object({
    id: z.string().uuid(),
    secret: z.string().regex(/^[a-f0-9]{64}$/),
    token: z.string().min(1).max(4096).optional(),
  })
  .strict();
export async function companionCredentials(
  identity: string,
  configureToken: boolean,
  prompt: () => Promise<string>,
): Promise<{ id: string; secret: string; token?: string | undefined }> {
  const entry = new AsyncEntry(
    "TheoryFoundry AI Companion",
    createHash("sha256").update(identity).digest("hex"),
    { linux: { store: "secret-service" } },
  );
  try {
    const saved = await entry.getPassword();
    const credentials =
      saved === null
        ? { id: randomUUID(), secret: randomBytes(32).toString("hex") }
        : credentialSchema.parse(JSON.parse(saved));
    if (configureToken) {
      const token = await prompt();
      const parsed = credentialSchema.parse({
        id: credentials.id,
        secret: credentials.secret,
        ...(token ? { token } : {}),
      });
      await entry.setPassword(JSON.stringify(parsed));
      return parsed;
    }
    if (saved === null) await entry.setPassword(JSON.stringify(credentials));
    return credentials;
  } catch {
    throw new AiConnectionError("AI_CONFIGURATION");
  }
}
export async function promptLocalAiToken(
  signal?: AbortSignal,
): Promise<string> {
  signal?.throwIfAborted();
  if (!process.stdin.isTTY) throw new AiConnectionError("AI_CONFIGURATION");
  process.stderr.write(
    "Local API token (hidden; leave blank for no authentication): ",
  );
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise<string>((resolve, reject) => {
    let value = "";
    const finish = (): void => {
      process.stdin.off("data", read);
      signal?.removeEventListener("abort", cancel);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stderr.write("\n");
    };
    const cancel = (): void => {
      finish();
      reject(new AiConnectionError("AI_CONFIGURATION"));
    };
    const read = (chunk: Buffer): void => {
      for (const char of chunk.toString("utf8")) {
        if (char === "\u0003") {
          finish();
          reject(new AiConnectionError("AI_CONFIGURATION"));
          return;
        }
        if (char === "\r" || char === "\n") {
          finish();
          resolve(value);
          return;
        }
        if (char === "\u007f") value = value.slice(0, -1);
        else if (char.charCodeAt(0) >= 32 && value.length < 4096) value += char;
      }
    };
    process.stdin.on("data", read);
    signal?.addEventListener("abort", cancel, { once: true });
  });
}
