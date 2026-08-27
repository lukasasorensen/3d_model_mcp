import { schema } from "@rjls/model-project";
import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { getProjectDatabase } from "./infrastructure.js";

export interface ConfiguredAuth {
  handler(request: Request): Promise<Response>;
  api: {
    getSession(input: { headers: Headers }): Promise<{ user: { id: string; email: string; name: string } } | null>;
    signUpEmail(input: { body: { email: string; password: string; name: string } }): Promise<{ user: { id: string; email: string; name: string } }>;
  };
}

function createConfiguredAuth(): ConfiguredAuth {
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
  }) as unknown as ConfiguredAuth;
}

let configuredAuth: ConfiguredAuth | undefined;

export function getAuth(): ConfiguredAuth {
  configuredAuth ??= createConfiguredAuth();
  return configuredAuth;
}

export interface AuthenticatedUser { id: string; email: string; name: string }

export async function getAuthenticatedUser(headers: Headers): Promise<AuthenticatedUser | null> {
  const session = await getAuth().api.getSession({ headers });
  if (!session?.user) return null;
  return { id: session.user.id, email: session.user.email, name: session.user.name };
}
