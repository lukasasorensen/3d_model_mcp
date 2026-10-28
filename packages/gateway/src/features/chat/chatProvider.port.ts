import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { ChatRequest } from "@theoryfoundry/contracts";
export interface CadChatProvider {
  readonly id: string;
  createModel(request: ChatRequest, requestId: string): BaseChatModel;
}
