import { browserRenderCompletionSchema, opaqueIdSchema } from "@rjls/contracts";
import { getConfiguredCadRuntime } from "@rjls/runtime";
import { authenticatedUser, isAuthResponse } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "cache-control": "no-store", "x-content-type-options": "nosniff" };

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }): Promise<Response> {
  const user = await authenticatedUser(request);
  if (isAuthResponse(user)) return user;
  const allowedOrigin = process.env.RJLS_ALLOWED_ORIGIN ?? "http://localhost:3000";
  if (request.headers.get("origin") !== allowedOrigin) return Response.json({ error: { code: "ORIGIN_DENIED" } }, { status: 403, headers });
  const jobId = opaqueIdSchema.safeParse((await context.params).jobId);
  if (!jobId.success) return Response.json({ error: { code: "INVALID_REQUEST" } }, { status: 400, headers });
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 128 * 1024) return Response.json({ error: { code: "REQUEST_TOO_LARGE" } }, { status: 413, headers });
  let raw: unknown;
  try { raw = await request.json(); }
  catch { return Response.json({ error: { code: "INVALID_REQUEST" } }, { status: 400, headers }); }
  const completion = browserRenderCompletionSchema.safeParse(raw);
  if (!completion.success || request.headers.get("x-rjls-session-id") !== completion.data.sessionId) {
    return Response.json({ error: { code: "SESSION_MISMATCH" } }, { status: 403, headers });
  }
  try {
    const configured = await getConfiguredCadRuntime(user.id);
    await configured.browserRenderer.complete(jobId.data, completion.data);
    return Response.json({ accepted: true }, { headers });
  } catch {
    return Response.json({ error: { code: "RENDER_COMPLETION_REJECTED" } }, { status: 409, headers });
  }
}
