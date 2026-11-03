import { readBoundedJson, RequestBodyTooLargeError } from "./shared/http/index";
import {
  getAuth,
  getAuthenticatedUser,
  getProjectDatabase,
  InvitationError,
  isSystemAdmin,
  PlatformInvitations,
} from "@theoryfoundry/runtime";
import { authenticateRequest } from "./authentication.composition";
import {
  configuredOrigin,
  isPolicyResponse,
  jsonError,
  NO_STORE_HEADERS,
  requireSameOrigin,
} from "./features/authentication/index";

export function invitationStore(): PlatformInvitations {
  return new PlatformInvitations(getProjectDatabase().db);
}

function failure(error: unknown): Response {
  return error instanceof InvitationError
    ? jsonError("INVITATION_REJECTED", error.status, error.message)
    : jsonError(
        "INVITATION_UNAVAILABLE",
        503,
        "Invitations are temporarily unavailable.",
      );
}
async function fields(request: Request): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await readBoundedJson(request, 8 * 1024);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError)
      throw new InvitationError(413, "Invitation request is too large.");
    throw new InvitationError(400, "Invalid request.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new InvitationError(400, "Invalid request.");
  return body as Record<string, unknown>;
}
const response = (data: unknown): Response =>
  Response.json(data, { headers: NO_STORE_HEADERS });

export async function handleAdminInvitations(
  request: Request,
): Promise<Response> {
  if (request.method !== "GET") {
    const denied = requireSameOrigin(request);
    if (denied) return denied;
  }
  const user = await authenticateRequest(request);
  if (isPolicyResponse(user)) return user;
  if (!isSystemAdmin(user.id)) return jsonError("FORBIDDEN", 403);
  try {
    const store = invitationStore();
    if (request.method === "GET") return response(await store.list(user.id));
    const body = await fields(request);
    if (request.method === "DELETE" && typeof body.id === "string") {
      await store.revoke(user.id, body.id);
      return response({ revoked: true });
    }
    if (
      request.method !== "POST" ||
      typeof body.email !== "string" ||
      (body.replaceId !== undefined && typeof body.replaceId !== "string")
    )
      throw new InvitationError(400, "Invalid invitation request.");
    const link = new URL("/invite", configuredOrigin());
    const issued = await store.issue(user.id, body.email, body.replaceId);
    link.hash = issued.token;
    return response({ id: issued.id, email: issued.email, link: link.href });
  } catch (error) {
    return failure(error);
  }
}

export async function handleInviteAcceptance(
  request: Request,
): Promise<Response> {
  const denied = requireSameOrigin(request);
  if (denied) return denied;
  try {
    const { token, name, password } = await fields(request);
    if (
      typeof token !== "string" ||
      typeof name !== "string" ||
      typeof password !== "string"
    )
      throw new InvitationError(
        400,
        "Enter your name and password using the invitation link.",
      );
    if (await getAuthenticatedUser(request.headers))
      return jsonError(
        "SIGN_OUT_REQUIRED",
        409,
        "Sign out before accepting this invitation.",
      );
    const policy = (await getAuth().$context).password;
    const email = await invitationStore().accept(token, name, password, policy);
    return response({ email });
  } catch (error) {
    return failure(error);
  }
}
