import type { AiConnectionSummary } from "@theoryfoundry/contracts";
export interface ChatModelSelection {
  connectionId?: string;
  model?: string;
}
export interface AiChatSelection {
  real: boolean;
  connections: AiConnectionSummary[];
  selection: ChatModelSelection;
  selected: AiConnectionSummary | undefined;
  models: string[];
  error: string;
  available: boolean;
  select(id: string): void;
  discover(): Promise<void>;
  setModel(model: string): void;
}
