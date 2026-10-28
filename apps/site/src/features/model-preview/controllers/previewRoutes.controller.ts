import {
  browserPresenceSchema,
  PREVIEW_LIMITS,
  previewCompletionSchema,
  previewStatusInputSchema,
  projectIdSchema,
  sessionIdSchema,
} from "@theoryfoundry/contracts";
import { CadDomainError, remoteMcpEnabled } from "@theoryfoundry/runtime";
import {
  isPolicyResponse,
  jsonError,
  NO_STORE_HEADERS,
  requireSameOrigin,
} from "../../authentication/index";
import { localMcpBridgeEnabled } from "../../browser-rendering/index";
import type { PreviewRouteDependencies } from "../previewRoutes.port";
import { boundedJson } from "../utils/boundedJson.util";
export function previewRoute(
  action: "presence" | "claim" | "complete" | "status",
  dependencies: PreviewRouteDependencies,
) {
  return async (
    request: Request,
    context: { params: Promise<{ projectId: string }> },
  ): Promise<Response> => {
    if (
      action !== "presence" &&
      !remoteMcpEnabled() &&
      !localMcpBridgeEnabled()
    )
      return jsonError("NOT_FOUND", 404);
    const origin = requireSameOrigin(request);
    if (origin) return origin;
    const user = await dependencies.authenticate(request);
    if (isPolicyResponse(user)) return user;
    const project = projectIdSchema.safeParse((await context.params).projectId);
    const session = sessionIdSchema.safeParse(
      request.headers.get("x-theoryfoundry-session-id"),
    );
    if (!project.success || !session.success)
      return jsonError("INVALID_REQUEST", 400);
    try {
      await dependencies.authorize(user.id, project.data);
      if (action === "presence") {
        const presence = browserPresenceSchema.parse(
          await boundedJson(request, 4096),
        );
        if (presence.sessionId !== session.data)
          return jsonError("SESSION_MISMATCH", 403);
        await dependencies.presence(user.id, project.data, {
          ...presence,
          localEnabled: presence.localEnabled && localMcpBridgeEnabled(),
          remoteEnabled: presence.remoteEnabled && remoteMcpEnabled(),
        });
      } else if (action === "claim") {
        const modes = [
          remoteMcpEnabled() ? "remote-mcp" : "",
          localMcpBridgeEnabled() ? "local-mcp" : "",
        ].filter(Boolean);
        const job = await dependencies.claim(
          user.id,
          project.data,
          session.data,
          modes,
        );
        return job
          ? Response.json({ job }, { headers: NO_STORE_HEADERS })
          : new Response(null, { status: 204, headers: NO_STORE_HEADERS });
      } else if (action === "status") {
        const input = previewStatusInputSchema.parse(
          await boundedJson(request, 4096),
        );
        const state = await dependencies.status(
          user.id,
          project.data,
          session.data,
          input.jobId,
          input.token,
        );
        return Response.json({ state }, { headers: NO_STORE_HEADERS });
      } else {
        const completion = previewCompletionSchema.parse(
          await boundedJson(request, PREVIEW_LIMITS.payloadBytes),
        );
        if (
          completion.projectId !== project.data ||
          completion.sessionId !== session.data
        )
          return jsonError("SESSION_MISMATCH", 403);
        await dependencies.complete(user.id, completion);
      }
      return Response.json({ accepted: true }, { headers: NO_STORE_HEADERS });
    } catch (error) {
      if (error instanceof RangeError)
        return jsonError("ARTIFACT_LIMIT_EXCEEDED", 413);
      if (error instanceof CadDomainError)
        return jsonError(
          String(error.code),
          error.code === "PROJECT_NOT_FOUND"
            ? 404
            : error.code === "ARTIFACT_LIMIT_EXCEEDED"
              ? 413
              : 409,
          error.message,
        );
      if (
        error instanceof SyntaxError ||
        (error as { name?: string }).name === "ZodError"
      )
        return jsonError("INVALID_REQUEST", 400);
      return jsonError("PREVIEW_SERVICE_UNAVAILABLE", 503);
    }
  };
}
