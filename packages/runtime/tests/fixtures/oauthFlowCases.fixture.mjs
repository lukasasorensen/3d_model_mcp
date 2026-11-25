import { WORKER_OAUTH_CALLBACK } from "@theoryfoundry/contracts";

const claudeCodeIdentity = {
  clientId: "https://claude.ai/oauth/claude-code-client-metadata",
  callbacks: ["http://localhost/callback", "http://127.0.0.1/callback"],
};
const claudeHostedCallback = "https://claude.ai/api/mcp/auth_callback";

export const oauthFlowCases = [
  { worker: false, profile: "codex", callback: "http://127.0.0.1/callback" },
  {
    worker: false,
    profile: "codex",
    callback: "http://127.0.0.1/callback",
    erase: true,
  },
  { worker: true, profile: "codex", callback: WORKER_OAUTH_CALLBACK },
  {
    worker: false,
    profile: "openai-plugin",
    callback: "http://127.0.0.1/callback",
  },
  {
    worker: false,
    profile: "claude-code",
    callback: "http://localhost/callback",
  },
  {
    worker: false,
    profile: "openai-plugin",
    callback: "https://chatgpt.com/connector_platform_oauth_redirect",
  },
  {
    profile: "claude-hosted-directory",
    callback: claudeHostedCallback,
    directory: {
      clientId: "https://claude.ai/oauth/mcp-oauth-client-metadata",
      callbacks: [claudeHostedCallback],
    },
  },
  ...["http://localhost:41357/callback", "http://127.0.0.1:41357/callback"].map(
    (callback) => ({
      profile: "claude-code-directory",
      callback,
      directory: claudeCodeIdentity,
    }),
  ),
];
