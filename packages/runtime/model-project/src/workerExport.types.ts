import type {
  RendererProvenance,
  WorkerExportMetadata,
} from "@theoryfoundry/contracts";
import type { PoolClient } from "pg";
import type { ExportRow } from "./domains/worker/index.js";
export interface WorkerExportDependencies {
  renderer: RendererProvenance;
  finalize: (
    client: PoolClient,
    row: ExportRow & { name: string },
    bytes: Uint8Array,
    now: Date,
  ) => Promise<WorkerExportMetadata>;
  clock?: () => Date;
}
