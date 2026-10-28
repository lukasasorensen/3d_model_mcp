import type { Auth } from "better-auth";
import { schema, type ProjectDatabase } from "@theoryfoundry/model-project";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth/minimal";
import { createOAuthPlugins } from "./oauthPlugins.composition.js";
import { remoteMcpEnabled } from "./shared/utils/remoteMcpPolicy.util.js";
type ConfiguredAuthOptions = {
  database: ReturnType<typeof drizzleAdapter>;
  secret: string;
  plugins: ReturnType<typeof createOAuthPlugins> | [];
  disabledPaths: string[];
  baseURL: string;
  trustedOrigins: string[];
  emailAndPassword: { enabled: true; disableSignUp: boolean };
  session: { cookieCache: { enabled: false } };
  advanced: { useSecureCookies: boolean };
};
export function createConfiguredAuth(
  database: Pick<ProjectDatabase, "pool" | "db">,
): Auth<ConfiguredAuthOptions> {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters.");
  return betterAuth<ConfiguredAuthOptions>({
    database: drizzleAdapter(database.db, { provider: "pg", schema }),
    secret,
    plugins: remoteMcpEnabled() ? createOAuthPlugins(database.pool) : [],
    disabledPaths: ["/token"],
    baseURL:
      process.env.BETTER_AUTH_URL ??
      process.env.THEORYFOUNDRY_ALLOWED_ORIGIN ??
      "http://localhost:3000",
    trustedOrigins: [
      process.env.THEORYFOUNDRY_ALLOWED_ORIGIN ?? "http://localhost:3000",
    ],
    emailAndPassword: {
      enabled: true,
      disableSignUp: process.env.THEORYFOUNDRY_AUTH_ALLOW_SIGNUP !== "1",
    },
    session: { cookieCache: { enabled: false } },
    advanced: { useSecureCookies: process.env.NODE_ENV === "production" },
  });
}
