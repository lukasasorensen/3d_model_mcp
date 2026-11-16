import { randomBytes } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  lstat,
  rename,
  rm,
} from "node:fs/promises";
import { join } from "node:path";
import type {
  LocalInstallation,
  LocalInstanceCapabilities,
  LocalSecrets,
} from "../../../domains/local-instance/index.js";
import {
  localInstallationSchema,
  localSecretsSchema,
  localReleaseSchema,
} from "../utils/localConfiguration.util.js";
export async function privateDirectory(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if ((await lstat(directory)).isSymbolicLink())
    throw new Error(
      "UNSAFE_PATH: Installation directory must not be a symlink.",
    );
}
export async function readInstallation(
  home: string,
): Promise<LocalInstallation | undefined> {
  try {
    const file = join(home, "installation.json");
    if (!(await lstat(file)).isFile())
      throw new Error("UNSAFE_PATH: Installation must be a regular file.");
    return localInstallationSchema.parse(
      JSON.parse(await readFile(file, "utf8")),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}
export async function saveInstallation(
  home: string,
  state: LocalInstallation,
): Promise<void> {
  const temporary = join(
    home,
    `installation-${randomBytes(8).toString("hex")}.tmp`,
  );
  try {
    await writeFile(
      temporary,
      JSON.stringify(localInstallationSchema.parse(state), null, 2) + "\n",
      { mode: 0o600, flag: "wx" },
    );
    await rename(temporary, join(home, "installation.json"));
  } finally {
    await rm(temporary, { force: true });
  }
}
export async function createInstallation(
  capabilities: LocalInstanceCapabilities,
  port = 43100,
): Promise<LocalInstallation> {
  const release = localReleaseSchema.parse(
    JSON.parse(
      await readFile(join(capabilities.assets, "local-release.json"), "utf8"),
    ),
  );
  const state: LocalInstallation = {
    format: 1,
    id: randomBytes(8).toString("hex"),
    port,
    release,
  };
  const hex = (): string => randomBytes(32).toString("hex");
  const secrets: LocalSecrets = {
    database: hex(),
    auth: hex(),
    setup: hex(),
    ai: randomBytes(32).toString("base64"),
  };
  await capabilities.secrets(state.id, secrets);
  await saveInstallation(capabilities.home, state);
  return state;
}
export async function requireLocalSecrets(
  capabilities: LocalInstanceCapabilities,
  state: LocalInstallation,
): Promise<LocalSecrets> {
  const secrets = await capabilities.secrets(state.id);
  if (!secrets)
    throw new Error(
      "CREDENTIAL_STORE: Local installation secrets are missing. Restore an encrypted backup; never generate replacements for existing data.",
    );
  return localSecretsSchema.parse(secrets);
}
