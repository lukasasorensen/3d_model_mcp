import { safeAiError, type ChatEvent } from "@theoryfoundry/contracts";
type Code = Extract<ChatEvent, { type: "error" }>["code"];
export function publicChatFailureMessage(code: Code, error: unknown): string {
  const messages: Partial<Record<Code, string>> = {
    CANCELLED: "The request was cancelled.",
    REQUEST_TIMEOUT: "The request exceeded its time limit.",
    TOOL_LIMIT_EXCEEDED: "The CAD tool-call limit was reached.",
    REPAIR_LIMIT_EXCEEDED: "The candidate repair limit was reached.",
    TOOL_RESULT_TOO_LARGE: "The CAD tool result exceeded its safe size limit.",
    MCP_FAILURE: "The CAD service is temporarily unavailable.",
    PROVIDER_FAILURE: "The chat provider failed safely.",
  };
  return messages[code] ?? safeAiError(error).message;
}
