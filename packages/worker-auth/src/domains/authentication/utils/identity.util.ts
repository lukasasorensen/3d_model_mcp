import { WorkerAuthError } from "../../../shared/utils/authenticationError.util.js";
import { type WorkerIdentity } from "../authentication.types.js";
export function workerIdentity(
  server: string,
  allowLoopbackHttp = false,
): WorkerIdentity {
  const url = new URL(server);
  if (
    url.origin !== server ||
    url.username ||
    url.password ||
    (url.protocol !== "https:" &&
      !(
        allowLoopbackHttp &&
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      ))
  ) {
    throw new WorkerAuthError(
      "INVALID_ORIGIN",
      "Use a canonical HTTPS server origin; loopback HTTP requires explicit development opt-in.",
    );
  }
  return {
    origin: server,
    issuer: `${server}/api/auth`,
    resource: `${server}/mcp`,
  };
}
