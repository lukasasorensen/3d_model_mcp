import { join } from "node:path";
import { createServer } from "node:net";
import type {
  LocalInstallation,
  LocalInstanceCapabilities,
  LocalSecrets,
} from "../../../domains/local-instance/index.js";
import {
  localEnvironment,
  localOrigin,
  localProject,
  localImages,
} from "../utils/localConfiguration.util.js";
export function composeArguments(
  capabilities: Pick<LocalInstanceCapabilities, "assets">,
  state: LocalInstallation,
): string[] {
  return [
    "compose",
    "--project-name",
    localProject(state),
    "--project-directory",
    capabilities.assets,
    "--env-file",
    "/dev/null",
    "-f",
    join(capabilities.assets, "compose.self-host.yaml"),
  ];
}
export async function runCompose(
  capabilities: LocalInstanceCapabilities,
  state: LocalInstallation,
  secrets: LocalSecrets,
  args: string[],
): Promise<Buffer> {
  const result = await capabilities.run(
    [...composeArguments(capabilities, state), ...args],
    {
      environment: localEnvironment(state, secrets),
      signal: capabilities.signal,
    },
  );
  if (result.code !== 0)
    throw new Error(
      `COMPOSE_FAILED: Local compose ${args[0]} ${args.at(-1)} failed. Check local logs; existing data is preserved.`,
    );
  return result.stdout;
}
export async function stopLocalContainers(
  capabilities: LocalInstanceCapabilities,
  state: LocalInstallation,
  service?: "migrate",
): Promise<void> {
  const options = { signal: capabilities.signal };
  const containers = await capabilities.run(
    [
      "ps",
      "--quiet",
      "--filter",
      `label=com.docker.compose.project=${localProject(state)}`,
      ...(service
        ? ["--filter", `label=com.docker.compose.service=${service}`]
        : []),
    ],
    options,
  );
  if (containers.code !== 0)
    throw new Error(
      "CLEANUP_FAILED: Cannot identify this installation's remaining containers.",
    );
  const ids = containers.stdout
    .toString("utf8")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!ids.length) return;
  // Compose stop excludes one-off run containers, including interrupted migrations.
  const stopped = await capabilities.run(
    ["stop", "--timeout", "10", ...ids],
    options,
  );
  if (stopped.code !== 0)
    throw new Error(
      "CLEANUP_FAILED: Could not stop all of this installation's containers. Run local stop.",
    );
}
export async function requireFreePort(port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const server = createServer();
    server.once("error", () =>
      reject(
        new Error(
          "PORT_BUSY: Choose an unused --port when creating an installation.",
        ),
      ),
    );
    server.listen(port, "127.0.0.1", () => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });
}
export async function localReadiness(
  state: LocalInstallation,
  signal: AbortSignal,
): Promise<boolean> {
  try {
    const response = await fetch(`${localOrigin(state)}/v1/readiness`, {
      redirect: "error",
      signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
    });
    return (
      response.ok &&
      response.headers.get("x-theoryfoundry-local-instance") === state.id
    );
  } catch {
    signal.throwIfAborted();
    return false;
  }
}

export async function initializeLocalJournal(
  capabilities: LocalInstanceCapabilities,
  state: LocalInstallation,
): Promise<void> {
  const script = `const fs=require('node:fs');const directory='/journal';const marker=directory+'/JOURNAL';if(fs.existsSync(marker)){if(fs.readFileSync(marker,'utf8').trim()!=='theoryfoundry-erasure-v1')throw Error('Invalid journal')}else{if(fs.readdirSync(directory).length)throw Error('Nonempty journal without marker');const fd=fs.openSync(marker,'wx',0o600);try{fs.writeFileSync(fd,'theoryfoundry-erasure-v1\\n');fs.fsyncSync(fd)}finally{fs.closeSync(fd)}fs.chownSync(marker,1001,1001);fs.chownSync(directory,1001,1001);fs.chmodSync(directory,0o700);const fd2=fs.openSync(directory,'r');try{fs.fsyncSync(fd2)}finally{fs.closeSync(fd2)}}`;
  const result = await capabilities.run(
    [
      "run",
      "--rm",
      "--network",
      "none",
      "--mount",
      `type=volume,src=${localProject(state)}_erasures,dst=/journal`,
      localImages(state).toolingImage,
      "node",
      "-e",
      script,
    ],
    { signal: capabilities.signal },
  );
  if (result.code !== 0)
    throw new Error(
      "JOURNAL_INVALID: Initial journal setup failed. Never replace a missing journal for an existing installation.",
    );
}
