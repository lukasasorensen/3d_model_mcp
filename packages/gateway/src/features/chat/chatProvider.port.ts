import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { ChatRequest } from "@theoryfoundry/contracts";
export interface CadChatProvider {
  readonly id: string;
  redactText?(value: string): string;
  createModel(request: ChatRequest, requestId: string): BaseChatModel;
}
