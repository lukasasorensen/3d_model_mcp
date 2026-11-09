export function aiCompanionCommands(
  origin: string,
  account: string,
  version: string,
): string {
  const url = new URL(origin);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const flag =
    url.protocol === "http:" && loopback ? " --allow-loopback-http" : "";
  const command = `pnpm --silent dlx @tfoundry/local-worker@${version}`;
  const quote = (value: string): string =>
    `'${value.replaceAll("'", "'\\''")}'`;
  return `${command} login --server ${quote(origin)}${flag}\n${command} ai serve --server ${quote(origin)} --account ${quote(account)}${flag}`;
}
