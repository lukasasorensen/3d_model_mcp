import { parseArgs } from "node:util";
import type {
  WorkerCommand,
  WorkerTarget,
} from "../../../domains/installation/index.js";
import { LocalWorkerError } from "../../../shared/utils/workerError.util.js";
export function parseWorkerCommand(args: string[]): WorkerCommand {
  const usage = (): never => {
    throw new LocalWorkerError(
      "USAGE",
      "Use --help for setup, serve, login, logout and doctor options. Credentials must never be passed as arguments.",
    );
  };
  if (
    args.length === 0 ||
    (args.length === 1 && ["--help", "help", "-h"].includes(args[0]!))
  )
    return { command: "help" };
  if (args.length === 1 && args[0] === "--version")
    return { command: "version" };
  const command = args[0];
  if (!["setup", "serve", "login", "logout", "doctor"].includes(command ?? ""))
    return usage();
  let parsed;
  try {
    parsed = parseArgs({
      args: args.slice(1),
      options: {
        client: { type: "string" },
        scope: { type: "string" },
        server: { type: "string" },
        account: { type: "string" },
        "allow-loopback-http": { type: "boolean" },
        json: { type: "boolean" },
      },
      tokens: true,
      strict: true,
      allowPositionals: false,
    });
  } catch {
    return usage();
  }
  const names = parsed.tokens
    .filter((token) => token.kind === "option")
    .map((token) => token.name);
  if (new Set(names).size !== names.length) return usage();
  const { values } = parsed;
  if (command === "setup" && !names.length) return { command };
  if (command !== "setup" && (values.client || values.scope)) return usage();
  if (
    command === "setup" &&
    (!values.server ||
      !["codex", "claude"].includes(values.client ?? "") ||
      (values.scope && !["global", "project"].includes(values.scope)))
  )
    return usage();
  if (values.json && command !== "doctor") return usage();
  if (
    command === "doctor" &&
    !values.server &&
    !values.account &&
    !values["allow-loopback-http"]
  )
    return { command, json: values.json ?? false };
  if (
    !values.server ||
    (!["login", "setup"].includes(command!) && !values.account) ||
    (command === "login" && values.account)
  )
    return usage();
  let origin: URL;
  try {
    origin = new URL(values.server);
  } catch {
    return usage();
  }
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(
    origin.hostname,
  );
  if (
    origin.origin !== values.server ||
    origin.username ||
    origin.password ||
    (origin.protocol !== "https:" &&
      !(
        origin.protocol === "http:" &&
        loopback &&
        values["allow-loopback-http"]
      ))
  )
    throw new LocalWorkerError(
      "INVALID_ORIGIN",
      "Use a canonical HTTPS origin without a path or trailing slash; loopback HTTP requires --allow-loopback-http.",
    );
  if (
    values.account &&
    (values.account.length > 200 ||
      [...values.account].some(
        (value) => value.charCodeAt(0) <= 32 || value.charCodeAt(0) === 127,
      ))
  )
    return usage();
  const target: WorkerTarget = {
    server: values.server,
    ...(values.account ? { account: values.account } : {}),
    allowLoopbackHttp: values["allow-loopback-http"] ?? false,
  };
  if (command === "setup")
    return {
      command,
      installation: {
        client: values.client as "codex" | "claude",
        scope: (values.scope ?? "global") as "global" | "project",
        target,
      },
    };
  if (command === "doctor")
    return { command, target, json: values.json ?? false };
  return { command: command as "serve" | "login" | "logout", target };
}
