import { CLAUDE_HOSTED_OAUTH_CALLBACK } from "@theoryfoundry/contracts";

/** Only follow a redirect returned by our authenticated OAuth provider, never a query-string redirect. */
export async function submitOAuthAction(
  path: string,
  body: Record<string, unknown>,
): Promise<void> {
  const response = await fetch(`/api/auth/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      ...body,
      oauth_query: window.location.search.slice(1),
    }),
  });
  const result = (await response.json()) as {
    url?: unknown;
    redirect_uri?: unknown;
  };
  const destination = result.url ?? result.redirect_uri;
  if (!response.ok || typeof destination !== "string")
    throw new Error(
      "Authorization could not be completed. Restart login from Codex.",
    );
  const uri = new URL(destination, window.location.origin);
  const hostedClaudeCallback =
    uri.origin + uri.pathname === CLAUDE_HOSTED_OAUTH_CALLBACK &&
    !uri.username &&
    !uri.password &&
    !uri.href.includes("#");
  if (
    uri.origin !== window.location.origin &&
    !hostedClaudeCallback &&
    !(
      uri.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(uri.hostname)
    )
  )
    throw new Error("Unexpected authorization redirect.");
  window.location.assign(uri.href);
}
