import * as z from "zod/v4";
import type {
  LocalInstallation,
  LocalInstanceCapabilities,
} from "../../../domains/local-instance/index.js";
import { localProject } from "../utils/localConfiguration.util.js";

const containerSchema = z.object({
  labels: z.record(z.string(), z.string()).nullable(),
  running: z.boolean(),
  ports: z
    .record(
      z.string(),
      z
        .array(z.object({ HostIp: z.string(), HostPort: z.string() }))
        .nullable(),
    )
    .nullable(),
});

export async function ownsLocalPort(
  capabilities: LocalInstanceCapabilities,
  state: LocalInstallation,
): Promise<boolean> {
  const options = { signal: capabilities.signal };
  const containers = await capabilities.run(["ps", "--quiet"], options);
  if (containers.code !== 0)
    throw new Error(
      "DOCKER_UNAVAILABLE: Cannot identify the process occupying the local port.",
    );
  const ids = containers.stdout
    .toString("utf8")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!ids.length) return false;
  // Select only ownership and binding metadata; never read other containers' environments.
  const inspection = await capabilities.run(
    [
      "inspect",
      "--type",
      "container",
      "--format",
      '{"labels":{{json .Config.Labels}},"running":{{json .State.Running}},"ports":{{json .NetworkSettings.Ports}}}',
      ...ids,
    ],
    options,
  );
  if (inspection.code !== 0)
    throw new Error(
      "DOCKER_UNAVAILABLE: Cannot verify ownership of the occupied local port. Retry local start.",
    );
  const listeners = inspection.stdout
    .toString("utf8")
    .trim()
    .split("\n")
    .map((line) => containerSchema.parse(JSON.parse(line)))
    .flatMap((container) =>
      Object.entries(container.ports ?? {}).flatMap(([port, bindings]) =>
        (bindings ?? [])
          .filter((binding) => binding.HostPort === String(state.port))
          .map((binding) => ({ container, port, binding })),
      ),
    );
  return (
    listeners.length === 1 &&
    listeners.every(
      ({ container, port, binding }) =>
        container.running &&
        port === "3000/tcp" &&
        binding.HostIp === "127.0.0.1" &&
        container.labels?.["com.docker.compose.project"] ===
          localProject(state) &&
        container.labels["com.docker.compose.service"] === "proxy",
    )
  );
}
