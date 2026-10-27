import type { CandidateRecord } from "@theoryfoundry/contracts";
import type { QueryResultRow } from "pg";
export interface CandidateRow extends QueryResultRow {
  id: string;
  project_id: string;
  parent_revision_id: string | null;
  source: string;
  source_hash: string;
  source_bytes: number;
  state: CandidateRecord["state"];
  request_id: string;
  tool_call_id: string;
  validation_policy_version: string | null;
  diagnostics: unknown;
  renderer: unknown;
  geometry: unknown;
  active_attempt_id?: string;
  created_at: Date;
  updated_at: Date;
}
export interface RevisionRow extends QueryResultRow {
  id: string;
  project_id: string;
  parent_revision_id: string | null;
  restored_from_revision_id: string | null;
  source: string;
  source_hash: string;
  source_bytes: number;
  request_id: string;
  tool_call_id: string;
  candidate_id: string;
  validation_policy_version: string;
  diagnostics: unknown;
  renderer: unknown;
  geometry: unknown;
  active_attempt_id?: string;
  created_at: Date;
}
export interface ArtifactRow extends QueryResultRow {
  metadata: unknown;
}
