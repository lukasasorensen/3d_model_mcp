import type { WorkerAuthentication } from "@theoryfoundry/worker-auth";
import type { WorkerRenderer } from "../compute/index.js";
import type {
  ClientInstallation,
  ConfigurationReceipt,
  WorkerTarget,
  WorkerPackage,
} from "./installation.types.js";
export interface CommandDependencies {
  metadata: WorkerPackage;
  renderer: WorkerRenderer;
  prepareAssets(signal: AbortSignal): Promise<void>;
  configureClient(
    installation: ClientInstallation,
    signal: AbortSignal,
  ): Promise<ConfigurationReceipt>;
  installBrowser(signal: AbortSignal): Promise<void>;
  loadAuthentication(
    target?: WorkerTarget,
  ): Promise<WorkerAuthentication | undefined>;
  openBrowser(url: string, signal: AbortSignal): Promise<void>;
  serve(target: WorkerTarget, signal: AbortSignal): Promise<void>;
  stdout(text: string): void;
  stderr(text: string): void;
}
