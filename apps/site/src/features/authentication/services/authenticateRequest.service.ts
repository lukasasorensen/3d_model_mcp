import { type AuthenticatedUser } from "@theoryfoundry/runtime";
import { jsonError } from "../utils/requestPolicy.util";
export async function authenticateRequest(
  request: Request,
  getUser: (headers: Headers) => Promise<AuthenticatedUser | null>,
): Promise<AuthenticatedUser | Response> {
  try {
    const user = await getUser(request.headers);
    return user ?? jsonError("UNAUTHENTICATED", 401, "Sign in is required.");
  } catch {
    return jsonError(
      "AUTHENTICATION_UNAVAILABLE",
      503,
      "Authentication is temporarily unavailable.",
    );
  }
}
