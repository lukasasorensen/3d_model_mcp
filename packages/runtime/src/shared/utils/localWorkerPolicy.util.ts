import { remoteMcpEnabled } from "./remoteMcpPolicy.util.js";

export function localWorkerEnabled(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    remoteMcpEnabled(environment) &&
    environment.THEORYFOUNDRY_LOCAL_WORKER_ENABLED === "1"
  );
}
