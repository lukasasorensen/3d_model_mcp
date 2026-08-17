import { projectIdSchema, revisionIdSchema } from "@rjls/contracts";
import { getConfiguredCadRuntime } from "@rjls/runtime";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "cache-control": "no-store", "x-content-type-options": "nosniff" };

export async function POST(request: Request, context: { params: Promise<{ projectId: string; revisionId: string }> }): Promise<Response> {
  const allowedOrigin = process.env.RJLS_ALLOWED_ORIGIN ?? "http://localhost:3000";
  if (request.headers.get("origin") !== allowedOrigin) return Response.json({ error: { code: "ORIGIN_DENIED", message: "The request origin is not allowed." } }, { status: 403, headers });
  const params = await context.params;
  const projectId = projectIdSchema.safeParse(params.projectId);
  const revisionId = revisionIdSchema.safeParse(params.revisionId);
  if (!projectId.success || !revisionId.success) return Response.json({ error: { code: "INVALID_REQUEST", message: "The restore request is invalid." } }, { status: 400, headers });
  const configured = await getConfiguredCadRuntime().catch(() => undefined);
  if (!configured) return Response.json({ error: { code: "RUNTIME_UNAVAILABLE", message: "The local CAD runtime is unavailable." } }, { status: 503, headers });
  try {
    const revision = await configured.repository.restoreRevision({
      projectId: projectId.data,
      revision: revisionId.data,
      requestId: randomUUID(),
      toolCallId: randomUUID(),
      signal: request.signal,
    });
    return Response.json({ revision }, { status: 201, headers });
  } catch {
    return Response.json({ error: { code: "RESTORE_FAILED", message: "The revision could not be restored safely." } }, { status: 409, headers });
  }
}
