import type { ProjectDatabase } from "@theoryfoundry/model-project";
import { createConfiguredAuth as createAuth } from "./auth.js";
import type { AuthenticatedUser } from "./auth.types.js";
import { getProjectDatabase } from "./database.composition.js";
import { recordRejectedOAuthRedirect } from "./oauth-redirect-diagnostics.js";
export function createConfiguredAuth(
  database: Pick<ProjectDatabase, "pool" | "db"> = getProjectDatabase(),
) {
  return createAuth(database);
}
let configuredAuth: ReturnType<typeof createConfiguredAuth> | undefined;

export function getAuth() {
  configuredAuth ??= createConfiguredAuth(getProjectDatabase());
  return configuredAuth;
}

export async function getAuthenticatedUser(
  headers: Headers,
): Promise<AuthenticatedUser | null> {
  const session = await getAuth().api.getSession({ headers });
  if (!session?.user) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  };
}

export async function handleAuthRequest(request: Request): Promise<Response> {
  const auth = getAuth();
  const response = await auth.handler(request);
  if (new URL(request.url).pathname.endsWith("/oauth2/authorize")) {
    const context = await auth.$context;
    await recordRejectedOAuthRedirect(
      request,
      response,
      context.adapter,
      getProjectDatabase().pool,
    );
  }
  return response;
}

export async function provisionAuthenticatedUser(input: {
  email: string;
  password: string;
  name: string;
}): Promise<AuthenticatedUser> {
  const result = await getAuth().api.signUpEmail({ body: input });
  return {
    id: result.user.id,
    email: result.user.email,
    name: result.user.name,
  };
}
