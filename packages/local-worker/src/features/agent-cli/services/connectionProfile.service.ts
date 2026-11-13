import {
  mkdir,
  lstat,
  readFile,
  writeFile,
  rename,
  rm,
} from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import * as z from "zod/v4";
import type { AgentConnection } from "../../../domains/agent-cli/index.js";
const profileSchema = z
  .object({
    server: z.string(),
    account: z.string().min(1).max(200).regex(/^\S+$/),
    allowLoopbackHttp: z.boolean(),
  })
  .strict();
export function validateConnection(
  connection: AgentConnection,
): AgentConnection {
  const parsed = profileSchema.parse(connection);
  const url = new URL(parsed.server);
  if (
    url.origin !== parsed.server ||
    url.username ||
    url.password ||
    (url.protocol !== "https:" &&
      !(
        parsed.allowLoopbackHttp &&
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      ))
  )
    throw new Error(
      "INVALID_ORIGIN: Use a canonical HTTPS origin or explicitly enabled HTTP loopback origin.",
    );
  return parsed;
}
export async function readConnection(
  home: string,
): Promise<AgentConnection | undefined> {
  try {
    const file = join(home, "connection.json");
    if (!(await lstat(file)).isFile())
      throw new Error("UNSAFE_PATH: Connection must be a regular file.");
    return validateConnection(
      JSON.parse(await readFile(file, "utf8")) as AgentConnection,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}
export async function saveConnection(
  home: string,
  connection: AgentConnection,
): Promise<void> {
  await mkdir(home, { recursive: true, mode: 0o700 });
  if ((await lstat(home)).isSymbolicLink())
    throw new Error("UNSAFE_PATH: Connection directory must not be a symlink.");
  const file = join(home, `connection-${randomBytes(8).toString("hex")}.tmp`);
  try {
    await writeFile(
      file,
      JSON.stringify(validateConnection(connection)) + "\n",
      { flag: "wx", mode: 0o600 },
    );
    await rename(file, join(home, "connection.json"));
  } finally {
    await rm(file, { force: true });
  }
}
