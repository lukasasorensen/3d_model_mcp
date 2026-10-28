export type ToolActivityState = "running" | "success" | "error";
export interface ToolActivityItem {
  toolCallId: string;
  tool: string;
  state: ToolActivityState;
  code?: string;
}
export interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  text: string;
  activity: ToolActivityItem[];
  outcome?: "completed" | "failed" | "cancelled";
}
