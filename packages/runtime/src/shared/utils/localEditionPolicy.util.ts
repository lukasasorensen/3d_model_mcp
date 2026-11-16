/** HTTP exceptions are confined to an explicitly selected loopback installation. */
export function localEditionOrigin(
  environment: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (environment.THEORYFOUNDRY_LOCAL_EDITION !== "1") return undefined;
  const origin = environment.BETTER_AUTH_URL;
  if (!origin) throw new Error("Local edition requires its loopback origin.");
  const url = new URL(origin);
  if (
    url.origin !== origin ||
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    environment.THEORYFOUNDRY_ALLOWED_ORIGIN !== origin
  )
    throw new Error(
      "Local edition requires matching canonical HTTP loopback origins.",
    );
  return origin;
}
