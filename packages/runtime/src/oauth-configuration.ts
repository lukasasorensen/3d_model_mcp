import { oauthProvider } from "@better-auth/oauth-provider";
import { APIError } from "better-auth/api";
import { jwt } from "better-auth/plugins";
import type { Pool } from "pg";
import { currentOAuthGrant } from "./oauth-authorization.js";
import { REMOTE_MCP_SCOPE, remoteMcpIdentity } from "./remote-mcp-policy.js";

export function createOAuthPlugins(pool: Pool) {
  const { issuer, resource } = remoteMcpIdentity();
  return [jwt({ jwt: { issuer }, jwks: { disablePrivateKeyEncryption: false } }), oauthProvider({
    loginPage: "/sign-in", consentPage: "/consent",
    scopes: [REMOTE_MCP_SCOPE, "offline_access"],
    resources: [{ identifier: resource, name: "CAD MCP", allowedScopes: [REMOTE_MCP_SCOPE, "offline_access"] }],
    enforcePerClientResources: true,
    grantTypes: ["authorization_code", "refresh_token"],
    allowDynamicClientRegistration: false, allowUnauthenticatedClientRegistration: false,
    clientPrivileges: () => false, resourcePrivileges: () => false,
    accessTokenExpiresIn: 300, refreshTokenExpiresIn: 30 * 24 * 60 * 60, codeExpiresIn: 300,
    refreshTokenReuseInterval: 0, storeTokens: "hashed", storeClientSecret: "hashed",
    async customAccessTokenClaims({ user, metadata, resources }) {
      const clientId = metadata?.cadClientId;
      if (!user || typeof clientId !== "string" || !resources?.includes(resource)) throw new APIError("BAD_REQUEST", { error: "invalid_grant" });
      const grant = await currentOAuthGrant(pool, user.id, clientId, resource);
      if (!grant) throw new APIError("BAD_REQUEST", { error: "invalid_grant" });
      return { cad_grant: grant };
    },
  })];
}
