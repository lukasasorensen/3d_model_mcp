import type {
  AgentCommand,
  AgentCapabilities,
} from "../../../domains/agent-cli/index.js";
import {
  readConnection,
  saveConnection,
  validateConnection,
} from "../services/connectionProfile.service.js";
import { executeCadCommand } from "../services/cadCommand.service.js";
export async function runAgentCommand(
  command: AgentCommand,
  capabilities: AgentCapabilities,
): Promise<Record<string, unknown>> {
  const saved = await readConnection(capabilities.home);
  if (command.command === "connect") {
    // Validate before setup can download anything or authentication opens a browser.
    const target = validateConnection({
      server: command.server!,
      account: command.account ?? "pending",
      allowLoopbackHttp: command.allowLoopbackHttp,
    });
    const account =
      command.account ??
      (saved?.server === target.server ? saved.account : undefined);
    await capabilities.setup();
    const authenticated = await capabilities.authenticate(
      target.server,
      target.allowLoopbackHttp,
      account,
    );
    if (command.account && command.account !== authenticated)
      throw new Error(
        "ACCOUNT_MISMATCH: Authorization returned a different account; no profile was changed.",
      );
    const connection = { ...target, account: authenticated };
    await saveConnection(capabilities.home, connection);
    return {
      connected: true,
      ...connection,
      next: "Run tools or call list_projects with an empty JSON input file. CAD calls work in this chat; no MCP registration or restart is required.",
    };
  }
  if (!saved)
    throw new Error("LOGIN_REQUIRED: Run connect --server <origin> first.");
  if (
    (command.server && command.server !== saved.server) ||
    (command.account && command.account !== saved.account)
  )
    throw new Error(
      "CONNECTION_MISMATCH: Run connect explicitly before switching instances or accounts.",
    );
  return executeCadCommand(command, saved, capabilities);
}
