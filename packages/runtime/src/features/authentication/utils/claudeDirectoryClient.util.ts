import { z } from "zod";

const CLAUDE_DIRECTORY_CLIENTS = [
  {
    clientId: "https://claude.ai/oauth/mcp-oauth-client-metadata",
    name: "Claude (claude.ai)",
    callbacks: ["https://claude.ai/api/mcp/auth_callback"],
    applicationType: "web",
  },
  {
    clientId: "https://claude.ai/oauth/claude-code-client-metadata",
    name: "Claude Code (claude.ai)",
    callbacks: ["http://localhost/callback", "http://127.0.0.1/callback"],
    applicationType: "native",
  },
] as const;

const METADATA_TIMEOUT_MS = 5_000;
const MAX_METADATA_BYTES = 5_120;

const metadataSchema = z.object({
  client_id: z.string(),
  redirect_uris: z.array(z.string()),
  token_endpoint_auth_method: z.literal("none"),
});

type ClaudeDirectoryClient = (typeof CLAUDE_DIRECTORY_CLIENTS)[number];

export function claudeDirectoryClient(
  id: string,
): ClaudeDirectoryClient | undefined {
  return CLAUDE_DIRECTORY_CLIENTS.find((client) => client.clientId === id);
}

export async function verifyClaudeClientMetadata(
  client: ClaudeDirectoryClient,
): Promise<boolean> {
  try {
    // Only these fixed Anthropic URLs are fetched. Redirects are forbidden.
    const response = await fetch(client.clientId, {
      headers: { accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
    });
    const contentType = response.headers.get("content-type")?.split(";")[0];
    if (!response.ok || contentType !== "application/json") {
      await response.body?.cancel();
      return false;
    }
    const reader = response.body?.getReader();
    if (!reader) return false;

    const decoder = new TextDecoder();
    let body = "";
    let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_METADATA_BYTES) {
          await reader.cancel();
          return false;
        }
        body += decoder.decode(value, { stream: true });
      }
    } finally {
      reader.releaseLock();
    }

    const metadata = metadataSchema.safeParse(
      JSON.parse(body + decoder.decode()),
    );
    return (
      metadata.success &&
      metadata.data.client_id === client.clientId &&
      metadata.data.redirect_uris.length === client.callbacks.length &&
      client.callbacks.every((uri) => metadata.data.redirect_uris.includes(uri))
    );
  } catch {
    return false;
  }
}
