export interface WorkerValidationJob {
  id: string;
  project_id: string;
  candidate_id: string;
  attempt_id: string;
  source_hash: string;
  state: "PENDING" | "COMPLETED" | "CANCELLED" | "EXPIRED";
  deadline: Date;
  completion_hash: string | null;
  completion: unknown;
}
