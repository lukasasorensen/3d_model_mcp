import { parseArgs } from "node:util";
import { resolve } from "node:path";
import type { AgentCommand } from "../../../domains/agent-cli/index.js";
export function parseAgentCommand(args: string[]): AgentCommand {
  const command = args[0];
  if (!["connect", "call", "tools"].includes(command ?? ""))
    throw new Error(
      "USAGE: connect --server <origin> [--account <id>] [--allow-loopback-http] | call <tool> --input-file <json> [--output <file>] | tools [--json]",
    );
  const tool = command === "call" ? args[1] : undefined;
  const parsed = parseArgs({
    args: args.slice(command === "call" ? 2 : 1),
    options: {
      server: { type: "string" },
      account: { type: "string" },
      "allow-loopback-http": { type: "boolean" },
      "input-file": { type: "string" },
      output: { type: "string" },
      json: { type: "boolean" },
    },
    tokens: true,
    strict: true,
    allowPositionals: false,
  });
  const names = parsed.tokens
    .filter((token) => token.kind === "option")
    .map((token) => token.name);
  if (new Set(names).size !== names.length)
    throw new Error("USAGE: Duplicate options are not supported.");
  const v = parsed.values;
  if (
    (command === "connect" && (!v.server || v.output || v["input-file"])) ||
    (command === "call" && (!tool || !v["input-file"])) ||
    (command === "tools" && (v.output || v["input-file"]))
  )
    throw new Error("USAGE: Invalid options for agent command.");
  return {
    command: command as AgentCommand["command"],
    allowLoopbackHttp: v["allow-loopback-http"] ?? false,
    ...(v.server ? { server: v.server } : {}),
    ...(v.account ? { account: v.account } : {}),
    ...(tool ? { tool } : {}),
    ...(v["input-file"] ? { input: resolve(v["input-file"]) } : {}),
    ...(v.output ? { output: resolve(v.output) } : {}),
  };
}
