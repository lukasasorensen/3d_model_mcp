import type { HostedClient } from "../../installation.types";
export function nativeMcpConfiguration(
  origin: string,
  client: HostedClient,
): string {
  const url = new URL(origin);
  if (
    url.origin !== origin ||
    url.username ||
    url.password ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      ))
  )
    throw new Error("Invalid CAD origin.");
  if (client === "codex")
    return `[mcp_servers.theoryfoundry-cad]
url = ${JSON.stringify(`${origin}/mcp`)}
tool_timeout_sec = 120
scopes = ["cad:tools", "offline_access"]

[mcp_servers.theoryfoundry-cad.oauth]
client_id = "theoryfoundry-codex"
callback_url = "http://127.0.0.1/callback"`;
  if (client !== "claude") throw new Error("Unsupported hosted client.");
  return JSON.stringify(
    {
      mcpServers: {
        "theoryfoundry-cad": {
          type: "http",
          url: `${origin}/mcp`,
          oauth: {
            clientId: "theoryfoundry-claude-code",
            scopes: "cad:tools offline_access",
          },
        },
      },
    },
    null,
    2,
  );
}

export function nativeClaudeCommand(origin: string): string {
  const configuration = JSON.parse(
    nativeMcpConfiguration(origin, "claude"),
  ) as {
    mcpServers: Record<string, unknown>;
  };
  const server = JSON.stringify(configuration.mcpServers["theoryfoundry-cad"]);
  return `claude mcp add-json --scope user theoryfoundry-cad '${server.replaceAll("'", "'\\''")}'`;
}
