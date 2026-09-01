import { schema, type ProjectDatabase } from "@rjls/model-project";
import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { createOAuthPlugins } from "./oauth-configuration.js";
import { recordRejectedOAuthRedirect } from "./oauth-redirect-diagnostics.js";
import { remoteMcpEnabled } from "./remote-mcp-policy.js";

import { getProjectDatabase } from "./infrastructure.js";

export function createConfiguredAuth(database: Pick<ProjectDatabase, "pool" | "db"> = getProjectDatabase()) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters.");
  return betterAuth({
    database: drizzleAdapter(database.db, { provider: "pg", schema }),
    secret,
    plugins: remoteMcpEnabled() ? createOAuthPlugins(database.pool) : [],
    disabledPaths: ["/token"],
    baseURL: process.env.BETTER_AUTH_URL ?? process.env.RJLS_ALLOWED_ORIGIN ?? "http://localhost:3000",
    trustedOrigins: [process.env.RJLS_ALLOWED_ORIGIN ?? "http://localhost:3000"],
    emailAndPassword: { enabled: true, disableSignUp: process.env.RJLS_AUTH_ALLOW_SIGNUP !== "1" },
    session: { cookieCache: { enabled: false } },
    advanced: { useSecureCookies: process.env.NODE_ENV === "production" },
  });
}

let configuredAuth: ReturnType<typeof createConfiguredAuth> | undefined;

export function getAuth() {
  configuredAuth ??= createConfiguredAuth();
  return configuredAuth;
}

export interface AuthenticatedUser { id: string; email: string; name: string }

export async function getAuthenticatedUser(headers: Headers): Promise<AuthenticatedUser | null> {
  const session = await getAuth().api.getSession({ headers });
  if (!session?.user) return null;
  return { id: session.user.id, email: session.user.email, name: session.user.name };
}

export async function handleAuthRequest(request: Request): Promise<Response> {
  const auth = getAuth();
  const response = await auth.handler(request);
  if (new URL(request.url).pathname.endsWith("/oauth2/authorize")) {
    const context = await auth.$context;
    await recordRejectedOAuthRedirect(request, response, context.adapter, getProjectDatabase().pool);
  }
  return response;
}

export async function provisionAuthenticatedUser(input: { email: string; password: string; name: string }): Promise<AuthenticatedUser> {
  const result = await getAuth().api.signUpEmail({ body: input });
  return { id: result.user.id, email: result.user.email, name: result.user.name };
}
