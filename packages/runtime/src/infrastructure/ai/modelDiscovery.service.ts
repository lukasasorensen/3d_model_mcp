import type { ProviderConnection } from "@theoryfoundry/gateway";
import {
  AI_LIMITS,
  AiConnectionError,
  modelIdSchema,
  safeAiError,
} from "@theoryfoundry/contracts";

export async function discoverHostedModels(
  connection: ProviderConnection,
  signal: AbortSignal,
): Promise<string[]> {
  try {
    const provider = connection.provider;
    const headers: Record<string, string> =
      provider === "google"
        ? { "x-goog-api-key": connection.token! }
        : provider === "anthropic"
          ? {
              "x-api-key": connection.token!,
              "anthropic-version": "2023-06-01",
            }
          : { authorization: `Bearer ${connection.token!}` };
    const endpoint = connection.endpoint
      ? `${connection.endpoint.replace(/\/$/, "")}/models`
      : provider === "google"
        ? "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000"
        : provider === "anthropic"
          ? "https://api.anthropic.com/v1/models?limit=1000"
          : "https://api.openai.com/v1/models";
    const response = await (connection.fetch ?? fetch)(endpoint, {
      headers,
      signal,
      redirect: "error",
    });
    if (!response.ok) throw { status: response.status };
    const reader = response.body?.getReader();
    if (!reader) throw new Error();
    let text = "";
    const decoder = new TextDecoder();
    let bytes = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > AI_LIMITS.resultBytes) throw new Error();
        text += decoder.decode(part.value, { stream: true });
      }
    } finally {
      await reader.cancel();
    }
    const raw = JSON.parse(text + decoder.decode()) as {
      data?: { id?: unknown }[];
      models?: { name?: unknown }[];
    };
    const values =
      provider === "google"
        ? raw.models?.map((model) =>
            typeof model.name === "string"
              ? model.name.replace(/^models\//, "")
              : model.name,
          )
        : raw.data?.map((model) => model.id);
    if (!values) throw new AiConnectionError("AI_MODEL_UNSUPPORTED");
    return [
      ...new Set(
        values.filter(
          (value): value is string => modelIdSchema.safeParse(value).success,
        ),
      ),
    ]
      .sort()
      .slice(0, 1000);
  } catch (error) {
    throw safeAiError(error);
  }
}
