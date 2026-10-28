import { CAD_TOOL_NAMES } from "../../dist/index.js";
export const request = {
  version: "3",
  projectId: "project-1",
  sessionId: "session-1",
  message: "Inspect the project",
};
export async function collect(stream) {
  const values = [];
  for await (const value of stream) values.push(value);
  return values;
}
export function exactClient(callTool) {
  return { listTools: async () => CAD_TOOL_NAMES, callTool };
}
