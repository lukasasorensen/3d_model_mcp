import { CadDomainError } from "@theoryfoundry/model-project";
import {
  McpAuthenticationError,
  mcpAuthChallenge,
} from "../../../shared/utils/mcpAuthentication.util.js";
import { readWorkerRequest } from "../utils/requestBody.util.js";
import type {
  WorkerOperation,
  WorkerRequestPolicy,
} from "../workerRequest.port.js";
const headers = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

const jsonError = (code: string, status: number): Response =>
  Response.json({ error: { code } }, { status, headers });

export function handleWorkerJsonRequest<Input, Output>(
  request: Request,
  policy: WorkerRequestPolicy,
  operation: WorkerOperation<Input, Output>,
): Promise<Response> {
  return handleWorkerRequest(request, policy, {
    ...operation,
    read: readWorkerRequest,
  });
}

export async function handleWorkerRequest<Input, Output>(
  request: Request,
  policy: WorkerRequestPolicy,
  operation: WorkerOperation<Input, Output> & {
    read: (request: Request) => Promise<unknown>;
  },
): Promise<Response> {
  if (!policy.enabled()) return jsonError("NOT_FOUND", 404);
  if (request.method !== "POST") return jsonError("METHOD_NOT_ALLOWED", 405);
  try {
    const origin = request.headers.get("origin");
    if (origin !== null && origin !== policy.origin())
      return jsonError("ORIGIN_DENIED", 403);
    let ownerId: string;
    try {
      ownerId = await policy.authenticate(request);
    } catch (error) {
      return error instanceof McpAuthenticationError
        ? mcpAuthChallenge(error)
        : jsonError("AUTHENTICATION_UNAVAILABLE", 503);
    }
    let body: unknown;
    try {
      body = await operation.read(request);
    } catch (error) {
      if (error instanceof RangeError)
        return jsonError("REQUEST_TOO_LARGE", 413);
      if (error instanceof SyntaxError)
        return jsonError("INVALID_REQUEST", 400);
      throw error;
    }
    const parsed = operation.schema.safeParse(body);
    if (!parsed.success) return jsonError("INVALID_TOOL_INPUT", 400);
    const result = await operation.execute(ownerId, parsed.data);
    return Response.json(result, { headers });
  } catch (error) {
    if (
      request.signal.aborted ||
      (error instanceof DOMException &&
        ["TimeoutError", "AbortError"].includes(error.name))
    )
      return jsonError("REQUEST_TIMEOUT", 408);
    if (error instanceof CadDomainError) {
      const status = ["WORKER_CAPACITY", "EXPORT_CAPACITY"].includes(error.code)
        ? 429
        : [
              "CANDIDATE_NOT_FOUND",
              "PROJECT_NOT_FOUND",
              "REVISION_NOT_FOUND",
            ].includes(error.code)
          ? 404
          : 409;
      return Response.json(
        {
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        },
        { status, headers },
      );
    }
    return jsonError(operation.unavailableCode, 503);
  }
}
