import type { WorkerExportMetadata } from "@theoryfoundry/contracts";
export interface WorkerExportJob {
  id: string;
  owner_id: string;
  project_id: string;
  export_id: string;
  revision_id: string;
  source_hash: string;
  format: "stl" | "3mf";
  deadline: Date;
  retain_until: Date;
  state: "PENDING" | "COMPLETED" | "CANCELLED" | "FAILED" | "EXPIRED";
  completion_hash: string | null;
  completion: WorkerExportMetadata | null;
}
