import { WorkerAuthError } from "../../shared/utils/authenticationError.util.js";
import { createLocalJWKSet, jwtVerify, type JSONWebKeySet } from "jose";
import { WORKER_OAUTH_CLIENT_ID } from "@theoryfoundry/contracts";
import {
  type TokenSet,
  type OAuthTransport,
  type WorkerIdentity,
} from "../../domains/authentication/index.js";
async function boundedJson(
  response: Response,
): Promise<Record<string, unknown>> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.length;
      if (bytes > 128 * 1024) throw new Error();
      chunks.push(next.value);
    }
  } finally {
    await reader.cancel();
  }
  const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new Error();
  return body as Record<string, unknown>;
}
export function createOAuthTransport(
  identity: WorkerIdentity,
  request: typeof fetch = fetch,
): OAuthTransport {
  const send = async (
    path: string,
    parameters: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<Response> =>
    request(`${identity.issuer}${path}`, {
      method: "POST",
      redirect: "error",
      cache: "no-store",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: new URLSearchParams({
        ...parameters,
        client_id: WORKER_OAUTH_CLIENT_ID,
        resource: identity.resource,
      }),
      signal: AbortSignal.any([
        AbortSignal.timeout(15_000),
        ...(signal ? [signal] : []),
      ]),
    });
  return {
    async exchange(parameters, signal): Promise<TokenSet> {
      try {
        const response = await send("/oauth2/token", parameters, signal);
        const body = await boundedJson(response);
        if (response.status === 400 && body.error === "invalid_grant")
          throw new WorkerAuthError(
            "LOGIN_REQUIRED",
            "Authorization expired or was revoked. Run worker login again.",
          );
        if (
          !response.ok ||
          typeof body.access_token !== "string" ||
          typeof body.refresh_token !== "string" ||
          !body.refresh_token ||
          typeof body.token_type !== "string" ||
          body.token_type.toLowerCase() !== "bearer"
        )
          throw new Error();
        const keysResponse = await request(`${identity.issuer}/jwks`, {
          redirect: "error",
          cache: "no-store",
          signal: AbortSignal.any([
            AbortSignal.timeout(15_000),
            ...(signal ? [signal] : []),
          ]),
        });
        if (!keysResponse.ok) throw new Error();
        const keys = await boundedJson(keysResponse);
        if (!Array.isArray(keys.keys)) throw new Error();
        const { payload } = await jwtVerify(
          body.access_token,
          createLocalJWKSet(keys as unknown as JSONWebKeySet),
          {
            issuer: identity.issuer,
            audience: identity.resource,
            requiredClaims: [
              "sub",
              "exp",
              "iat",
              "client_id",
              "cad_grant",
              "scope",
            ],
          },
        );
        if (
          payload.client_id !== WORKER_OAUTH_CLIENT_ID ||
          typeof payload.sub !== "string" ||
          !payload.sub ||
          typeof payload.exp !== "number" ||
          typeof payload.cad_grant !== "string" ||
          payload.cnf ||
          typeof payload.scope !== "string" ||
          !payload.scope.split(" ").includes("cad:tools")
        )
          throw new Error();
        return {
          token: body.access_token,
          refreshToken: body.refresh_token,
          account: payload.sub,
          expiresAt: payload.exp * 1000,
        };
      } catch (error) {
        if (error instanceof WorkerAuthError) throw error;
        throw new WorkerAuthError(
          "OAUTH_UNAVAILABLE",
          "OAuth request or token verification failed. Check the server and retry; reauthorize if refresh was interrupted.",
        );
      }
    },
    async revoke(refreshToken, signal): Promise<void> {
      try {
        const response = await send(
          "/oauth2/revoke",
          { token: refreshToken, token_type_hint: "refresh_token" },
          signal,
        );
        await response.body?.cancel();
        if (!response.ok) throw new Error();
      } catch {
        throw new WorkerAuthError(
          "REVOCATION_FAILED",
          "Remote revocation could not be confirmed. Retry logout or revoke TheoryFoundry Local Worker in Connected Apps.",
        );
      }
    },
  };
}
