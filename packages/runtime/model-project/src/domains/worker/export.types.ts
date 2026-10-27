export interface ExportRow {
  id: string;
  owner_id: string;
  project_id: string;
  revision_id: string;
  source_hash: string;
  format: "stl" | "3mf";
  mode: string;
  state: string;
  session_id: string | null;
  token_hash: string | null;
  metadata: unknown;
  deadline: Date;
  expires_at: Date;
}
