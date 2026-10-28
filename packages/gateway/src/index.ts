export * from "./chat.composition.js";
export {
  CAD_TOOL_NAMES,
  DeterministicMockCadProvider,
  normalizeCadPrompt,
} from "./features/chat/index.js";
export type {
  CadChatProvider,
  CadMcpClient,
  CadMcpToolResult,
  ChatOrchestratorOptions,
  ChatRouteOptions,
} from "./features/chat/index.js";
export { GATEWAY_BOUNDARY } from "./shared/gateway.constants.js";
