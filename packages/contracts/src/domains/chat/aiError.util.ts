import type { AiFailureCode } from "./aiConnection.types.js";

const messages: Record<AiFailureCode, string> = {
  AI_AUTHENTICATION:
    "The provider rejected this credential. Update the connection token.",
  AI_QUOTA:
    "The provider rate limit or quota was reached. Check billing or retry later.",
  AI_MODEL_UNSUPPORTED:
    "The selected model could not perform structured tool calling. Check the model ID and capabilities.",
  AI_OFFLINE:
    "The local AI companion is offline or busy. Start it on your computer and retry.",
  AI_TIMEOUT:
    "The AI request timed out. Check the provider or warm the local model and retry.",
  AI_CONFIGURATION:
    "This AI connection is unavailable. Check AI connections and server encryption configuration.",
  AI_PROVIDER_FAILURE:
    "The AI provider is temporarily unavailable. Retry the request.",
  AI_RESPONSE_TOO_LARGE:
    "The AI provider response exceeded its size limit. Try a smaller request or another model.",
};
export class AiConnectionError extends Error {
  constructor(readonly code: AiFailureCode) {
    super(messages[code]);
    this.name = "AiConnectionError";
  }
}
export function safeAiError(error: unknown): AiConnectionError {
  if (error instanceof AiConnectionError) return error;
  const status =
    error && typeof error === "object" && "status" in error
      ? error.status
      : undefined;
  if (status === 401 || status === 403)
    return new AiConnectionError("AI_AUTHENTICATION");
  if (status === 429) return new AiConnectionError("AI_QUOTA");
  if (status === 400 || status === 404 || status === 422)
    return new AiConnectionError("AI_MODEL_UNSUPPORTED");
  if (error instanceof Error && /timeout|abort/i.test(error.name))
    return new AiConnectionError("AI_TIMEOUT");
  return new AiConnectionError("AI_PROVIDER_FAILURE");
}
