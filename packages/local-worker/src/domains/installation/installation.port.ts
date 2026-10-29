import type { WorkerAuthentication } from "@theoryfoundry/worker-auth";
import type { WorkerRenderer } from "../compute/index.js";
import type { WorkerTarget, WorkerPackage } from "./installation.types.js";
export interface CommandDependencies {
  metadata: WorkerPackage;
  renderer: WorkerRenderer;
  installBrowser(signal: AbortSignal): Promise<void>;
  loadAuthentication(
    target?: WorkerTarget,
  ): Promise<WorkerAuthentication | undefined>;
  openBrowser(url: string, signal: AbortSignal): Promise<void>;
  serve(target: WorkerTarget, signal: AbortSignal): Promise<void>;
  stdout(text: string): void;
  stderr(text: string): void;
}
