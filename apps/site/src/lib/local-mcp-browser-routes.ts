import {
  CAD_LIMITS,
  browserRenderCompletionSchema,
  localMcpBrowserRenderJobSchema,
  opaqueIdSchema,
  projectIdSchema,
  sessionIdSchema,
  type LocalMcpBrowserRenderJob,
} from "@rjls/contracts";

interface LocalBrowserRenderer {
  claimNext(projectId: string, sessionId: string): Promise<LocalMcpBrowserRenderJob | null>;
  complete(jobId: string, raw: unknown): Promise<void>;
}

interface LocalBridgeRuntime {
  localBrowserRenderer: LocalBrowserRenderer;
}

const headers = { "cache-control": "no-store", "x-content-type-options": "nosniff" };

export function localMcpBridgeEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  return environment.NODE_ENV !== "production" && environment.RJLS_LOCAL_MCP_BRIDGE === "1";
}

function sessionFrom(request: Request): string | undefined {
  const parsed = sessionIdSchema.safeParse(request.headers.get("x-rjls-session-id"));
  return parsed.success ? parsed.data : undefined;
}

function originAllowed(request: Request, allowedOrigin: string, required: boolean): boolean {
  const origin = request.headers.get("origin");
  return origin ? origin === allowedOrigin : !required;
}

export function createClaimLocalMcpRenderHandler(
  getRuntime: () => Promise<LocalBridgeRuntime>,
  environment: NodeJS.ProcessEnv = process.env,
) {
  return async function GET(request: Request): Promise<Response> {
    if (!localMcpBridgeEnabled(environment)) return new Response(null, { status: 404, headers });
    const allowedOrigin = environment.RJLS_ALLOWED_ORIGIN ?? "http://localhost:3000";
    const sessionId = sessionFrom(request);
    const projectId = projectIdSchema.safeParse(new URL(request.url).searchParams.get("projectId"));
    if (!originAllowed(request, allowedOrigin, false) || !sessionId) {
      return Response.json({ error: { code: "SESSION_MISMATCH" } }, { status: 403, headers });
    }
    if (!projectId.success) return Response.json({ error: { code: "INVALID_REQUEST" } }, { status: 400, headers });
    try {
      const job = await (await getRuntime()).localBrowserRenderer.claimNext(projectId.data, sessionId);
      if (!job) return new Response(null, { status: 204, headers });
      return Response.json({ job: localMcpBrowserRenderJobSchema.parse(job) }, { headers });
    } catch {
      return Response.json({ error: { code: "BRIDGE_UNAVAILABLE" } }, { status: 503, headers });
    }
  };
}

export function createCompleteLocalMcpRenderHandler(
  getRuntime: () => Promise<LocalBridgeRuntime>,
  environment: NodeJS.ProcessEnv = process.env,
) {
  return async function POST(request: Request, context: { params: Promise<{ jobId: string }> }): Promise<Response> {
    if (!localMcpBridgeEnabled(environment)) return new Response(null, { status: 404, headers });
    const allowedOrigin = environment.RJLS_ALLOWED_ORIGIN ?? "http://localhost:3000";
    const sessionId = sessionFrom(request);
    if (!originAllowed(request, allowedOrigin, true) || !sessionId) {
      return Response.json({ error: { code: "SESSION_MISMATCH" } }, { status: 403, headers });
    }
    const jobId = opaqueIdSchema.safeParse((await context.params).jobId);
    if (!jobId.success) return Response.json({ error: { code: "INVALID_REQUEST" } }, { status: 400, headers });
    const byteLimit = Math.min(CAD_LIMITS.toolResultBytes, 128 * 1024);
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (!Number.isFinite(contentLength) || contentLength > byteLimit) {
      return Response.json({ error: { code: "REQUEST_TOO_LARGE" } }, { status: 413, headers });
    }
    let raw: unknown;
    try {
      const body = await request.text();
      if (new TextEncoder().encode(body).byteLength > byteLimit) {
        return Response.json({ error: { code: "REQUEST_TOO_LARGE" } }, { status: 413, headers });
      }
      raw = JSON.parse(body) as unknown;
    }
    catch { return Response.json({ error: { code: "INVALID_REQUEST" } }, { status: 400, headers }); }
    const completion = browserRenderCompletionSchema.safeParse(raw);
    if (!completion.success || completion.data.sessionId !== sessionId) {
      return Response.json({ error: { code: "SESSION_MISMATCH" } }, { status: 403, headers });
    }
    try {
      await (await getRuntime()).localBrowserRenderer.complete(jobId.data, completion.data);
      return Response.json({ accepted: true }, { headers });
    } catch {
      return Response.json({ error: { code: "RENDER_COMPLETION_REJECTED" } }, { status: 409, headers });
    }
  };
}
