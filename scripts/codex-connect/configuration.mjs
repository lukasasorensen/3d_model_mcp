import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { parse, stringify } from "smol-toml";

export function connectionSettings(origin) {
  const url = new URL(origin);
  if (url.origin !== origin || url.username || url.password ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) {
    throw new Error("Use a canonical HTTPS application origin (HTTP is allowed only on loopback).");
  }
  const name = `rjls-cad-${createHash("sha256").update(origin).digest("hex").slice(0, 12)}`;
  const server = { url: `${origin}/mcp`, tool_timeout_sec: 120,
    oauth: { client_id: "rjls-codex", callback_url: "http://127.0.0.1/callback", scopes: ["cad:tools", "offline_access"] } };
  return { name, server };
}

export function mergeConfiguration(original, { name, server }) {
  const config = parse(original);
  if (config.mcp_servers !== undefined && (typeof config.mcp_servers !== "object" || Array.isArray(config.mcp_servers) || config.mcp_servers === null)) {
    throw new Error("mcp_servers must be a TOML table. Configuration was not changed.");
  }
  const existing = config.mcp_servers?.[name];
  if (existing !== undefined) {
    if (isDeepStrictEqual(existing, parse(stringify({ server })).server)) return original;
    throw new Error(`Conflicting server ${name}. Review its settings before retrying; configuration was not changed.`);
  }
  const candidate = `${original}${original.endsWith("\n") || !original ? "" : "\n"}\n# CAD connection installed by Connect to Codex\n${stringify({ mcp_servers: { [name]: server } })}`;
  const expected = { ...config, mcp_servers: { ...config.mcp_servers, [name]: server } };
  if (!isDeepStrictEqual(parse(candidate), parse(stringify(expected)))) throw new Error("Cannot safely append to this TOML layout. Configuration was not changed.");
  return candidate;
}

export async function installConfiguration(path, settings) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  // Exclusive lock protects simultaneous runs of this installer.
  const lock = `${path}.cad-connect.lock`;
  await writeFile(lock, "", { flag: "wx", mode: 0o600 });
  let temporary;
  try {
    let original = "";
    let exists = false;
    try {
      const stat = await lstat(path);
      if (!stat.isFile()) throw new Error("Refusing to replace a symlink or non-file configuration.");
      original = await readFile(path, "utf8");
      exists = true;
    } catch (error) { if (error.code !== "ENOENT") throw error; }
    const candidate = mergeConfiguration(original, settings);
    if (candidate === original) return { changed: false };
    const suffix = randomUUID();
    const backup = exists ? `${path}.cad-backup-${suffix}` : undefined;
    if (backup) await writeFile(backup, original, { flag: "wx", mode: 0o600 });
    temporary = join(dirname(path), `.cad-config-${suffix}.tmp`);
    await writeFile(temporary, candidate, { flag: "wx", mode: 0o600 });
    // Detect edits by another application between reading and replacing the file.
    if (exists && await readFile(path, "utf8") !== original) throw new Error("Configuration changed during installation. Retry.");
    if (!exists) {
      try { await lstat(path); throw new Error("Configuration appeared during installation. Retry."); }
      catch (error) { if (error.code !== "ENOENT") throw error; }
    }
    await rename(temporary, path);
    temporary = undefined;
    return { changed: true, backup };
  } finally {
    if (temporary) await unlink(temporary).catch(() => {});
    await unlink(lock);
  }
}
