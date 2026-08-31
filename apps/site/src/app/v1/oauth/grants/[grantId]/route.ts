import { getProjectDatabase, remoteMcpEnabled, revokeOAuthGrant } from "@rjls/runtime";
import { opaqueIdSchema } from "@rjls/contracts";
import { authenticateRequest, isPolicyResponse, jsonError, requireSameOrigin } from "@/lib/route-policy";
export const runtime = "nodejs";
export async function DELETE(request: Request, context: { params: Promise<{ grantId: string }> }) {
  if (!remoteMcpEnabled()) return new Response(null, { status: 404 });
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const user = await authenticateRequest(request);
  if (isPolicyResponse(user)) return user;
  const id = opaqueIdSchema.safeParse((await context.params).grantId);
  if (!id.success) return jsonError("INVALID_REQUEST", 400);
  try {
    return new Response(null, { status: await revokeOAuthGrant(getProjectDatabase().pool, user.id, id.data) ? 204 : 404 });
  } catch { return jsonError("AUTHORIZATION_UNAVAILABLE", 503); }
}
