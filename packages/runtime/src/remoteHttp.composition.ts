import { createRemoteMcpHandler as createHandler } from "./remote-mcp-http.js";
import { authenticateRemoteMcp } from "./remoteAuth.composition.js";
import { createRemoteCadMcpServer } from "./remoteMcp.composition.js";
export function createRemoteMcpHandler(
  dependencies = {
    authenticate: authenticateRemoteMcp,
    createServer: createRemoteCadMcpServer,
  },
  timeoutMs?: number,
) {
  return createHandler(dependencies, timeoutMs);
}
export const handleRemoteMcpRequest = createRemoteMcpHandler();
