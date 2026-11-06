import {
  aiConnectionListSchema,
  type AiConnectionInput,
  type AiConnectionSummary,
  type CompanionSummary,
} from "@theoryfoundry/contracts";

export async function aiRequest(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await fetch(`/v1/ai/connections${path}`, {
    method,
    cache: "no-store",
    ...(signal ? { signal } : {}),
    ...(body === undefined
      ? {}
      : {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  const raw: unknown = await response.json();
  if (!response.ok) {
    const error = raw as { error?: { message?: string } };
    throw new Error(
      typeof error?.error?.message === "string"
        ? error.error.message.slice(0, 500)
        : "AI connections are unavailable.",
    );
  }
  return raw;
}
export async function readAiConnections(signal?: AbortSignal): Promise<{
  connections: AiConnectionSummary[];
  companions: CompanionSummary[];
}> {
  return aiConnectionListSchema.parse(
    await aiRequest("", "GET", undefined, signal),
  );
}
export async function saveAiConnection(
  input: AiConnectionInput,
  id?: string,
): Promise<void> {
  await aiRequest(id ? `/${id}` : "", id ? "PUT" : "POST", input);
}
