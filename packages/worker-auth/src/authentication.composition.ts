import { homedir } from "node:os";
import { join } from "node:path";
import {
  createAuthenticationWorkflow,
  workerIdentity,
  type WorkerAuthentication,
} from "./domains/authentication/index.js";
import {
  createCredentialStore,
  createCredentialLock,
  createOAuthTransport,
  createLoopbackListener,
} from "./infrastructure/authentication/index.js";
export function createWorkerAuthentication(
  server: string,
  options: { allowLoopbackHttp?: boolean } = {},
): WorkerAuthentication {
  const identity = workerIdentity(server, options.allowLoopbackHttp);
  return createAuthenticationWorkflow({
    identity,
    store: createCredentialStore(identity.origin),
    lock: createCredentialLock(
      join(homedir(), ".theoryfoundry-worker-locks"),
      identity.origin,
    ),
    transport: createOAuthTransport(identity),
    listen: (state) => createLoopbackListener(state, identity.issuer),
  });
}
