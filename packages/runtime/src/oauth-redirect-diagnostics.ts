import { createHash } from "node:crypto";
import type { Pool } from "pg";

type OAuthClientAdapter = {
  findOne(input: {
    model: "oauthClient";
    where: Array<{ field: "clientId"; value: string }>;
  }): Promise<unknown>;
};

interface RedirectFingerprint {
  characters: number;
  bytes: number;
  sha256: string;
}

function fingerprint(value: string): RedirectFingerprint {
  return {
    characters: value.length,
    bytes: Buffer.byteLength(value, "utf8"),
    sha256: createHash("sha256").update(value).digest("hex"),
  };
}

function redirectUris(value: unknown): string[] {
  if (!value || typeof value !== "object" || !("redirectUris" in value)) return [];
  const candidate = (value as { redirectUris?: unknown }).redirectUris;
  return Array.isArray(candidate) ? candidate.filter((uri): uri is string => typeof uri === "string") : [];
}

function isLoopbackMatch(registered: string, requested: string): boolean {
  try {
    const registeredUrl = new URL(registered);
    const requestedUrl = new URL(requested);
    const isLoopbackIp = registeredUrl.hostname === "127.0.0.1" || registeredUrl.hostname === "[::1]";
    return isLoopbackIp
      && registeredUrl.hostname === requestedUrl.hostname
      && registeredUrl.pathname === requestedUrl.pathname
      && registeredUrl.protocol === requestedUrl.protocol
      && registeredUrl.search === requestedUrl.search;
  } catch {
    return false;
  }
}

function isInvalidRedirectResponse(response: Response): boolean {
  const location = response.headers.get("location");
  if (!location) return false;
  try {
    return new URL(location, "http://localhost").searchParams.get("error") === "invalid_redirect";
  } catch {
    return false;
  }
}

export async function recordRejectedOAuthRedirect(
  request: Request,
  response: Response,
  adapter: OAuthClientAdapter,
  pool: Pool,
): Promise<void> {
  if (!isInvalidRedirectResponse(response)) return;

  const requestUrl = new URL(request.url);
  const clientId = requestUrl.searchParams.get("client_id");
  const requested = requestUrl.searchParams.get("redirect_uri");
  if (!clientId || !requested) return;

  try {
    const [adapterClient, databaseResult] = await Promise.all([
      adapter.findOne({ model: "oauthClient", where: [{ field: "clientId", value: clientId }] }),
      pool.query<{ redirect_uris: unknown }>(
        "SELECT redirect_uris FROM oauth_client WHERE client_id = $1",
        [clientId],
      ),
    ]);
    const adapterUris = redirectUris(adapterClient);
    const databaseValue = databaseResult.rows[0]?.redirect_uris;
    const databaseUris = Array.isArray(databaseValue)
      ? databaseValue.filter((uri): uri is string => typeof uri === "string")
      : [];

    process.stderr.write(`${JSON.stringify({
      service: "oauth",
      event: "authorization.redirect-rejected",
      outcome: "invalid_redirect",
      requested: fingerprint(requested),
      adapter: {
        clientFound: Boolean(adapterClient),
        redirectUrisIsArray: Boolean(adapterClient && typeof adapterClient === "object" && Array.isArray((adapterClient as { redirectUris?: unknown }).redirectUris)),
        redirects: adapterUris.map(fingerprint),
        hasExactMatch: adapterUris.includes(requested),
        hasLoopbackMatch: adapterUris.some((uri) => isLoopbackMatch(uri, requested)),
      },
      database: {
        clientFound: databaseResult.rowCount === 1,
        redirectUrisIsArray: Array.isArray(databaseValue),
        redirects: databaseUris.map(fingerprint),
        hasExactMatch: databaseUris.includes(requested),
        hasLoopbackMatch: databaseUris.some((uri) => isLoopbackMatch(uri, requested)),
      },
    })}\n`);
  } catch {
    process.stderr.write(`${JSON.stringify({
      service: "oauth",
      event: "authorization.redirect-diagnostic",
      outcome: "diagnostic_failed",
    })}\n`);
  }
}

