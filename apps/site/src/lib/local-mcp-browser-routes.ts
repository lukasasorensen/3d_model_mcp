import {
  CAD_LIMITS,
  browserRenderCompletionSchema,
  localMcpBrowserRenderJobSchema,
  opaqueIdSchema,
  projectIdSchema,
  sessionIdSchema,
  type LocalMcpBrowserRenderJob,
} from "@rjls/contracts";
import { NO_STORE_HEADERS, configuredOrigin, jsonError } from "./route-policy";

interface LocalBrowserRenderer {
  claimNext(projectId: string, sessionId: string): Promise<LocalMcpBrowserRenderJob | null>;
  complete(jobId: string, raw: unknown): Promise<void>;
}

interface LocalBridgeRuntime {
  localBrowserRenderer: LocalBrowserRenderer;
}

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
    if (!localMcpBridgeEnabled(environment)) return new Response(null, { status: 404, headers: NO_STORE_HEADERS });
    const allowedOrigin = configuredOrigin(environment);
    const sessionId = sessionFrom(request);
    const projectId = projectIdSchema.safeParse(new URL(request.url).searchParams.get("projectId"));
    if (!originAllowed(request, allowedOrigin, false) || !sessionId) {
      return jsonError("SESSION_MISMATCH", 403);
    }
    if (!projectId.success) return jsonError("INVALID_REQUEST", 400);
    try {
      const job = await (await getRuntime()).localBrowserRenderer.claimNext(projectId.data, sessionId);
      if (!job) return new Response(null, { status: 204, headers: NO_STORE_HEADERS });
      return Response.json({ job: localMcpBrowserRenderJobSchema.parse(job) }, { headers: NO_STORE_HEADERS });
    } catch {
      return jsonError("BRIDGE_UNAVAILABLE", 503);
    }
  };
}

export function createCompleteLocalMcpRenderHandler(
  getRuntime: () => Promise<LocalBridgeRuntime>,
  environment: NodeJS.ProcessEnv = process.env,
) {
  return async function POST(request: Request, context: { params: Promise<{ jobId: string }> }): Promise<Response> {
    if (!localMcpBridgeEnabled(environment)) return new Response(null, { status: 404, headers: NO_STORE_HEADERS });
    const allowedOrigin = configuredOrigin(environment);
    const sessionId = sessionFrom(request);
    if (!originAllowed(request, allowedOrigin, true) || !sessionId) {
      return jsonError("SESSION_MISMATCH", 403);
    }
    const jobId = opaqueIdSchema.safeParse((await context.params).jobId);
    if (!jobId.success) return jsonError("INVALID_REQUEST", 400);
    const byteLimit = Math.min(CAD_LIMITS.toolResultBytes, 128 * 1024);
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (!Number.isFinite(contentLength) || contentLength > byteLimit) {
      return jsonError("REQUEST_TOO_LARGE", 413);
    }
    let raw: unknown;
    try {
      const body = await request.text();
      if (new TextEncoder().encode(body).byteLength > byteLimit) {
        return jsonError("REQUEST_TOO_LARGE", 413);
      }
      raw = JSON.parse(body) as unknown;
    }
    catch { return jsonError("INVALID_REQUEST", 400); }
    const completion = browserRenderCompletionSchema.safeParse(raw);
    if (!completion.success || completion.data.sessionId !== sessionId) {
      return jsonError("SESSION_MISMATCH", 403);
    }
    try {
      await (await getRuntime()).localBrowserRenderer.complete(jobId.data, completion.data);
      return Response.json({ accepted: true }, { headers: NO_STORE_HEADERS });
    } catch {
      return jsonError("RENDER_COMPLETION_REJECTED", 409);
    }
  };
}
