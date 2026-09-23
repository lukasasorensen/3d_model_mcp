import {
  createProjectInputSchema,
  updateProjectInputSchema,
  projectSummarySchema,
  type CreateProjectInput,
  type UpdateProjectInput,
  CONTRACT_VERSION,
  candidateRecordSchema,
  projectIdSchema,
  revisionManifestSchema,
  type GeometrySummary,
  type CandidateRecord,
  type Diagnostic,
  type RendererProvenance,
  type RevisionManifest,
} from "@rjls/contracts";
import type { Pool, PoolClient, QueryResultRow } from "pg";

import { CadDomainError } from "./cad-domain-error.js";
import { sha256 } from "./hash.js";
import type { ProjectSummary } from "./project-types.js";
import { assertArtifactSet } from "./render-policy.js";

type QueryExecutor = Pick<Pool, "query"> | Pick<PoolClient, "query">;

interface CandidateRow extends QueryResultRow {
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

interface RevisionRow extends QueryResultRow {
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

interface ArtifactRow extends QueryResultRow { metadata: unknown }

function asIsoTimestamp(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

export interface PersistedCandidate {
  candidate: CandidateRecord;
  source: string;
}

export interface PersistedRevision {
  manifest: RevisionManifest;
  source: string;
}

export class PostgresProjectPersistence {
  constructor(
    private readonly pool: Pool,
    private readonly ownerId: string,
    private readonly executor: QueryExecutor = pool,
  ) {}

  async transaction<T>(operation: (transaction: PostgresProjectPersistence) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await operation(new PostgresProjectPersistence(this.pool, this.ownerId, client));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async requireProject(projectId: string, lock = false): Promise<{ currentRevision: string | null }> {
    projectIdSchema.parse(projectId);
    const result = await this.executor.query<{ current_revision_id: string | null }>(
      `SELECT current_revision_id FROM projects WHERE id = $1 AND owner_id = $2${lock ? " FOR UPDATE" : ""}`,
      [projectId, this.ownerId],
    );
    if (!result.rows[0]) throw new CadDomainError("PROJECT_NOT_FOUND", "Project not found.");
    return { currentRevision: result.rows[0].current_revision_id };
  }

  async createProject(projectId: string, input: CreateProjectInput): Promise<ProjectSummary> {
    projectIdSchema.parse(projectId);
    const details = createProjectInputSchema.parse(input);
    await this.executor.query("INSERT INTO projects (id, owner_id, name, description) VALUES ($1, $2, $3, $4)", [projectId, this.ownerId, details.name, details.description]);
    return { projectId, ...details };
  }

  async updateProject(raw: UpdateProjectInput): Promise<ProjectSummary> {
    const input = updateProjectInputSchema.parse(raw);
    const result = await this.executor.query<{ id: string; name: string; description: string }>(
      "UPDATE projects SET name = COALESCE($3, name), description = COALESCE($4, description), updated_at = now() WHERE id = $1 AND owner_id = $2 RETURNING id, name, description",
      [input.projectId, this.ownerId, input.name ?? null, input.description ?? null],
    );
    const row = result.rows[0];
    if (!row) throw new CadDomainError("PROJECT_NOT_FOUND", "Project not found.");
    return projectSummarySchema.parse({ projectId: row.id, name: row.name, description: row.description });
  }

  async listProjects(): Promise<ProjectSummary[]> {
    const result = await this.executor.query<{ id: string; name: string; description: string }>("SELECT id, name, description FROM projects WHERE owner_id = $1 ORDER BY id", [this.ownerId]);
    return result.rows.map((row) => projectSummarySchema.parse({ projectId: row.id, name: row.name, description: row.description }));
  }

  async readCandidate(projectId: string, candidateId: string, lock = false): Promise<PersistedCandidate> {
    await this.requireProject(projectId);
    const result = await this.executor.query<CandidateRow>(
      `SELECT * FROM candidates WHERE id = $1 AND project_id = $2${lock ? " FOR UPDATE" : ""}`,
      [candidateId, projectId],
    );
    const row = result.rows[0];
    if (!row) throw new CadDomainError("CANDIDATE_NOT_FOUND", "Candidate not found.", { candidateId });
    const artifacts = (await this.executor.query<ArtifactRow>("SELECT metadata FROM candidate_artifacts WHERE candidate_id = $1 ORDER BY format", [row.id])).rows.map((item) => item.metadata);
    const candidate = candidateRecordSchema.parse({
      version: CONTRACT_VERSION,
      projectId: row.project_id,
      candidateId: row.id,
      parentRevision: row.parent_revision_id,
      sourceHash: row.source_hash,
      sourceBytes: row.source_bytes,
      state: row.state,
      ...(row.active_attempt_id ? { activeAttemptId: row.active_attempt_id } : {}),
      ...(row.geometry ? { geometry: row.geometry } : {}),
      createdAt: asIsoTimestamp(row.created_at),
      updatedAt: asIsoTimestamp(row.updated_at),
      requestId: row.request_id,
      toolCallId: row.tool_call_id,
      ...(row.validation_policy_version ? { validationPolicyVersion: row.validation_policy_version } : {}),
      diagnostics: row.diagnostics,
      ...(row.renderer ? { renderer: row.renderer } : {}),
      artifacts,
    });
    if (sha256(row.source) !== candidate.sourceHash || Buffer.byteLength(row.source) !== candidate.sourceBytes) {
      throw new CadDomainError("CORRUPT_PROJECT", "Candidate source failed integrity validation.");
    }
    return { candidate, source: row.source };
  }

  async readRevision(projectId: string, revisionId: string, lock = false): Promise<PersistedRevision> {
    await this.requireProject(projectId);
    const result = await this.executor.query<RevisionRow>(
      `SELECT * FROM revisions WHERE id = $1 AND project_id = $2${lock ? " FOR UPDATE" : ""}`,
      [revisionId, projectId],
    );
    const row = result.rows[0];
    if (!row) throw new CadDomainError("REVISION_NOT_FOUND", "Revision not found.", { revisionId });
    return this.hydrateRevision(row);
  }

  async listRevisionHistory(projectId: string, currentRevision: string): Promise<RevisionManifest[]> {
    const rows = (await this.executor.query<RevisionRow>("SELECT * FROM revisions WHERE project_id = $1", [projectId])).rows;
    const rowsById = new Map(rows.map((row) => [row.id, row]));
    const revisions: RevisionManifest[] = [];
    const seenRevisionIds = new Set<string>();
    let revisionId: string | null = currentRevision;
    while (revisionId) {
      if (seenRevisionIds.has(revisionId)) throw new CadDomainError("CORRUPT_PROJECT", "Revision history contains a cycle.");
      seenRevisionIds.add(revisionId);
      const row = rowsById.get(revisionId);
      if (!row) throw new CadDomainError("CORRUPT_PROJECT", "Revision history is incomplete.");
      revisions.push((await this.hydrateRevision(row)).manifest);
      revisionId = row.parent_revision_id;
    }
    return revisions;
  }

  async insertCandidate(input: {
    id: string;
    projectId: string;
    parentRevision: string | null;
    source: string;
    requestId: string;
    toolCallId: string;
    createdAt: Date;
  }): Promise<void> {
    await this.executor.query(
      `INSERT INTO candidates (id, project_id, parent_revision_id, source, source_hash, source_bytes, state, request_id, tool_call_id, diagnostics, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,'CREATED',$7,$8,'[]'::jsonb,$9,$9)`,
      [input.id, input.projectId, input.parentRevision, input.source, sha256(input.source), Buffer.byteLength(input.source), input.requestId, input.toolCallId, input.createdAt],
    );
  }

  async markCandidateRunning(projectId: string, candidateId: string, attemptId: string, updatedAt: Date): Promise<void> {
    await this.requireProject(projectId);
    await this.executor.query("INSERT INTO validation_attempts (id, candidate_id, state, deadline) VALUES ($1,$2,'RUNNING',$3)", [attemptId, candidateId, new Date(updatedAt.getTime() + 120_000)]);
    const result = await this.executor.query("UPDATE candidates SET state = 'RUNNING', active_attempt_id = $3, updated_at = $1 WHERE id = $2 AND project_id = $4 AND state = 'CREATED' RETURNING id", [updatedAt, candidateId, attemptId, projectId]);
    if (!result.rows[0]) throw new CadDomainError("INVALID_CANDIDATE_STATE", "Candidate validation ownership was lost.");
  }

  async completeCandidateValidation(input: {
    projectId: string; candidateId: string; attemptId: string; state: "VALID" | "REJECTED" | "CREATED";
    diagnostics: Diagnostic[]; renderer?: RendererProvenance; geometry?: GeometrySummary;
    validationPolicyVersion?: string; artifacts: CandidateRecord["artifacts"]; updatedAt: Date;
    error?: { code: string; message: string; details: Readonly<Record<string, string | number | boolean | null>> };
  }): Promise<void> {
    await this.requireProject(input.projectId);
    const updated = await this.executor.query(
      "UPDATE candidates SET state = $1, diagnostics = $2, renderer = $3, validation_policy_version = $4, updated_at = $5, active_attempt_id = NULL, geometry = $9 WHERE id = $6 AND project_id = $7 AND state = 'RUNNING' AND active_attempt_id = $8 RETURNING id",
      [input.state, JSON.stringify(input.diagnostics), input.renderer ? JSON.stringify(input.renderer) : null, input.validationPolicyVersion ?? null, input.updatedAt, input.candidateId, input.projectId, input.attemptId, input.geometry ? JSON.stringify(input.geometry) : null],
    );
    if (!updated.rows[0]) return;
    await this.executor.query("UPDATE validation_attempts SET state = $2, error = $3, updated_at = $4 WHERE id = $1 AND candidate_id = $5 AND state = 'RUNNING'", [input.attemptId, input.state === "CREATED" ? "FAILED" : input.state, input.error ? JSON.stringify(input.error) : null, input.updatedAt, input.candidateId]);
    if (input.state === "VALID") for (const artifact of input.artifacts) {
      await this.executor.query("INSERT INTO candidate_artifacts (candidate_id, format, metadata) VALUES ($1,$2,$3)", [input.candidateId, artifact.format, JSON.stringify(artifact)]);
    }
  }

  async supersedeCandidate(candidateId: string, updatedAt: Date): Promise<void> {
    await this.executor.query("UPDATE candidates SET state = 'SUPERSEDED', updated_at = $1 WHERE id = $2", [updatedAt, candidateId]);
  }

  async insertRevision(input: {
    id: string;
    projectId: string;
    parentRevision: string | null;
    restoredFromRevision?: string;
    source: string;
    sourceHash: string;
    sourceBytes: number;
    requestId: string;
    toolCallId: string;
    candidateId: string;
    validationPolicyVersion: string;
    diagnostics: Diagnostic[];
    renderer: RendererProvenance;
    geometry?: GeometrySummary;
    createdAt: Date;
  }): Promise<void> {
    await this.executor.query(
      `INSERT INTO revisions (id, project_id, parent_revision_id, restored_from_revision_id, source, source_hash, source_bytes, request_id, tool_call_id, candidate_id, validation_policy_version, diagnostics, renderer, created_at, geometry)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [input.id, input.projectId, input.parentRevision, input.restoredFromRevision ?? null, input.source, input.sourceHash, input.sourceBytes, input.requestId, input.toolCallId, input.candidateId, input.validationPolicyVersion, JSON.stringify(input.diagnostics), JSON.stringify(input.renderer), input.createdAt, input.geometry ? JSON.stringify(input.geometry) : null],
    );
  }

  async insertRevisionArtifacts(revisionId: string, artifacts: RevisionManifest["artifacts"]): Promise<void> {
    for (const artifact of artifacts) {
      await this.executor.query("INSERT INTO revision_artifacts (revision_id, format, metadata) VALUES ($1,$2,$3)", [revisionId, artifact.format, JSON.stringify(artifact)]);
    }
  }

  async restoreRevisionArtifacts(revisionId: string, sourceRevisionId: string, artifacts: RevisionManifest["artifacts"]): Promise<void> {
    for (const artifact of artifacts) {
      const result = await this.executor.query(
        "INSERT INTO revision_artifacts (revision_id, format, metadata, object_key) SELECT $1, format, $2::jsonb, object_key FROM revision_artifacts WHERE revision_id = $3 AND format = $4 RETURNING revision_id",
        [revisionId, JSON.stringify(artifact), sourceRevisionId, artifact.format],
      );
      if (!result.rows[0]) throw new CadDomainError("CORRUPT_PROJECT", "Historical revision artifact metadata is incomplete.");
    }
  }

  async advanceCurrentRevision(projectId: string, revisionId: string, updatedAt: Date): Promise<void> {
    await this.executor.query("UPDATE projects SET current_revision_id = $1, updated_at = $2 WHERE id = $3", [revisionId, updatedAt, projectId]);
  }

  async markCandidatePromoted(candidateId: string, updatedAt: Date): Promise<void> {
    await this.executor.query("UPDATE candidates SET state = 'PROMOTED', updated_at = $1 WHERE id = $2", [updatedAt, candidateId]);
  }

  private async hydrateRevision(row: RevisionRow): Promise<PersistedRevision> {
    const artifacts = (await this.executor.query<ArtifactRow>("SELECT metadata FROM revision_artifacts WHERE revision_id = $1 ORDER BY format", [row.id])).rows.map((item) => item.metadata);
    const manifest = revisionManifestSchema.parse({
      version: CONTRACT_VERSION,
      projectId: row.project_id,
      revisionId: row.id,
      parentRevision: row.parent_revision_id,
      ...(row.restored_from_revision_id ? { restoredFrom: row.restored_from_revision_id } : {}),
      sourceHash: row.source_hash,
      sourceBytes: row.source_bytes,
      createdAt: asIsoTimestamp(row.created_at),
      requestId: row.request_id,
      toolCallId: row.tool_call_id,
      candidateId: row.candidate_id,
      validationPolicyVersion: row.validation_policy_version,
      validationResult: "VALID",
      diagnostics: row.diagnostics,
      artifacts,
      renderer: row.renderer,
      ...(row.geometry ? { geometry: row.geometry } : {}),
    });
    if (sha256(row.source) !== manifest.sourceHash || Buffer.byteLength(row.source) !== manifest.sourceBytes) {
      throw new CadDomainError("CORRUPT_PROJECT", "Revision source failed integrity validation.", { revisionId: row.id });
    }
    assertArtifactSet(manifest.artifacts, manifest.sourceHash, manifest.renderer, manifest.revisionId);
    return { manifest, source: row.source };
  }
}
