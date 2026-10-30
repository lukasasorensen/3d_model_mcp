import type { WorkerPackage } from "../../../domains/installation/index.js";
export function commandHelp(metadata: WorkerPackage): string {
  const command = `pnpm --silent dlx ${metadata.name}@${metadata.version}`;
  return `${metadata.name} ${metadata.version} (Node 24)

${command} setup
${command} setup --server <origin> --client codex|claude [--scope global|project] [--account <account-id>]
${command} login --server https://your-server.example
${command} serve --server https://your-server.example --account <account-id>
${command} logout --server https://your-server.example --account <account-id>
${command} doctor [--json] [--server <origin> --account <account-id>]

setup explicitly installs verified renderer assets and pinned Chromium. With a server/client it also authenticates and configures the client. serve never installs or opens login.
Loopback development requires --allow-loopback-http. Login prints the account ID.
Doctor checks assets, rendering and native bindings; account checks may refresh credentials.
Tokens are never accepted as arguments or printed. Registry publication is a separate release step.
`;
}
