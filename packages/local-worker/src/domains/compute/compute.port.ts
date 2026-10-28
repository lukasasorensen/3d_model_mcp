import type {
  HeadlessRenderInput,
  HeadlessRenderResult,
  RendererProvenance,
  CompleteWorkerExport,
} from "@theoryfoundry/contracts";
export interface HostedWorkerApi {
  json(path: string, body: unknown, signal: AbortSignal): Promise<unknown>;
  upload(
    metadata: CompleteWorkerExport,
    bytes: Uint8Array,
    signal: AbortSignal,
  ): Promise<unknown>;
}
export interface WorkerRenderer {
  provenance: RendererProvenance;
  available(): boolean;
  render(
    input: HeadlessRenderInput,
    signal: AbortSignal,
  ): Promise<HeadlessRenderResult>;
  close(): Promise<void>;
}
export interface ComputeDependencies {
  api: HostedWorkerApi;
  renderer: WorkerRenderer;
}
