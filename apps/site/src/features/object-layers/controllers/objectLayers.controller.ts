import { applyObjectLayersSchema } from "../objectLayers.schema";
import {
  parameterControlsEventSchema,
  projectIdSchema,
  revisionIdSchema,
  CAD_LIMITS,
} from "@theoryfoundry/contracts";
import {
  NO_STORE_HEADERS,
  requireSameOrigin,
  jsonError,
} from "../../authentication/index";
import {
  readBoundedJson,
  RequestBodyTooLargeError,
} from "../../../shared/http/index";
import type { ObjectLayersDependencies } from "../objectLayers.port";
import { readLayers } from "../services/readLayers.service";
import { applyLayers } from "../workflows/applyLayers.workflow";
import { layerFailure } from "../utils/layerFailure.util";

type Context = { params: Promise<{ projectId: string }> };
export function createObjectLayersHandlers(deps: ObjectLayersDependencies): {
  GET(request: Request, context: Context): Promise<Response>;
  POST(request: Request, context: Context): Promise<Response>;
} {
  return {
    async GET(request: Request, context: Context): Promise<Response> {
      const user = await deps.authenticate(request);
      if (user instanceof Response) return user;
      const project = projectIdSchema.safeParse(
        (await context.params).projectId,
      );
      const revision = revisionIdSchema
        .optional()
        .safeParse(
          new URL(request.url).searchParams.get("revision") ?? undefined,
        );
      if (!project.success || !revision.success)
        return jsonError("INVALID_REQUEST", 400);
      try {
        const snapshot = await deps.withRuntime(user.id, (runtime) =>
          readLayers(
            runtime.client,
            project.data,
            revision.data,
            request.signal,
          ),
        );
        return Response.json(snapshot, { headers: NO_STORE_HEADERS });
      } catch (error) {
        const failure = layerFailure(error);
        return Response.json(
          { error: failure },
          {
            status: failure.code === "PROJECT_NOT_FOUND" ? 404 : 503,
            headers: NO_STORE_HEADERS,
          },
        );
      }
    },
    async POST(request: Request, context: Context): Promise<Response> {
      const origin = requireSameOrigin(request);
      if (origin) return origin;
      const user = await deps.authenticate(request);
      if (user instanceof Response) return user;
      const project = projectIdSchema.safeParse(
        (await context.params).projectId,
      );
      if (!project.success) return jsonError("INVALID_REQUEST", 400);
      let raw: unknown;
      try {
        raw = await readBoundedJson(request, CAD_LIMITS.sourceBytes);
      } catch (error) {
        return jsonError(
          "INVALID_REQUEST",
          error instanceof RequestBodyTooLargeError ? 413 : 400,
        );
      }
      const parsed = applyObjectLayersSchema.safeParse(raw);
      if (!parsed.success)
        return jsonError(
          "INVALID_REQUEST",
          400,
          "Provide a parent revision and a valid batch of layer changes.",
        );
      const input = parsed.data;
      if (request.headers.get("x-theoryfoundry-session-id") !== input.sessionId)
        return jsonError("SESSION_MISMATCH", 409);
      const abort = new AbortController();
      const signal = AbortSignal.any([
        request.signal,
        abort.signal,
        AbortSignal.timeout(180_000),
      ]);
      const encoder = new TextEncoder();
      let sequence = 0;
      const stream = new ReadableStream<Uint8Array>({
        start(controller): void {
          const emit: Parameters<typeof applyLayers>[4] = (event) => {
            signal.throwIfAborted();
            const value = parameterControlsEventSchema.parse({
              ...event,
              requestId: input.requestId,
              sessionId: input.sessionId,
              sequence: sequence++,
            });
            controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
          };
          void deps
            .withRuntime(user.id, (runtime) =>
              applyLayers(project.data, input, runtime, signal, emit),
            )
            .catch((error: unknown) => {
              if (!signal.aborted)
                emit({ type: "error", error: layerFailure(error) });
            })
            .finally(() => {
              if (!abort.signal.aborted) controller.close();
            });
        },
        cancel(): void {
          abort.abort();
        },
      });
      return new Response(stream, {
        headers: {
          ...NO_STORE_HEADERS,
          "content-type": "application/x-ndjson",
          "x-accel-buffering": "no",
        },
      });
    },
  };
}
