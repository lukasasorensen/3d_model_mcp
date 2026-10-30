export function localWorkerCommand(
  origin: string,
  client: "codex" | "claude",
  scope: "global" | "project",
): string {
  const url = new URL(origin);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    url.origin !== origin ||
    url.username ||
    url.password ||
    (url.protocol !== "https:" && !(loopback && url.protocol === "http:"))
  )
    throw new Error("Invalid CAD origin.");
  if (
    !["codex", "claude"].includes(client) ||
    !["global", "project"].includes(scope)
  )
    throw new Error("Invalid client configuration.");
  const args = [
    "pnpm",
    "--silent",
    "dlx",
    "@tfoundry/local-worker@0.1.0",
    "setup",
    "--server",
    origin,
    "--client",
    client,
    "--scope",
    scope,
  ];
  if (url.protocol === "http:") args.push("--allow-loopback-http");
  return args.map((value) => `'${value.replaceAll("'", "'\\''")}'`).join(" ");
}
