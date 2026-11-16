import type { WorkerPackage } from "../../../domains/installation/index.js";
export function commandHelp(metadata: WorkerPackage): string {
  const command = `pnpm --silent dlx ${metadata.name}@${metadata.version}`;
  return `${metadata.name} ${metadata.version} (Node 24)

${command} local start [--source <checkout>] [--port <port>] [--open] [--json]
${command} local status|stop|logs|setup [--json]
${command} local backup --output <encrypted-file>
${command} local restore --input <encrypted-file> [--port <port>]
${command} local upgrade --release <manifest> --output <encrypted-backup>
${command} connect --server <origin> [--account <id>] [--allow-loopback-http] [--json]
${command} tools --json
${command} call <tool> --input-file <json-file> [--output <artifact-file>] [--json]
${command} setup
${command} setup --server <origin> --client codex|claude [--scope global|project] [--account <account-id>]
${command} login --server https://your-server.example
${command} serve --server https://your-server.example --account <account-id>
${command} logout --server https://your-server.example --account <account-id>
${command} doctor [--json] [--server <origin> --account <account-id>]
${command} ai serve --server <origin> --account <account-id> [--provider ollama|openai-compatible] [--endpoint <local-url>]
${command} ai doctor --server <origin> --account <account-id>

setup explicitly installs verified renderer assets and pinned Chromium. With a server/client it also authenticates and configures the client. serve never installs or opens login.
Loopback development requires --allow-loopback-http. Login prints the account ID.
Doctor checks assets, rendering and native bindings; account checks may refresh credentials.
AI commands run independently of rendering; use ai --help for local model options.
Tokens are never accepted as arguments or printed. Registry publication is a separate release step.
`;
}
