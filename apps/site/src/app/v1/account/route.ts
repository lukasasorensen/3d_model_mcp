import { deleteOwnAccount } from "@theoryfoundry/runtime";
import {
  jsonError,
  NO_STORE_HEADERS,
  requireSameOrigin,
} from "../../../features/authentication/index";
import {
  readBoundedJson,
  RequestBodyTooLargeError,
} from "../../../shared/http/index";
import { z } from "zod";

const confirmation = z.strictObject({
  confirmation: z.literal("DELETE"),
  password: z.string().min(1).max(1024),
});

export async function DELETE(request: Request): Promise<Response> {
  const origin = requireSameOrigin(request);
  if (origin) return origin;
  let input;
  try {
    input = confirmation.parse(await readBoundedJson(request, 8192));
  } catch (error) {
    return error instanceof RequestBodyTooLargeError
      ? jsonError("REQUEST_TOO_LARGE", 413)
      : jsonError("INVALID_CONFIRMATION", 400);
  }
  try {
    const result = await deleteOwnAccount(request.headers, input.password);
    if (result === "unauthenticated") return jsonError("UNAUTHENTICATED", 401);
    if (result === "unconfirmed") return jsonError("CONFIRMATION_FAILED", 403);
    return new Response(null, { status: 204, headers: NO_STORE_HEADERS });
  } catch {
    return jsonError("ACCOUNT_DELETION_FAILED", 503);
  }
}
