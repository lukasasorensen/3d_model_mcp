import { WorkerAuthError } from "../../../shared/utils/authenticationError.util.js";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  WORKER_OAUTH_CALLBACK,
  WORKER_OAUTH_CLIENT_ID,
  WORKER_OAUTH_SCOPE,
} from "@theoryfoundry/contracts";
import type {
  AuthorizationListener,
  CredentialLock,
  CredentialStore,
  OAuthTransport,
  WorkerAuthentication,
} from "../authentication.port.js";
import {
  type AccessToken,
  type Credential,
  type WorkerIdentity,
} from "../authentication.types.js";
export function createAuthenticationWorkflow(dependencies: {
  identity: WorkerIdentity;
  store: CredentialStore;
  lock: CredentialLock;
  transport: OAuthTransport;
  listen(state: string): Promise<AuthorizationListener>;
}): WorkerAuthentication {
  const { identity, store, lock, transport } = dependencies;
  const cached = new Map<string, AccessToken & { generation: string }>();
  const credential = (account: string, refreshToken: string): Credential => ({
    version: 1,
    origin: identity.origin,
    account,
    refreshToken,
    generation: randomUUID(),
  });
  const requireLogin = (): WorkerAuthError =>
    new WorkerAuthError(
      "LOGIN_REQUIRED",
      "Run worker login for this server and account.",
    );
  return {
    login: (openBrowser, signal) =>
      lock.run(async () => {
        signal?.throwIfAborted();
        const verifier = randomBytes(32).toString("base64url");
        const state = randomBytes(32).toString("base64url");
        const listener = await dependencies.listen(state);
        try {
          const url = new URL(`${identity.issuer}/oauth2/authorize`);
          url.search = new URLSearchParams({
            client_id: WORKER_OAUTH_CLIENT_ID,
            redirect_uri: WORKER_OAUTH_CALLBACK,
            response_type: "code",
            scope: WORKER_OAUTH_SCOPE,
            resource: identity.resource,
            state,
            code_challenge: createHash("sha256")
              .update(verifier)
              .digest("base64url"),
            code_challenge_method: "S256",
          }).toString();
          await openBrowser(url.href);
          const code = await listener.wait(signal);
          const tokens = await transport.exchange(
            {
              grant_type: "authorization_code",
              code,
              code_verifier: verifier,
              redirect_uri: WORKER_OAUTH_CALLBACK,
            },
            signal,
          );
          const saved = credential(tokens.account, tokens.refreshToken);
          try {
            await store.write(saved);
          } catch {
            await transport.revoke(tokens.refreshToken).catch(() => undefined);
            throw new WorkerAuthError(
              "CREDENTIAL_WRITE_FAILED",
              "Unable to save credentials in the OS store. Unlock it and log in again.",
            );
          }
          cached.set(tokens.account, {
            token: tokens.token,
            account: tokens.account,
            expiresAt: tokens.expiresAt,
            generation: saved.generation,
          });
          return tokens.account;
        } finally {
          await listener.close();
        }
      }, signal),
    accessToken: (account, signal) =>
      lock.run(async () => {
        const saved = await store.read(account);
        if (!saved) {
          cached.delete(account);
          throw requireLogin();
        }
        const token = cached.get(account);
        if (
          token?.generation === saved.generation &&
          token.expiresAt > Date.now() + 30_000
        )
          return { token: token.token, account, expiresAt: token.expiresAt };
        cached.delete(account);
        let tokens;
        try {
          tokens = await transport.exchange(
            { grant_type: "refresh_token", refresh_token: saved.refreshToken },
            signal,
          );
        } catch (error) {
          if (
            error instanceof WorkerAuthError &&
            error.code === "LOGIN_REQUIRED"
          )
            await store.remove(account);
          throw error;
        }
        if (tokens.account !== account) {
          await store.remove(account);
          await transport.revoke(tokens.refreshToken).catch(() => undefined);
          throw requireLogin();
        }
        const next = credential(account, tokens.refreshToken);
        try {
          await store.write(next);
        } catch {
          await transport.revoke(tokens.refreshToken).catch(() => undefined);
          throw new WorkerAuthError(
            "CREDENTIAL_WRITE_FAILED",
            "Refresh rotated but could not be saved. Unlock the OS credential store and log in again.",
          );
        }
        const access = {
          token: tokens.token,
          account,
          expiresAt: tokens.expiresAt,
        };
        cached.set(account, { ...access, generation: next.generation });
        return access;
      }, signal),
    logout: (account, signal) =>
      lock.run(async () => {
        cached.delete(account);
        const saved = await store.read(account);
        if (!saved) return;
        // Keep the credential on network failure so revocation can be retried.
        await transport.revoke(saved.refreshToken, signal);
        await store.remove(account);
      }, signal),
  };
}
