import { schema } from "@rjls/model-project";
import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { getProjectDatabase } from "./infrastructure.js";

function createConfiguredAuth() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters.");
  return betterAuth({
    database: drizzleAdapter(getProjectDatabase().db, { provider: "pg", schema }),
    secret,
    baseURL: process.env.BETTER_AUTH_URL ?? process.env.RJLS_ALLOWED_ORIGIN ?? "http://localhost:3000",
    trustedOrigins: [process.env.RJLS_ALLOWED_ORIGIN ?? "http://localhost:3000"],
    emailAndPassword: { enabled: true, disableSignUp: process.env.RJLS_AUTH_ALLOW_SIGNUP !== "1" },
    session: { cookieCache: { enabled: false } },
    advanced: { useSecureCookies: process.env.NODE_ENV === "production" },
  });
}

let configuredAuth: ReturnType<typeof createConfiguredAuth> | undefined;

function getAuth() {
  configuredAuth ??= createConfiguredAuth();
  return configuredAuth;
}

export interface AuthenticatedUser { id: string; email: string; name: string }

export async function getAuthenticatedUser(headers: Headers): Promise<AuthenticatedUser | null> {
  const session = await getAuth().api.getSession({ headers });
  if (!session?.user) return null;
  return { id: session.user.id, email: session.user.email, name: session.user.name };
}

export function handleAuthRequest(request: Request): Promise<Response> {
  return getAuth().handler(request);
}

export async function provisionAuthenticatedUser(input: { email: string; password: string; name: string }): Promise<AuthenticatedUser> {
  const result = await getAuth().api.signUpEmail({ body: input });
  return { id: result.user.id, email: result.user.email, name: result.user.name };
}
