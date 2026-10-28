import type { ConfiguredCadRuntime } from "./configuredRuntime.port.js";
export interface ConfiguredCadRuntimeManagerOptions {
  createRuntime: (ownerId: string) => Promise<ConfiguredCadRuntime>;
  maxEntries?: number;
  idleTtlMs?: number;
  clock?: () => number;
}
