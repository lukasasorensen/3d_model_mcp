import {
  CAD_LIMITS,
  CONTRACT_VERSION,
  artifactManifestSchema,
  candidateRecordSchema,
  isBrowserRendererProvenance,
  projectIdSchema,
  revisionManifestSchema,
  type ArtifactManifest,
  type CadRenderer,
  type CandidateRecord,
  type Diagnostic,
  type RendererProvenance,
  type RevisionManifest,
} from "@rjls/contracts";
import { randomUUID } from "node:crypto";
import type { Pool, PoolClient, QueryResultRow } from "pg";

import {
  CadDomainError,
  VALIDATION_POLICY_VERSION,
  assertSourcePolicy,
  renderValidationResultSchema,
  sha256,
  type ProjectState,
  type ProjectSummary,
} from "./repository.js";
import type { ModelProjectStore } from "./store.js";

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
  created_at: Date;
}

interface ArtifactRow extends QueryResultRow { metadata: unknown }

export interface PostgresModelProjectRepositoryOptions {
  pool: Pool;
  ownerId: string;
  renderer: CadRenderer;
  acceptRendererProvenance: (provenance: RendererProvenance) => boolean;
  clock?: () => Date;
  createId?: () => string;
  validationPolicyVersion?: string;
}

function asIso(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function assertArtifactSet(
  artifacts: ReadonlyArray<Omit<ArtifactManifest, "sourceRevision"> & { sourceRevision?: string }>,
  sourceHash: string,
  renderer: RendererProvenance,
  sourceRevision?: string,
): void {
  const formats = new Set<string>();
  for (const artifact of artifacts) {
    const byteLimit = artifact.format === "stl" ? CAD_LIMITS.previewBytes : CAD_LIMITS.exportBytes;
    if (
      formats.has(artifact.format) ||
      artifact.mimeType !== (artifact.format === "stl" ? "model/stl" : "model/3mf") ||
      artifact.byteSize > byteLimit ||
      (artifact.format === "stl" && artifact.triangleCount > CAD_LIMITS.previewTriangles) ||
      artifact.sourceHash !== sourceHash ||
      (sourceRevision !== undefined && artifact.sourceRevision !== sourceRevision) ||
      JSON.stringify(artifact.renderer) !== JSON.stringify(renderer)
    ) throw new CadDomainError("ARTIFACT_HASH_MISMATCH", "Artifact metadata failed binding or limit validation.");
    formats.add(artifact.format);
  }
  if (!formats.has("stl") && !isBrowserRendererProvenance(renderer)) {
    throw new CadDomainError("ARTIFACT_NOT_FOUND", "Validated STL preview metadata is missing.");
  }
}

export class PostgresModelProjectRepository implements ModelProjectStore {
  private readonly clock: () => Date;
  private readonly createId: () => string;
  private readonly validationPolicyVersion: string;

  constructor(private readonly options: PostgresModelProjectRepositoryOptions) {
    if (!options.ownerId) throw new Error("A repository owner is required.");
    this.clock = options.clock ?? (() => new Date());
    this.createId = options.createId ?? randomUUID;
    this.validationPolicyVersion = options.validationPolicyVersion ?? VALIDATION_POLICY_VERSION;
  }

  private async transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.options.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async requireProject(executor: Pick<Pool, "query"> | Pick<PoolClient, "query">, projectId: string, lock = false): Promise<{ currentRevision: string | null }> {
    projectIdSchema.parse(projectId);
    const result = await executor.query<{ current_revision_id: string | null }>(
      `SELECT current_revision_id FROM projects WHERE id = $1 AND owner_id = $2${lock ? " FOR UPDATE" : ""}`,
      [projectId, this.options.ownerId],
    );
    if (!result.rows[0]) throw new CadDomainError("PROJECT_NOT_FOUND", "Project not found.");
    return { currentRevision: result.rows[0].current_revision_id };
  }

  private async candidateFromRow(executor: Pick<Pool, "query"> | Pick<PoolClient, "query">, row: CandidateRow): Promise<CandidateRecord> {
    const artifacts = (await executor.query<ArtifactRow>("SELECT metadata FROM candidate_artifacts WHERE candidate_id = $1 ORDER BY format", [row.id])).rows.map((item) => item.metadata);
    const candidate = candidateRecordSchema.parse({
      version: CONTRACT_VERSION,
      projectId: row.project_id,
      candidateId: row.id,
      parentRevision: row.parent_revision_id,
      sourceHash: row.source_hash,
      sourceBytes: row.source_bytes,
      state: row.state,
      createdAt: asIso(row.created_at),
      updatedAt: asIso(row.updated_at),
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
    return candidate;
  }

  private async readCandidate(executor: Pick<Pool, "query"> | Pick<PoolClient, "query">, projectId: string, candidateId: string, lock = false): Promise<{ row: CandidateRow; candidate: CandidateRecord }> {
    await this.requireProject(executor, projectId);
    const result = await executor.query<CandidateRow>(
      `SELECT * FROM candidates WHERE id = $1 AND project_id = $2${lock ? " FOR UPDATE" : ""}`,
      [candidateId, projectId],
    );
    const row = result.rows[0];
    if (!row) throw new CadDomainError("CANDIDATE_NOT_FOUND", "Candidate not found.", { candidateId });
    return { row, candidate: await this.candidateFromRow(executor, row) };
  }

  private async revisionFromRow(executor: Pick<Pool, "query"> | Pick<PoolClient, "query">, row: RevisionRow): Promise<RevisionManifest> {
    const artifacts = (await executor.query<ArtifactRow>("SELECT metadata FROM revision_artifacts WHERE revision_id = $1 ORDER BY format", [row.id])).rows.map((item) => item.metadata);
    const manifest = revisionManifestSchema.parse({
      version: CONTRACT_VERSION,
      projectId: row.project_id,
      revisionId: row.id,
      parentRevision: row.parent_revision_id,
      ...(row.restored_from_revision_id ? { restoredFrom: row.restored_from_revision_id } : {}),
      sourceHash: row.source_hash,
      sourceBytes: row.source_bytes,
      createdAt: asIso(row.created_at),
      requestId: row.request_id,
      toolCallId: row.tool_call_id,
      candidateId: row.candidate_id,
      validationPolicyVersion: row.validation_policy_version,
      validationResult: "VALID",
      diagnostics: row.diagnostics,
      artifacts,
      renderer: row.renderer,
    });
    if (sha256(row.source) !== manifest.sourceHash || Buffer.byteLength(row.source) !== manifest.sourceBytes) {
      throw new CadDomainError("CORRUPT_PROJECT", "Revision source failed integrity validation.", { revisionId: row.id });
    }
    assertArtifactSet(manifest.artifacts, manifest.sourceHash, manifest.renderer, manifest.revisionId);
    return manifest;
  }

  private async readRevision(executor: Pick<Pool, "query"> | Pick<PoolClient, "query">, projectId: string, revisionId: string, lock = false): Promise<{ row: RevisionRow; manifest: RevisionManifest }> {
    await this.requireProject(executor, projectId);
    const result = await executor.query<RevisionRow>(
      `SELECT * FROM revisions WHERE id = $1 AND project_id = $2${lock ? " FOR UPDATE" : ""}`,
      [revisionId, projectId],
    );
    const row = result.rows[0];
    if (!row) throw new CadDomainError("REVISION_NOT_FOUND", "Revision not found.", { revisionId });
    return { row, manifest: await this.revisionFromRow(executor, row) };
  }

  async createProject(): Promise<ProjectSummary> {
    const projectId = this.createId();
    projectIdSchema.parse(projectId);
    await this.options.pool.query("INSERT INTO projects (id, owner_id) VALUES ($1, $2)", [projectId, this.options.ownerId]);
    return { projectId };
  }

  async listProjects(): Promise<ProjectSummary[]> {
    const result = await this.options.pool.query<{ id: string }>("SELECT id FROM projects WHERE owner_id = $1 ORDER BY id", [this.options.ownerId]);
    return result.rows.map((row) => ({ projectId: projectIdSchema.parse(row.id) }));
  }

  async getProjectState(projectId: string): Promise<ProjectState> {
    const project = await this.requireProject(this.options.pool, projectId);
    if (!project.currentRevision) return { projectId, currentRevision: null, source: null, artifacts: [], diagnostics: [] };
    const { manifest } = await this.readRevision(this.options.pool, projectId, project.currentRevision);
    return { projectId, currentRevision: manifest.revisionId, source: { hash: manifest.sourceHash, byteSize: manifest.sourceBytes }, artifacts: manifest.artifacts, diagnostics: manifest.diagnostics };
  }

  async readModelSource(projectId: string, revision?: string): Promise<{ revision: string; source: string; sourceHash: string }> {
    const project = await this.requireProject(this.options.pool, projectId);
    const selected = revision ?? project.currentRevision;
    if (!selected) throw new CadDomainError("PROJECT_NOT_FOUND", "Project has no current revision.");
    const { row, manifest } = await this.readRevision(this.options.pool, projectId, selected);
    return { revision: selected, source: row.source, sourceHash: manifest.sourceHash };
  }

  async listRevisions(projectId: string): Promise<RevisionManifest[]> {
    const project = await this.requireProject(this.options.pool, projectId);
    if (!project.currentRevision) return [];
    const rows = (await this.options.pool.query<RevisionRow>("SELECT * FROM revisions WHERE project_id = $1", [projectId])).rows;
    const byId = new Map(rows.map((row) => [row.id, row]));
    const result: RevisionManifest[] = [];
    const seen = new Set<string>();
    let cursor: string | null = project.currentRevision;
    while (cursor) {
      if (seen.has(cursor)) throw new CadDomainError("CORRUPT_PROJECT", "Revision history contains a cycle.");
      seen.add(cursor);
      const row = byId.get(cursor);
      if (!row) throw new CadDomainError("CORRUPT_PROJECT", "Revision history is incomplete.");
      result.push(await this.revisionFromRow(this.options.pool, row));
      cursor = row.parent_revision_id;
    }
    return result;
  }

  async proposeModelSource(input: { projectId: string; parentRevision: string | null; source: string; requestId: string; toolCallId: string }): Promise<CandidateRecord> {
    assertSourcePolicy(input.source);
    const id = this.createId();
    const now = this.clock();
    await this.transaction(async (client) => {
      const project = await this.requireProject(client, input.projectId, true);
      if (project.currentRevision !== input.parentRevision) {
        throw new CadDomainError("STALE_REVISION", "Candidate parent is not the current revision.", { expected: project.currentRevision, received: input.parentRevision });
      }
      await client.query(
        `INSERT INTO candidates (id, project_id, parent_revision_id, source, source_hash, source_bytes, state, request_id, tool_call_id, diagnostics, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,'CREATED',$7,$8,'[]'::jsonb,$9,$9)`,
        [id, input.projectId, input.parentRevision, input.source, sha256(input.source), Buffer.byteLength(input.source), input.requestId, input.toolCallId, now],
      );
    });
    return (await this.readCandidate(this.options.pool, input.projectId, id)).candidate;
  }

  async validateAndRender(input: { projectId: string; candidateId: string; previewProfile: "standard"; signal?: AbortSignal }): Promise<CandidateRecord> {
    if (input.signal?.aborted) throw new CadDomainError("CANCELLED", "Operation cancelled.");
    const claimed = await this.transaction(async (client) => {
      const { candidate } = await this.readCandidate(client, input.projectId, input.candidateId, true);
      if (candidate.state !== "CREATED") throw new CadDomainError("INVALID_CANDIDATE_STATE", "Only a created candidate can be rendered.");
      const now = this.clock();
      await client.query("UPDATE candidates SET state = 'RUNNING', updated_at = $1 WHERE id = $2 AND state = 'CREATED'", [now, input.candidateId]);
      return { ...candidate, state: "RUNNING" as const, updatedAt: now.toISOString() };
    });
    let nextState: "VALID" | "REJECTED" = "REJECTED";
    let diagnostics: Diagnostic[] = [];
    let renderer: RendererProvenance | undefined;
    let artifacts: CandidateRecord["artifacts"] = [];
    let policy: string | undefined;
    try {
      const raw = await this.options.renderer.validateAndRender({ projectId: input.projectId, candidateId: input.candidateId, source: (await this.options.pool.query<{ source: string }>("SELECT source FROM candidates WHERE id = $1", [input.candidateId])).rows[0]?.source ?? "", sourceHash: claimed.sourceHash, previewProfile: input.previewProfile, signal: input.signal });
      if (input.signal?.aborted) throw new CadDomainError("CANCELLED", "Rendering was cancelled.");
      const result = renderValidationResultSchema.parse(raw);
      diagnostics = result.diagnostics;
      if (result.outcome === "VALID" && result.validationPolicyVersion === this.validationPolicyVersion && result.provenance.validationPolicyVersion === this.validationPolicyVersion && this.options.acceptRendererProvenance(result.provenance)) {
        const formats = new Set<string>();
        artifacts = result.artifacts.map((artifact) => {
          if (formats.has(artifact.format)) throw new CadDomainError("ARTIFACT_HASH_MISMATCH", "Renderer returned duplicate artifact content.");
          formats.add(artifact.format);
          const hash = sha256(artifact.bytes);
          return candidateRecordSchema.shape.artifacts.unwrap().element.parse({
            artifactId: hash.slice(0, 32), format: artifact.format, mimeType: artifact.mimeType, hash,
            byteSize: artifact.bytes.byteLength, triangleCount: artifact.triangleCount, units: "mm",
            axisConvention: "right-handed-z-up", boundingBox: artifact.boundingBox, sourceHash: claimed.sourceHash,
            renderer: result.provenance, tessellation: artifact.tessellation,
          });
        });
        assertArtifactSet(artifacts, claimed.sourceHash, result.provenance);
        nextState = "VALID";
        renderer = result.provenance;
        policy = result.validationPolicyVersion;
      } else if (result.outcome === "VALID") {
        diagnostics = [{ code: "PROVENANCE_MISMATCH", severity: "error", message: "Renderer provenance or validation policy is not approved." }];
      }
    } catch (error) {
      diagnostics = [{ code: error instanceof CadDomainError ? error.code : "RENDER_FAILED", severity: "error", message: error instanceof CadDomainError ? error.message : "Renderer failed safely." }];
    }
    await this.transaction(async (client) => {
      const updated = await client.query("UPDATE candidates SET state = $1, diagnostics = $2, renderer = $3, validation_policy_version = $4, updated_at = $5 WHERE id = $6 AND project_id = $7 AND state = 'RUNNING' RETURNING id", [nextState, JSON.stringify(diagnostics), renderer ? JSON.stringify(renderer) : null, policy ?? null, this.clock(), input.candidateId, input.projectId]);
      if (!updated.rows[0]) throw new CadDomainError("INVALID_CANDIDATE_STATE", "Candidate validation ownership was lost.");
      if (nextState === "VALID") for (const artifact of artifacts) await client.query("INSERT INTO candidate_artifacts (candidate_id, format, metadata) VALUES ($1,$2,$3)", [input.candidateId, artifact.format, JSON.stringify(artifact)]);
    });
    return (await this.readCandidate(this.options.pool, input.projectId, input.candidateId)).candidate;
  }

  async promoteCandidate(input: { projectId: string; candidateId: string; expectedParentRevision: string | null; signal?: AbortSignal }): Promise<RevisionManifest> {
    if (input.signal?.aborted) throw new CadDomainError("CANCELLED", "Operation cancelled.");
    let staleCurrent: string | null | undefined;
    const manifest = await this.transaction(async (client) => {
      const project = await this.requireProject(client, input.projectId, true);
      const { row, candidate } = await this.readCandidate(client, input.projectId, input.candidateId, true);
      if (candidate.state !== "VALID") throw new CadDomainError("INVALID_CANDIDATE_STATE", "Only a validated candidate can be promoted.");
      if (project.currentRevision !== input.expectedParentRevision || candidate.parentRevision !== input.expectedParentRevision) {
        await client.query("UPDATE candidates SET state = 'SUPERSEDED', updated_at = $1 WHERE id = $2", [this.clock(), input.candidateId]);
        staleCurrent = project.currentRevision;
        return undefined;
      }
      if (!candidate.renderer || candidate.validationPolicyVersion !== this.validationPolicyVersion || candidate.renderer.validationPolicyVersion !== this.validationPolicyVersion || !this.options.acceptRendererProvenance(candidate.renderer)) {
        throw new CadDomainError("PROVENANCE_MISMATCH", "Candidate renderer provenance is missing or mismatched.");
      }
      assertArtifactSet(candidate.artifacts, candidate.sourceHash, candidate.renderer);
      const revisionId = this.createId();
      const createdAt = this.clock();
      await client.query(
        `INSERT INTO revisions (id, project_id, parent_revision_id, source, source_hash, source_bytes, request_id, tool_call_id, candidate_id, validation_policy_version, diagnostics, renderer, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [revisionId, input.projectId, project.currentRevision, row.source, candidate.sourceHash, candidate.sourceBytes, candidate.requestId, candidate.toolCallId, candidate.candidateId, this.validationPolicyVersion, JSON.stringify(candidate.diagnostics), JSON.stringify(candidate.renderer), createdAt],
      );
      for (const artifact of candidate.artifacts) {
        const revisionArtifact = artifactManifestSchema.parse({ ...artifact, sourceRevision: revisionId });
        await client.query("INSERT INTO revision_artifacts (revision_id, format, metadata) VALUES ($1,$2,$3)", [revisionId, artifact.format, JSON.stringify(revisionArtifact)]);
      }
      await client.query("UPDATE projects SET current_revision_id = $1, updated_at = $2 WHERE id = $3", [revisionId, createdAt, input.projectId]);
      await client.query("UPDATE candidates SET state = 'PROMOTED', updated_at = $1 WHERE id = $2", [createdAt, input.candidateId]);
      return (await this.readRevision(client, input.projectId, revisionId)).manifest;
    });
    if (!manifest) throw new CadDomainError("STALE_REVISION", "The current revision changed before promotion.", { current: staleCurrent ?? null });
    return manifest;
  }

  async getExportMetadata(projectId: string, revision: string, format: "3mf"): Promise<{ revision: string; source: string; sourceHash: string; format: "3mf" }> {
    const project = await this.requireProject(this.options.pool, projectId);
    if (!project.currentRevision) throw new CadDomainError("PROJECT_NOT_FOUND", "Project has no current revision.");
    if (project.currentRevision !== revision) throw new CadDomainError("STALE_REVISION", "Exports are available only for the current revision.", { current: project.currentRevision });
    const model = await this.readModelSource(projectId, revision);
    return { ...model, format };
  }

  async restoreRevision(input: { projectId: string; revision: string; requestId: string; toolCallId: string; signal?: AbortSignal }): Promise<RevisionManifest> {
    if (input.signal?.aborted) throw new CadDomainError("CANCELLED", "Operation cancelled.");
    return this.transaction(async (client) => {
      const project = await this.requireProject(client, input.projectId, true);
      if (!project.currentRevision) throw new CadDomainError("PROJECT_NOT_FOUND", "Project has no revision to restore from.");
      const { row: targetRow, manifest: target } = await this.readRevision(client, input.projectId, input.revision, true);
      if (target.validationPolicyVersion !== this.validationPolicyVersion || target.renderer.validationPolicyVersion !== this.validationPolicyVersion || !this.options.acceptRendererProvenance(target.renderer)) {
        throw new CadDomainError("PROVENANCE_MISMATCH", "Historical renderer provenance is not approved.");
      }
      const revisionId = this.createId();
      const createdAt = this.clock();
      await client.query(
        `INSERT INTO revisions (id, project_id, parent_revision_id, restored_from_revision_id, source, source_hash, source_bytes, request_id, tool_call_id, candidate_id, validation_policy_version, diagnostics, renderer, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [revisionId, input.projectId, project.currentRevision, input.revision, targetRow.source, target.sourceHash, target.sourceBytes, input.requestId, input.toolCallId, `restore-${this.createId()}`, this.validationPolicyVersion, JSON.stringify(target.diagnostics), JSON.stringify(target.renderer), createdAt],
      );
      for (const artifact of target.artifacts) {
        const restored = artifactManifestSchema.parse({ ...artifact, sourceRevision: revisionId });
        await client.query("INSERT INTO revision_artifacts (revision_id, format, metadata, object_key) SELECT $1, format, $2, object_key FROM revision_artifacts WHERE revision_id = $3 AND format = $4", [revisionId, JSON.stringify(restored), input.revision, artifact.format]);
      }
      await client.query("UPDATE projects SET current_revision_id = $1, updated_at = $2 WHERE id = $3", [revisionId, createdAt, input.projectId]);
      return (await this.readRevision(client, input.projectId, revisionId)).manifest;
    });
  }
}
