import { browserRenderCompletionSchema, opaqueIdSchema } from "@rjls/contracts";
import { BrowserRenderCompletionError, withConfiguredCadRuntime } from "@rjls/runtime";
import { NO_STORE_HEADERS, authenticateRequest, isPolicyResponse, jsonError, requireSameOrigin } from "@/lib/route-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }): Promise<Response> {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const user = await authenticateRequest(request);
  if (isPolicyResponse(user)) return user;
  const jobId = opaqueIdSchema.safeParse((await context.params).jobId);
  if (!jobId.success) return jsonError("INVALID_REQUEST", 400);
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 128 * 1024) return jsonError("REQUEST_TOO_LARGE", 413);
  let raw: unknown;
  try { raw = await request.json(); }
  catch { return jsonError("INVALID_REQUEST", 400); }
  const completion = browserRenderCompletionSchema.safeParse(raw);
  if (!completion.success || request.headers.get("x-rjls-session-id") !== completion.data.sessionId) {
    return jsonError("SESSION_MISMATCH", 403);
  }
  try {
    await withConfiguredCadRuntime(user.id, (runtime) => runtime.browserRenderer.complete(jobId.data, completion.data));
    return Response.json({ accepted: true }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return error instanceof BrowserRenderCompletionError
      ? jsonError("RENDER_COMPLETION_REJECTED", 409)
      : jsonError("RENDER_SERVICE_UNAVAILABLE", 503);
  }
}
