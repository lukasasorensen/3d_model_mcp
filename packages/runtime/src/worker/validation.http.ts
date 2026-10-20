import { beginWorkerValidationSchema, completeWorkerValidationSchema, workerValidationCapabilitySchema } from "@theoryfoundry/contracts";
import { CadDomainError, WorkerValidationService } from "@theoryfoundry/model-project";
import { authenticateRemoteMcp, McpAuthenticationError, mcpAuthChallenge } from "../remote-mcp-auth.js";
import { remoteMcpEnabled, remoteMcpIdentity } from "../remote-mcp-policy.js";
import { getProjectDatabase } from "../infrastructure.js";
import { readWorkerRequest } from "./request-body.util.js";

type WorkerValidationAction = "begin" | "status" | "complete" | "cancel";
type ValidationOperations = Pick<WorkerValidationService, WorkerValidationAction>;
const headers = { "cache-control": "no-store", "x-content-type-options": "nosniff" };
const jsonError = (code: string, status: number) => Response.json({ error: { code } }, { status, headers });

export function createWorkerValidationHandler(dependencies: {
  authenticate: (request: Request) => Promise<string>;
  service: (ownerId: string) => ValidationOperations;
  enabled: () => boolean;
  origin: () => string;
}) {
  return async (request: Request, action: WorkerValidationAction): Promise<Response> => {
    if (!dependencies.enabled()) return jsonError("NOT_FOUND", 404);
    if (request.method !== "POST") return jsonError("METHOD_NOT_ALLOWED", 405);
    try {
      const origin = request.headers.get("origin");
      if (origin !== null && origin !== dependencies.origin()) return jsonError("ORIGIN_DENIED", 403);
      let ownerId: string;
      try { ownerId = await dependencies.authenticate(request); }
      catch (error) { return error instanceof McpAuthenticationError ? mcpAuthChallenge(error) : jsonError("AUTHENTICATION_UNAVAILABLE", 503); }
      const schema = action === "begin" ? beginWorkerValidationSchema : action === "complete" ? completeWorkerValidationSchema : workerValidationCapabilitySchema;
      let body: unknown;
      try { body = await readWorkerRequest(request); }
      catch (error) {
        if (error instanceof RangeError) return jsonError("REQUEST_TOO_LARGE", 413);
        if (error instanceof SyntaxError) return jsonError("INVALID_REQUEST", 400);
        throw error;
      }
      const parsed = schema.safeParse(body);
      if (!parsed.success) return jsonError("INVALID_TOOL_INPUT", 400);
      const result = await dependencies.service(ownerId)[action](parsed.data);
      return Response.json(result, { headers });
    } catch (error) {
      if (request.signal.aborted || (error instanceof DOMException && ["TimeoutError", "AbortError"].includes(error.name))) return jsonError("REQUEST_TIMEOUT", 408);
      if (error instanceof CadDomainError) {
        const status = error.code === "WORKER_CAPACITY" ? 429 : ["CANDIDATE_NOT_FOUND", "PROJECT_NOT_FOUND"].includes(error.code) ? 404 : 409;
        return Response.json({ error: { code: error.code, message: error.message, details: error.details } }, { status, headers });
      }
      return jsonError("WORKER_VALIDATION_UNAVAILABLE", 503);
    }
  };
}

export const handleWorkerValidationRequest = createWorkerValidationHandler({
  authenticate: authenticateRemoteMcp,
  service: ownerId => new WorkerValidationService(getProjectDatabase().pool, ownerId),
  enabled: () => remoteMcpEnabled() && process.env.THEORYFOUNDRY_LOCAL_WORKER_ENABLED === "1",
  origin: () => remoteMcpIdentity().origin,
});
