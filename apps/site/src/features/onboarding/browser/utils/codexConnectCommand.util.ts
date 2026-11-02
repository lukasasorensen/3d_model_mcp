export type CodexConnectionScope = "global" | "project";

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function codexConnectCommand(
  origin: string,
  scope: CodexConnectionScope,
): string {
  const url = new URL(origin);
  if (
    url.origin !== origin ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      ))
  ) {
    throw new Error("Invalid CAD origin.");
  }
  if (scope !== "global" && scope !== "project")
    throw new Error("Invalid Codex scope.");
  return `npx --yes @tfoundry/connect-codex@0.1.0 ${shellQuote(origin)} ${shellQuote(scope)}`;
}

export function codexStarterPrompt(projectId: string): string {
  return `Using the CAD MCP tools, inspect project ${projectId} and describe its current model. Ask me what I would like to change before editing it.`;
}
