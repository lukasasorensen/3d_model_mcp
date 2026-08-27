import { getAuthenticatedUser, type AuthenticatedUser } from "@rjls/runtime";

export const noStoreHeaders = { "cache-control": "no-store", "x-content-type-options": "nosniff" };

export async function authenticatedUser(request: Request): Promise<AuthenticatedUser | Response> {
  try {
    const user = await getAuthenticatedUser(request.headers);
    if (user) return user;
  } catch {
    // Authentication failures expose no database or cookie detail.
  }
  return Response.json({ error: { code: "UNAUTHENTICATED", message: "Sign in is required." } }, { status: 401, headers: noStoreHeaders });
}

export function isAuthResponse(value: AuthenticatedUser | Response): value is Response {
  return value instanceof Response;
}

export function isCadDomainError(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === code;
}
