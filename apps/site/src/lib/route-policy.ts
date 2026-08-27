import { getAuthenticatedUser, type AuthenticatedUser } from "@rjls/runtime";

export const NO_STORE_HEADERS = Object.freeze({
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
});

export function jsonError(code: string, status: number, message?: string): Response {
  return Response.json(
    { error: { code, ...(message ? { message } : {}) } },
    { status, headers: NO_STORE_HEADERS },
  );
}

export async function authenticateRequest(
  request: Request,
  getUser: (headers: Headers) => Promise<AuthenticatedUser | null> = getAuthenticatedUser,
): Promise<AuthenticatedUser | Response> {
  try {
    const user = await getUser(request.headers);
    return user ?? jsonError("UNAUTHENTICATED", 401, "Sign in is required.");
  } catch {
    return jsonError("AUTHENTICATION_UNAVAILABLE", 503, "Authentication is temporarily unavailable.");
  }
}

export function isPolicyResponse(value: AuthenticatedUser | Response): value is Response {
  return value instanceof Response;
}

export function configuredOrigin(environment: NodeJS.ProcessEnv = process.env): string {
  return environment.RJLS_ALLOWED_ORIGIN ?? "http://localhost:3000";
}

export function requireSameOrigin(request: Request, environment: NodeJS.ProcessEnv = process.env): Response | undefined {
  const allowedOrigin = configuredOrigin(environment);
  return request.headers.get("origin") === allowedOrigin
    ? undefined
    : jsonError("ORIGIN_DENIED", 403, "The request origin is not allowed.");
}
