import { parseArgs } from "node:util";
import { resolve } from "node:path";
import type { LocalCommand } from "../../../domains/local-instance/index.js";
export function parseLocalCommand(args: string[]): LocalCommand {
  const command = args[0];
  if (
    ![
      "start",
      "status",
      "stop",
      "logs",
      "backup",
      "restore",
      "upgrade",
      "setup",
    ].includes(command ?? "")
  )
    throw new Error(
      "USAGE: local start|status|stop|logs|setup|backup --output <file>|restore --input <file>|upgrade --release <file> --output <backup> [--port <port>] [--source <checkout>] [--open] [--json]",
    );
  const parsed = parseArgs({
    args: args.slice(1),
    options: {
      source: { type: "string" },
      port: { type: "string" },
      output: { type: "string" },
      input: { type: "string" },
      release: { type: "string" },
      open: { type: "boolean" },
      json: { type: "boolean" },
    },
    strict: true,
    allowPositionals: false,
    tokens: true,
  });
  const names = parsed.tokens
    .filter((t) => t.kind === "option")
    .map((t) => t.name);
  if (new Set(names).size !== names.length)
    throw new Error("USAGE: Duplicate options are not supported.");
  const { values } = parsed;
  const allowed: Record<string, string[]> = {
    start: ["source", "port", "open", "json"],
    status: ["json"],
    stop: ["json"],
    logs: ["json"],
    setup: ["json"],
    backup: ["output", "json"],
    restore: ["input", "port", "json"],
    upgrade: ["release", "output", "source", "json"],
  };
  if (names.some((name) => !allowed[command!]!.includes(name)))
    throw new Error("USAGE: Option does not apply to this operation.");
  if (
    (command === "backup" && !values.output) ||
    (command === "restore" && !values.input) ||
    (command === "upgrade" && (!values.release || !values.output))
  )
    throw new Error(
      "USAGE: Backup/restore/upgrade require explicit artifact paths.",
    );
  const port = values.port === undefined ? undefined : Number(values.port);
  if (
    port !== undefined &&
    (!/^\d+$/.test(values.port!) ||
      !Number.isInteger(port) ||
      port < 1024 ||
      port > 65535)
  )
    throw new Error("USAGE: Port must be between 1024 and 65535.");
  return {
    command: command as LocalCommand["command"],
    open: values.open ?? false,
    ...(port === undefined ? {} : { port }),
    ...Object.fromEntries(
      ["source", "output", "input", "release"].flatMap((key) => {
        const value = values[key as "source"];
        return value ? [[key, resolve(value)]] : [];
      }),
    ),
  };
}
