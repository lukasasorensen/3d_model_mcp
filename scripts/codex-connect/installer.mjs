import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { realpath } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { connectionSettings, installConfiguration } from "./configuration.mjs";

export function configurationPath(scope, cwd, environment, home) {
  if (scope === "project") return join(cwd, ".codex", "config.toml");
  if (scope !== "global") throw new Error("Scope must be global or project.");
  if (environment.CODEX_HOME && !isAbsolute(environment.CODEX_HOME)) throw new Error("CODEX_HOME must be an absolute path.");
  return join(environment.CODEX_HOME || join(home, ".codex"), "config.toml");
}

export function oauthArguments({ name, server }) {
  // Explicit overrides let login work before the repository has been trusted.
  return ["mcp", "login", name, "--scopes", "cad:tools,offline_access",
    "-c", `mcp_servers.${name}.url=${JSON.stringify(server.url)}`,
    "-c", `mcp_servers.${name}.oauth.client_id=${JSON.stringify(server.oauth.client_id)}`,
    "-c", `mcp_servers.${name}.oauth.callback_url=${JSON.stringify(server.oauth.callback_url)}`];
}

export async function runInstaller(args, { cwd = process.cwd(), environment = process.env, home = homedir(), run = spawnSync, log = console.log } = {}) {
  if (args.length !== 2) throw new Error("Usage: node connect-codex-v1.mjs <application-origin> <global|project>");
  if (Number(process.versions.node.split(".")[0]) < 22) throw new Error("Install Node.js 22 or newer, then retry.");
  const [origin, scope] = args;
  const settings = connectionSettings(origin);
  const path = configurationPath(scope, cwd, environment, home);
  const version = run("codex", ["--version"], { encoding: "utf8", env: environment });
  if (version.error || version.status !== 0) throw new Error("Install the Codex CLI and ensure codex is on PATH, then retry.");
  if (scope === "project") {
    const root = run("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8", env: environment });
    if (root.status !== 0 || resolve(root.stdout.trim()) !== await realpath(cwd)) throw new Error("Run repository setup from the root of your Git repository.");
  }
  const result = await installConfiguration(path, settings);
  log(`Configuration ${result.changed ? "saved" : "already installed"}: ${path}`);
  if (result.backup) log(`Previous configuration backed up to: ${result.backup}`);
  if (scope === "project") log("Trust this repository in Codex before using its MCP configuration.");
  log("Opening Codex authorization. Sign in and approve CAD access in your browser.");
  const loginArgs = oauthArguments(settings);
  const login = run("codex", loginArgs, { cwd, env: environment, stdio: "inherit" });
  if (login.error || login.status !== 0) {
    log("Configuration is installed, but authorization did not finish. Retry with:");
    log(["codex", ...loginArgs].map(shellQuote).join(" "));
    throw new Error("Authorization incomplete. If the callback is rejected, ask the operator to provision http://127.0.0.1/callback.");
  }
  log("Authorization completed. Restart Codex or start a fresh session to load the server. Keep your CAD project tab visible while rendering.");
}

function shellQuote(value) { return `'${value.replaceAll("'", "'\\''")}'`; }
