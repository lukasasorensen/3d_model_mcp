import type { ChatRequest } from "@theoryfoundry/contracts";

import {
  createChatController as createRoute,
  DeterministicMockCadProvider,
  streamChatWorkflow as stream,
  type CadChatProvider,
  type ChatOrchestratorOptions,
  type ChatRouteOptions,
} from "./features/chat/index.js";
export async function* streamCadChat(
  request: ChatRequest,
  options: ChatOrchestratorOptions,
  signal?: AbortSignal,
) {
  yield* stream(
    request,
    {
      ...options,
      provider: options.provider ?? new DeterministicMockCadProvider(),
    },
    signal,
  );
}
export function createChatRouteHandler(options: ChatRouteOptions) {
  return createRoute(options, streamCadChat);
}

export function createCadProvider(
  name = process.env.THEORYFOUNDRY_CHAT_PROVIDER ?? "mock",
): CadChatProvider {
  if (name === "mock") return new DeterministicMockCadProvider();
  throw new Error(
    "Configured chat provider is unavailable; install and register an explicit adapter.",
  );
}
