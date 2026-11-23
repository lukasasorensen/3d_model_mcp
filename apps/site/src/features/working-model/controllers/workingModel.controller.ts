import {
  parameterControlsErrorSchema,
  parameterControlsEventSchema,
  projectIdSchema,
  type ParameterControlsError,
} from "@theoryfoundry/contracts";
import type { WorkingModelDependencies } from "../workingModel.port";
import {
  jsonError,
  NO_STORE_HEADERS,
  requireSameOrigin,
} from "../../authentication/index";
import {
  readBoundedJson,
  RequestBodyTooLargeError,
} from "../../../shared/http/index";
import {
  saveWorkingModelSchema,
  workingModelSchema,
  WORKING_MODEL_REQUEST_BYTES,
} from "../workingModel.schema";
import { prepareWorkingModel } from "../services/prepareWorkingModel.service";
import { saveWorkingModel } from "../workflows/saveWorkingModel.workflow";

function workingError(error: unknown): ParameterControlsError {
  const parsed = parameterControlsErrorSchema.safeParse(
    error instanceof Error
      ? {
          message: error.message.slice(0, 500),
          code: "code" in error ? error.code : undefined,
          details: "details" in error ? error.details : undefined,
        }
      : error,
  );
  if (!parsed.success)
    return {
      code: "WORKING_MODEL_FAILED",
      message:
        "The working model could not be processed. Your draft is available to retry.",
    };
  const { reason } = parsed.data.details ?? {};
  return {
    ...parsed.data,
    message: (reason
      ? parsed.data.message + " " + reason
      : parsed.data.message
    ).slice(0, 500),
  };
}

export function createWorkingModelHandler(
  deps: WorkingModelDependencies,
  mode: "preview" | "save",
) {
  return async function POST(
    request: Request,
    context: { params: Promise<{ projectId: string }> },
  ): Promise<Response> {
    const originError = requireSameOrigin(request);
    if (originError) return originError;
    const user = await deps.authenticate(request);
    if (user instanceof Response) return user;
    const project = projectIdSchema.safeParse((await context.params).projectId);
    if (!project.success) return jsonError("INVALID_REQUEST", 400);
    let raw: unknown;
    try {
      raw = await readBoundedJson(request, WORKING_MODEL_REQUEST_BYTES);
    } catch (error) {
      return jsonError(
        "INVALID_REQUEST",
        error instanceof RequestBodyTooLargeError ? 413 : 400,
      );
    }
    if (mode === "preview") {
      const parsed = workingModelSchema.safeParse(raw);
      if (!parsed.success)
        return jsonError("INVALID_REQUEST", 400, "The draft is invalid.");
      try {
        const { preview } = await deps.withRuntime(user.id, ({ repository }) =>
          prepareWorkingModel(
            repository,
            project.data,
            parsed.data,
            request.signal,
          ),
        );
        return Response.json(preview, { headers: NO_STORE_HEADERS });
      } catch (error) {
        const failure = workingError(error);
        return Response.json(
          { error: failure },
          {
            status: ["PROJECT_NOT_FOUND", "REVISION_NOT_FOUND"].includes(
              failure.code,
            )
              ? 404
              : 422,
            headers: NO_STORE_HEADERS,
          },
        );
      }
    }
    const parsed = saveWorkingModelSchema.safeParse(raw);
    if (!parsed.success)
      return jsonError("INVALID_REQUEST", 400, "The draft is invalid.");
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
        const emit: Parameters<typeof saveWorkingModel>[4] = (event) => {
          signal.throwIfAborted();
          const value = parameterControlsEventSchema.parse({
            ...event,
            requestId: input.requestId,
            sessionId: input.sessionId,
            sequence: sequence++,
          });
          controller.enqueue(encoder.encode(JSON.stringify(value) + "\n"));
        };
        void deps
          .withRuntime(user.id, (runtime) =>
            saveWorkingModel(project.data, input, runtime, signal, emit),
          )
          .catch((error: unknown) => {
            if (!signal.aborted)
              emit({ type: "error", error: workingError(error) });
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
  };
}
