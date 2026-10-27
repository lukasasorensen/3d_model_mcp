import { getAuth } from "./auth.composition.js";
import { getProjectDatabase } from "./database.composition.js";
import { authenticateRemoteMcp as authenticate } from "./remote-mcp-auth.js";
export function authenticateRemoteMcp(request: Request): Promise<string> {
  return authenticate(request, {
    getJwks: () => getAuth().api.getJwks(),
    getPool: () => getProjectDatabase().pool,
  });
}
