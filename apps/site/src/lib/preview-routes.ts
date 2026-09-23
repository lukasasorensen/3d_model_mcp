import { previewStatusInputSchema, browserPresenceSchema, previewCompletionSchema, PREVIEW_LIMITS, projectIdSchema, sessionIdSchema } from "@rjls/contracts";
import { browserPreviewStatus, CadDomainError, updateBrowserPreviewPresence, claimBrowserPreview, completeBrowserPreview, withConfiguredCadRuntime, remoteMcpEnabled } from "@rjls/runtime";
import { authenticateRequest, isPolicyResponse, jsonError, NO_STORE_HEADERS, requireSameOrigin } from "./route-policy";
import { localMcpBridgeEnabled } from "./local-mcp-browser-routes";

async function boundedJson(request: Request, limit: number): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError("Missing request body.");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > limit) throw new RangeError("Preview upload exceeds limit.");
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}

export function previewRoute(action: "presence" | "claim" | "complete" | "status") {
  return async (request: Request, context: { params: Promise<{ projectId: string }> }): Promise<Response> => {
    if (action !== "presence" && !remoteMcpEnabled() && !localMcpBridgeEnabled()) return jsonError("NOT_FOUND", 404);
    const origin = requireSameOrigin(request); if (origin) return origin;
    const user = await authenticateRequest(request); if (isPolicyResponse(user)) return user;
    const project = projectIdSchema.safeParse((await context.params).projectId);
    const session = sessionIdSchema.safeParse(request.headers.get("x-rjls-session-id"));
    if (!project.success || !session.success) return jsonError("INVALID_REQUEST", 400);
    try {
      await withConfiguredCadRuntime(user.id, (runtime) => runtime.repository.getProjectState(project.data));
      if (action === "presence") {
        const presence = browserPresenceSchema.parse(await boundedJson(request, 4096));
        if (presence.sessionId !== session.data) return jsonError("SESSION_MISMATCH", 403);
        await updateBrowserPreviewPresence(user.id, project.data, { ...presence, localEnabled: presence.localEnabled && localMcpBridgeEnabled(), remoteEnabled: presence.remoteEnabled && remoteMcpEnabled() });
      } else if (action === "claim") {
        const modes = [remoteMcpEnabled() ? "remote-mcp" : "", localMcpBridgeEnabled() ? "local-mcp" : ""].filter(Boolean);
        const job = await claimBrowserPreview(user.id, project.data, session.data, modes);
        return job ? Response.json({ job }, { headers: NO_STORE_HEADERS }) : new Response(null, { status: 204, headers: NO_STORE_HEADERS });
      } else if (action === "status") {
        const input = previewStatusInputSchema.parse(await boundedJson(request, 4096));
        const state = await browserPreviewStatus(user.id, project.data, session.data, input.jobId, input.token);
        return Response.json({ state }, { headers: NO_STORE_HEADERS });
      } else {
        const completion = previewCompletionSchema.parse(await boundedJson(request, PREVIEW_LIMITS.payloadBytes));
        if (completion.projectId !== project.data || completion.sessionId !== session.data) return jsonError("SESSION_MISMATCH", 403);
        await completeBrowserPreview(user.id, completion);
      }
      return Response.json({ accepted: true }, { headers: NO_STORE_HEADERS });
    } catch (error) {
      if (error instanceof RangeError) return jsonError("ARTIFACT_LIMIT_EXCEEDED", 413);
      if (error instanceof CadDomainError) return jsonError(String(error.code), error.code === "PROJECT_NOT_FOUND" ? 404 : error.code === "ARTIFACT_LIMIT_EXCEEDED" ? 413 : 409, error.message);
      if (error instanceof SyntaxError || (error as { name?: string }).name === "ZodError") return jsonError("INVALID_REQUEST", 400);
      return jsonError("PREVIEW_SERVICE_UNAVAILABLE", 503);
    }
  };
}
