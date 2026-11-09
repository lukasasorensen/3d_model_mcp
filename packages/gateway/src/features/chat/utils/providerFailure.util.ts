import { safeAiError, type AiFailureCode } from "@theoryfoundry/contracts";
export function isLiveProvider(provider: string): boolean {
  return [
    "openai",
    "anthropic",
    "google",
    "ollama",
    "openai-compatible",
  ].includes(provider);
}
export function providerFailureCode(
  error: unknown,
  provider: string,
): "PROVIDER_FAILURE" | AiFailureCode {
  return isLiveProvider(provider)
    ? safeAiError(error).code
    : "PROVIDER_FAILURE";
}
