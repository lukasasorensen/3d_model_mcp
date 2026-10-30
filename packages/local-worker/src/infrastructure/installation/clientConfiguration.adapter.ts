import { createHash } from "node:crypto";
import { isDeepStrictEqual, promisify } from "node:util";
import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { realpath } from "node:fs/promises";
import { parse, stringify } from "smol-toml";
import type {
  ClientInstallation,
  ConfigurationReceipt,
  WorkerPackage,
} from "../../domains/installation/index.js";
import { LocalWorkerError } from "../../shared/utils/workerError.util.js";
import { writeConfiguration } from "./configurationFiles.util.js";

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new LocalWorkerError(
      "INVALID_CONFIG",
      "Client configuration must contain objects. No configuration was changed.",
    );
  return value as Record<string, unknown>;
}

export function clientSettings(
  installation: ClientInstallation,
  metadata: WorkerPackage,
): { name: string; server: Record<string, unknown> } {
  const { target, client } = installation;
  if (!target.account)
    throw new LocalWorkerError(
      "LOGIN_REQUIRED",
      "Log in before installing client configuration.",
    );
  const name = `theoryfoundry-local-${createHash("sha256")
    .update(JSON.stringify([target.server, target.account]))
    .digest("hex")
    .slice(0, 12)}`;
  const args = [
    "--silent",
    "dlx",
    `${metadata.name}@${metadata.version}`,
    "serve",
    "--server",
    target.server,
    "--account",
    target.account,
  ];
  if (target.allowLoopbackHttp) args.push("--allow-loopback-http");
  return {
    name,
    server: {
      ...(client === "claude" ? { type: "stdio" } : {}),
      command: "pnpm",
      args,
      ...(client === "codex"
        ? { startup_timeout_sec: 60, tool_timeout_sec: 120 }
        : {}),
    },
  };
}

export function mergeClientConfiguration(
  source: string,
  installation: ClientInstallation,
  metadata: WorkerPackage,
): string {
  const { name, server } = clientSettings(installation, metadata);
  const codex = installation.client === "codex";
  let config: Record<string, unknown>;
  try {
    config = record(
      source.trim()
        ? codex
          ? parse(source)
          : (JSON.parse(source) as unknown)
        : {},
    );
  } catch {
    throw new LocalWorkerError(
      "INVALID_CONFIG",
      "Client configuration could not be parsed. Repair it before retrying setup.",
    );
  }
  const key = codex ? "mcp_servers" : "mcpServers";
  const servers = config[key] === undefined ? {} : record(config[key]);
  if (servers[name] !== undefined) {
    if (
      isDeepStrictEqual(
        servers[name],
        codex
          ? parse(stringify({ server } as Parameters<typeof stringify>[0]))
              .server
          : server,
      )
    )
      return source;
    throw new LocalWorkerError(
      "CONFIG_CONFLICT",
      `Conflicting connection ${name}. Review or remove that entry before retrying; other settings are preserved.`,
    );
  }
  if (!codex)
    return (
      JSON.stringify(
        { ...config, [key]: { ...servers, [name]: server } },
        null,
        2,
      ) + "\n"
    );
  const candidate = `${source}${source.endsWith("\n") || !source ? "" : "\n"}\n# TheoryFoundry local worker\n${stringify({ mcp_servers: { [name]: server } } as Parameters<typeof stringify>[0])}`;
  if (
    !isDeepStrictEqual(
      parse(candidate),
      parse(
        stringify({
          ...config,
          [key]: { ...servers, [name]: server },
        } as Parameters<typeof stringify>[0]),
      ),
    )
  )
    throw new LocalWorkerError(
      "INVALID_CONFIG",
      "Cannot safely append to this TOML layout.",
    );
  return candidate;
}

export async function configureClient(
  installation: ClientInstallation,
  metadata: WorkerPackage,
  signal: AbortSignal,
  options: {
    home?: string;
    cwd?: string;
    environment?: NodeJS.ProcessEnv;
    checkClient?: boolean;
  } = {},
): Promise<ConfigurationReceipt> {
  const home = options.home ?? homedir();
  const cwd = options.cwd ?? process.cwd();
  const environment = options.environment ?? process.env;
  signal.throwIfAborted();
  if (options.checkClient !== false) {
    try {
      await promisify(execFile)(installation.client, ["--version"], {
        signal,
        timeout: 15000,
        env: environment,
      });
    } catch {
      throw new LocalWorkerError(
        "CLIENT_UNAVAILABLE",
        `Install ${installation.client} and make it available on PATH before setup.`,
      );
    }
  }
  if (installation.scope === "project") {
    try {
      const root = await promisify(execFile)(
        "git",
        ["rev-parse", "--show-toplevel"],
        { cwd, signal, timeout: 5000 },
      );
      if ((await realpath(root.stdout.trim())) !== (await realpath(cwd)))
        throw new Error();
    } catch {
      throw new LocalWorkerError(
        "PROJECT_ROOT_REQUIRED",
        "Run project setup at the root of your local Git repository.",
      );
    }
  }
  if (installation.client === "claude" && environment.CLAUDE_CONFIG_DIR)
    throw new LocalWorkerError(
      "CUSTOM_CLAUDE_CONFIG",
      "Automatic setup requires the standard Claude configuration location. Use login to print the serve command, then register it manually for a custom CLAUDE_CONFIG_DIR.",
    );
  if (
    installation.client === "codex" &&
    environment.CODEX_HOME &&
    !isAbsolute(environment.CODEX_HOME)
  )
    throw new LocalWorkerError(
      "INVALID_CONFIG_PATH",
      "CODEX_HOME must be an absolute path.",
    );
  const path =
    installation.client === "codex"
      ? join(
          installation.scope === "project"
            ? join(cwd, ".codex")
            : environment.CODEX_HOME || join(home, ".codex"),
          "config.toml",
        )
      : installation.scope === "project"
        ? join(cwd, ".mcp.json")
        : join(home, ".claude.json");
  return writeConfiguration(
    path,
    (source) => mergeClientConfiguration(source, installation, metadata),
    signal,
  );
}
