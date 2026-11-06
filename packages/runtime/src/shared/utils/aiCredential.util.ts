import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { AiConnectionError } from "@theoryfoundry/contracts";

export interface AiEncryptionKeys {
  active: string;
  keys: Readonly<Record<string, string>>;
}
export function configuredAiKeys(): AiEncryptionKeys {
  try {
    const keys: unknown = JSON.parse(
      process.env.THEORYFOUNDRY_AI_ENCRYPTION_KEYS ?? "{}",
    );
    const active = process.env.THEORYFOUNDRY_AI_ENCRYPTION_KEY_ID ?? "";
    if (
      !keys ||
      typeof keys !== "object" ||
      Array.isArray(keys) ||
      !Object.values(keys).every(
        (key) =>
          typeof key === "string" &&
          /^[A-Za-z0-9+/]{43}=$/.test(key) &&
          Buffer.from(key, "base64").length === 32,
      )
    )
      throw new Error();
    return { active, keys: keys as Record<string, string> };
  } catch {
    throw new AiConnectionError("AI_CONFIGURATION");
  }
}
function keyFor(keys: AiEncryptionKeys, id: string): Buffer {
  const value = keys.keys[id];
  if (!value || Buffer.from(value, "base64").length !== 32)
    throw new AiConnectionError("AI_CONFIGURATION");
  return Buffer.from(value, "base64");
}
export function encryptAiCredential(
  token: string,
  owner: string,
  connection: string,
  keys = configuredAiKeys(),
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor(keys, keys.active), iv);
  cipher.setAAD(Buffer.from(JSON.stringify([owner, connection])));
  const ciphertext = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  return JSON.stringify({
    version: 1,
    keyId: keys.active,
    iv: iv.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  });
}
export function decryptAiCredential(
  raw: string,
  owner: string,
  connection: string,
  keys = configuredAiKeys(),
): string {
  try {
    const data = JSON.parse(raw) as {
      version: number;
      keyId: string;
      iv: string;
      ciphertext: string;
      tag: string;
    };
    if (data.version !== 1) throw new Error();
    const decipher = createDecipheriv(
      "aes-256-gcm",
      keyFor(keys, data.keyId),
      Buffer.from(data.iv, "base64"),
    );
    decipher.setAAD(Buffer.from(JSON.stringify([owner, connection])));
    decipher.setAuthTag(Buffer.from(data.tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(data.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new AiConnectionError("AI_CONFIGURATION");
  }
}
