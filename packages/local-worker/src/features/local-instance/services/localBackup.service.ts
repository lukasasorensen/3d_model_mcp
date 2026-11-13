import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { readFile, writeFile, stat } from "node:fs/promises";
import type {
  LocalInstallation,
  LocalInstanceCapabilities,
  LocalSecrets,
} from "../../../domains/local-instance/index.js";
import {
  localProject,
  localImages,
  localInstallationSchema,
  localSecretsSchema,
} from "../utils/localConfiguration.util.js";
const limit = 256 * 1024 * 1024;
export function encryptLocalBackup(
  payload: Buffer,
  passphrase: string,
): Buffer {
  if (passphrase.length < 12)
    throw new Error("BACKUP_PASSWORD: Use at least 12 characters.");
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(passphrase, salt, 32, {
    N: 32768,
    maxmem: 64 * 1024 * 1024,
  });
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from("TFLOCAL1"));
  const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
  return Buffer.concat([
    Buffer.from("TFLOCAL1"),
    salt,
    iv,
    cipher.getAuthTag(),
    encrypted,
  ]);
}
export function decryptLocalBackup(
  payload: Buffer,
  passphrase: string,
): Buffer {
  if (payload.subarray(0, 8).toString() !== "TFLOCAL1" || payload.length < 53)
    throw new Error("BACKUP_INVALID: Unsupported backup format.");
  const key = scryptSync(passphrase, payload.subarray(8, 24), 32, {
    N: 32768,
    maxmem: 64 * 1024 * 1024,
  });
  const cipher = createDecipheriv("aes-256-gcm", key, payload.subarray(24, 36));
  cipher.setAAD(Buffer.from("TFLOCAL1"));
  cipher.setAuthTag(payload.subarray(36, 52));
  try {
    return Buffer.concat([cipher.update(payload.subarray(52)), cipher.final()]);
  } catch {
    throw new Error(
      "BACKUP_INVALID: Wrong passphrase or damaged backup. No data was restored.",
    );
  }
}
export function snapshotArguments(
  state: LocalInstallation,
  restore = false,
): string[] {
  return [
    "run",
    "--rm",
    ...(restore ? ["--interactive"] : []),
    "--network",
    "none",
    "--read-only",
    ...["database", "exports", "erasures"].flatMap((name) => [
      "--mount",
      `type=volume,src=${localProject(state)}_${name},dst=/snapshot/${name}${restore ? "" : ",readonly"}`,
    ]),
    localImages(state).toolingImage,
    "tar",
    ...(restore
      ? ["-xzf", "-", "-C", "/snapshot"]
      : ["-czf", "-", "-C", "/snapshot", "database", "exports", "erasures"]),
  ];
}
export async function writeLocalBackup(
  capabilities: LocalInstanceCapabilities,
  state: LocalInstallation,
  secrets: LocalSecrets,
  output: string,
  passphrase: string,
): Promise<void> {
  const snapshot = await capabilities.run(snapshotArguments(state), {
    limit,
    signal: capabilities.signal,
  });
  if (snapshot.code !== 0)
    throw new Error(
      "BACKUP_FAILED: Snapshot failed. Services remain stopped and data is preserved.",
    );
  const payload = Buffer.from(
    JSON.stringify({
      state,
      secrets,
      archive: snapshot.stdout.toString("base64"),
    }),
  );
  await writeFile(output, encryptLocalBackup(payload, passphrase), {
    flag: "wx",
    mode: 0o600,
  });
}
export async function readLocalBackup(
  input: string,
  passphrase: string,
): Promise<{
  state: LocalInstallation;
  secrets: LocalSecrets;
  archive: Buffer;
}> {
  if ((await stat(input)).size > limit * 1.5)
    throw new Error(
      "BACKUP_LIMIT: Backup exceeds the supported 256 MiB compressed snapshot limit.",
    );
  const raw: unknown = JSON.parse(
    decryptLocalBackup(await readFile(input), passphrase).toString("utf8"),
  );
  if (
    !raw ||
    typeof raw !== "object" ||
    !("state" in raw) ||
    !("secrets" in raw) ||
    !("archive" in raw) ||
    typeof raw.archive !== "string"
  )
    throw new Error("BACKUP_INVALID: Missing backup metadata.");
  const archive = Buffer.from(raw.archive, "base64");
  if (
    !archive.length ||
    archive.length > limit ||
    archive.toString("base64") !== raw.archive
  )
    throw new Error("BACKUP_INVALID: Invalid snapshot.");
  return {
    state: localInstallationSchema.parse(raw.state),
    secrets: localSecretsSchema.parse(raw.secrets),
    archive,
  };
}
