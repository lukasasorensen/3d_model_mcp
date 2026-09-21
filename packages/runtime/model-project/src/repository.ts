import {
  createProjectInputSchema,
  updateProjectInputSchema,
  projectSummarySchema,
  type CreateProjectInput,
  type UpdateProjectInput,
  CAD_LIMITS,
  CONTRACT_VERSION,
  artifactManifestSchema,
  candidateRecordSchema,
  isBrowserRendererProvenance,
  isProductionRendererProvenance,
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
import {
  copyFile,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import * as z from "zod/v4";

import { CadDomainError } from "./cad-domain-error.js";
import { sha256 } from "./hash.js";
import type { ProjectState, ProjectSummary } from "./project-types.js";
import { assertArtifactSet, evaluateRenderResult } from "./render-policy.js";

export const VALIDATION_POLICY_VERSION = "cad-validation-v1";

export { CadDomainError, type CadDomainErrorCode } from "./cad-domain-error.js";
export { sha256 } from "./hash.js";
export type { ProjectState, ProjectSummary } from "./project-types.js";
export { renderValidationResultSchema } from "./render-policy.js";

export type { CadRenderer, CandidateRenderRequest, RenderedArtifact, RenderValidationResult } from "@rjls/contracts";

export interface ModelProjectRepositoryOptions {
  workspaceRoot: string;
  renderer: CadRenderer;
  acceptRendererProvenance: (provenance: RendererProvenance) => boolean;
  clock?: () => Date;
  createId?: () => string;
  validationPolicyVersion?: string;
  lockTimeoutMs?: number;
  lockStaleMs?: number;
  failpoint?: (step: PromotionDurabilityStep) => void | Promise<void>;
}

export type PromotionDurabilityStep =
  | "immutable-artifact-file-durable"
  | "immutable-artifact-directory-durable"
  | "immutable-artifacts-parent-durable"
  | "immutable-artifacts-durable"
  | "revision-source-durable"
  | "revision-manifest-file-durable"
  | "revision-directory-durable"
  | "revision-manifest-durable"
  | "revision-renamed"
  | "versions-directory-durable"
  | "revision-published"
  | "current-temp-durable"
  | "current-renamed"
  | "current-directory-durable"
  | "current-advanced"
  | "model-temp-durable"
  | "model-renamed"
  | "model-directory-durable"
  | "model-materialized";

const includeReferencePattern = /\b(?:include|use)\s*<([^>]+)>/g;
const fileFunctionPattern = /\b(import|surface)\s*\(([^;]*)\)/g;

function safeJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function assertSourcePolicy(source: string): void {
  const byteSize = Buffer.byteLength(source);
  if (byteSize > CAD_LIMITS.sourceBytes) {
    throw new CadDomainError("SOURCE_TOO_LARGE", "Model source exceeds the configured byte limit.", {
      byteSize,
      limit: CAD_LIMITS.sourceBytes,
    });
  }
  includeReferencePattern.lastIndex = 0;
  for (const match of source.matchAll(includeReferencePattern)) {
    const reference = match[1] ?? "";
    if (!reference.startsWith("BOSL2/") || reference.includes("..") || reference.includes("\\")) {
      throw new CadDomainError("FORBIDDEN_SOURCE_REFERENCE", "Model source contains a forbidden external reference.");
    }
  }
  fileFunctionPattern.lastIndex = 0;
  for (const match of source.matchAll(fileFunctionPattern)) {
    const argumentsText = match[2] ?? "";
    const reference = argumentsText.match(/\bfile\s*=\s*["']([^"']+)["']/)?.[1] ?? argumentsText.match(/^\s*["']([^"']+)["']/)?.[1];
    if (reference || /\bfile\s*=/.test(argumentsText) || /^\s*[^,)]/.test(argumentsText)) {
      throw new CadDomainError("FORBIDDEN_SOURCE_REFERENCE", "Model source contains a forbidden external file reference.");
    }
  }
}

async function fsyncDirectory(path: string): Promise<void> {
  const handle = await open(path, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function writeDurable(path: string, contents: string | Uint8Array): Promise<void> {
  const handle = await open(path, "wx");
  try {
    await handle.writeFile(contents);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function writeAtomic(path: string, contents: string | Uint8Array): Promise<void> {
  const temporary = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  await writeDurable(temporary, contents);
  await rename(temporary, path);
  await fsyncDirectory(dirname(path));
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new CadDomainError("CANCELLED", "Operation cancelled."));
      return;
    }
    const cleanup = () => signal?.removeEventListener("abort", onAbort);
    const onAbort = () => {
      clearTimeout(timer);
      cleanup();
      reject(new CadDomainError("CANCELLED", "Operation cancelled."));
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, milliseconds);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export class ModelProjectRepository {
  private readonly clock: () => Date;
  private readonly createId: () => string;
  private readonly validationPolicyVersion: string;
  private readonly lockTimeoutMs: number;
  private readonly lockStaleMs: number;

  constructor(private readonly options: ModelProjectRepositoryOptions) {
    this.clock = options.clock ?? (() => new Date());
    this.createId = options.createId ?? randomUUID;
    this.validationPolicyVersion = options.validationPolicyVersion ?? VALIDATION_POLICY_VERSION;
    this.lockTimeoutMs = options.lockTimeoutMs ?? 5_000;
    this.lockStaleMs = options.lockStaleMs ?? 120_000;
  }

  async createProject(input: CreateProjectInput): Promise<ProjectSummary> {
    const details = createProjectInputSchema.parse(input);
    const projectId = this.createId();
    await this.ensureProject(projectId);
    const project = { projectId, ...details };
    await writeAtomic(join(this.controlRoot(projectId), "project.json"), JSON.stringify(project));
    return project;
  }

  async updateProject(raw: UpdateProjectInput): Promise<ProjectSummary> {
    const { projectId, ...details } = updateProjectInputSchema.parse(raw);
    if (!(await exists(this.projectRoot(projectId)))) throw new CadDomainError("PROJECT_NOT_FOUND", "Project not found.");
    return this.withProjectLock(projectId, "details", async () => {
      const project = projectSummarySchema.parse({ ...await this.readProjectDetails(projectId), ...details });
      await writeAtomic(join(this.controlRoot(projectId), "project.json"), JSON.stringify(project));
      return project;
    });
  }

  private async readProjectDetails(projectId: string): Promise<ProjectSummary> {
    try {
      return projectSummarySchema.parse(JSON.parse(await readFile(join(this.controlRoot(projectId), "project.json"), "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return projectSummarySchema.parse({ projectId });
      throw error;
    }
  }

  private projectRoot(projectId: string): string {
    return join(this.options.workspaceRoot, projectIdSchema.parse(projectId));
  }

  private controlRoot(projectId: string): string {
    return join(this.projectRoot(projectId), ".rjls");
  }

  private candidateRoot(projectId: string, candidateId: string): string {
    candidateRecordSchema.shape.candidateId.parse(candidateId);
    return join(this.controlRoot(projectId), "candidates", candidateId);
  }

  private versionRoot(projectId: string, revisionId: string): string {
    revisionManifestSchema.shape.revisionId.parse(revisionId);
    return join(this.controlRoot(projectId), "versions", revisionId);
  }

  private async ensureProject(projectId: string): Promise<void> {
    const control = this.controlRoot(projectId);
    await mkdir(join(control, "versions"), { recursive: true });
    await mkdir(join(control, "candidates"), { recursive: true });
    await mkdir(join(control, "artifacts"), { recursive: true });
    await mkdir(join(control, "locks"), { recursive: true });
  }

  private async readCurrent(projectId: string): Promise<string | null> {
    const pointer = join(this.controlRoot(projectId), "CURRENT");
    try {
      const revisionId = (await readFile(pointer, "utf8")).trim();
      revisionManifestSchema.shape.revisionId.parse(revisionId);
      const manifest = await this.readManifest(projectId, revisionId);
      await this.reconcilePromotedCandidate(manifest);
      return revisionId;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      if (error instanceof CadDomainError) {
        throw new CadDomainError("CORRUPT_PROJECT", "The authoritative current revision is corrupt or incomplete.");
      }
      throw new CadDomainError("CORRUPT_PROJECT", "The authoritative current revision is corrupt or incomplete.");
    }
  }

  private async readManifest(projectId: string, revisionId: string): Promise<RevisionManifest> {
    try {
      const value: unknown = JSON.parse(await readFile(join(this.versionRoot(projectId, revisionId), "manifest.json"), "utf8"));
      const manifest = revisionManifestSchema.parse(value);
      if (manifest.projectId !== projectId || manifest.revisionId !== revisionId) throw new Error("binding mismatch");
      const source = await readFile(join(this.versionRoot(projectId, revisionId), "model.scad"));
      if (sha256(source) !== manifest.sourceHash || source.byteLength !== manifest.sourceBytes) throw new Error("source mismatch");
      assertArtifactSet(manifest.artifacts, manifest.sourceHash, manifest.renderer, revisionId);
      for (const artifact of manifest.artifacts) {
        const artifactPath = join(this.controlRoot(projectId), "artifacts", artifact.hash, artifact.format === "stl" ? "preview.stl" : "export.3mf");
        const bytes = await readFile(artifactPath);
        if (sha256(bytes) !== artifact.hash || bytes.byteLength !== artifact.byteSize) throw new Error("artifact mismatch");
      }
      return manifest;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new CadDomainError("REVISION_NOT_FOUND", "Revision not found.", { revisionId });
      }
      if (error instanceof CadDomainError) throw error;
      throw new CadDomainError("CORRUPT_PROJECT", "Revision data failed integrity validation.", { revisionId });
    }
  }

  async getCandidate(projectId: string, candidateId: string) { await this.ensureProject(projectId); return this.readCandidate(projectId,candidateId); }

  private async readCandidate(projectId: string, candidateId: string): Promise<CandidateRecord> {
    try {
      const value: unknown = JSON.parse(await readFile(join(this.candidateRoot(projectId, candidateId), "candidate.json"), "utf8"));
      const candidate = candidateRecordSchema.parse(value);
      if (candidate.projectId !== projectId || candidate.candidateId !== candidateId) throw new Error("binding mismatch");
      return candidate;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new CadDomainError("CANDIDATE_NOT_FOUND", "Candidate not found.", { candidateId });
      }
      if (error instanceof CadDomainError) throw error;
      throw new CadDomainError("CORRUPT_PROJECT", "Candidate data failed integrity validation.", { candidateId });
    }
  }

  private async reconcilePromotedCandidate(manifest: RevisionManifest): Promise<void> {
    await this.withProjectLock(manifest.projectId, `candidate-${manifest.candidateId}`, async () => {
      let candidate: CandidateRecord;
      try {
        candidate = await this.readCandidate(manifest.projectId, manifest.candidateId);
      } catch (error) {
        if (error instanceof CadDomainError && error.code === "CANDIDATE_NOT_FOUND" && manifest.candidateId.startsWith("restore-")) return;
        throw error;
      }
      if (candidate.sourceHash !== manifest.sourceHash) {
        throw new CadDomainError("CORRUPT_PROJECT", "Current revision and originating candidate disagree.");
      }
      if (candidate.state === "VALID") {
        await this.updateCandidate(candidate, "PROMOTED");
        return;
      }
      if (candidate.state !== "PROMOTED") {
        throw new CadDomainError("CORRUPT_PROJECT", "Current revision references a candidate in an inconsistent state.");
      }
    });
  }

  private async updateCandidate(candidate: CandidateRecord, nextState: CandidateRecord["state"], patch: Partial<CandidateRecord> = {}): Promise<CandidateRecord> {
    const allowed: Partial<Record<CandidateRecord["state"], CandidateRecord["state"][]>> = {
      CREATED: ["RUNNING"],
      RUNNING: ["VALID", "REJECTED", "CREATED"],
      VALID: ["PROMOTED", "SUPERSEDED"],
    };
    if (!allowed[candidate.state]?.includes(nextState)) {
      throw new CadDomainError("INVALID_CANDIDATE_STATE", `Candidate cannot transition from ${candidate.state} to ${nextState}.`);
    }
    const updated = candidateRecordSchema.parse({ ...candidate, ...patch, state: nextState, updatedAt: this.clock().toISOString() });
    await writeAtomic(join(this.candidateRoot(candidate.projectId, candidate.candidateId), "candidate.json"), safeJson(updated));
    return updated;
  }

  async proposeModelSource(input: {
    projectId: string;
    parentRevision: string | null;
    source: string;
    requestId: string;
    toolCallId: string;
  }): Promise<CandidateRecord> {
    assertSourcePolicy(input.source);
    await this.ensureProject(input.projectId);
    const current = await this.readCurrent(input.projectId);
    if (input.parentRevision !== current) {
      throw new CadDomainError("STALE_REVISION", "Candidate parent is not the current revision.", {
        expected: current,
        received: input.parentRevision,
      });
    }
    if (input.parentRevision) await this.readManifest(input.projectId, input.parentRevision);
    const candidateId = this.createId();
    const root = this.candidateRoot(input.projectId, candidateId);
    await mkdir(root, { recursive: false });
    const sourceBytes = Buffer.byteLength(input.source);
    const now = this.clock().toISOString();
    const candidate = candidateRecordSchema.parse({
      version: CONTRACT_VERSION,
      projectId: input.projectId,
      candidateId,
      parentRevision: input.parentRevision,
      sourceHash: sha256(input.source),
      sourceBytes,
      state: "CREATED",
      createdAt: now,
      updatedAt: now,
      requestId: input.requestId,
      toolCallId: input.toolCallId,
      diagnostics: [],
      artifacts: [],
    });
    await writeDurable(join(root, "model.scad"), input.source);
    await writeDurable(join(root, "candidate.json"), safeJson(candidate));
    await fsyncDirectory(root);
    await fsyncDirectory(dirname(root));
    return candidate;
  }

  async validateAndRender(input: {
    projectId: string;
    candidateId: string;
    previewProfile: "standard";
    signal?: AbortSignal;
  }): Promise<CandidateRecord> {
    candidateRecordSchema.shape.candidateId.parse(input.candidateId);
    const observed = await this.readCandidate(input.projectId, input.candidateId);
    if (observed.state === "RUNNING" && Date.now() - new Date(observed.updatedAt).getTime() < 120_000) throw new CadDomainError("VALIDATION_RUNNING", "Candidate validation is already running.", { attemptId: observed.activeAttemptId ?? "legacy", retryable: true });
    return this.withProjectLock(input.projectId, `candidate-${input.candidateId}`, async () => {
      let candidate = await this.readCandidate(input.projectId, input.candidateId);
      if (candidate.state === "VALID") return candidate;
      if (candidate.state === "RUNNING") {
        if (Date.now() - new Date(candidate.updatedAt).getTime() < 120_000) throw new CadDomainError("VALIDATION_RUNNING", "Candidate validation is already running.", { attemptId: candidate.activeAttemptId ?? "legacy", retryable: true });
        candidate = await this.updateCandidate(candidate, "CREATED", { activeAttemptId: undefined });
      }
      if (candidate.state !== "CREATED") throw new CadDomainError("INVALID_CANDIDATE_STATE", "Only a created candidate can be rendered.");
      const attemptId = `attempt-${randomUUID()}`;
      const attemptPath = join(this.candidateRoot(input.projectId, input.candidateId), `${attemptId}.json`);
      await writeDurable(attemptPath, safeJson({ attemptId, state: "RUNNING", deadline: new Date(Date.now()+120_000).toISOString() }));
      const running = await this.updateCandidate(candidate, "RUNNING", { activeAttemptId: attemptId });
      try {
        const source = await readFile(join(this.candidateRoot(input.projectId, input.candidateId), "model.scad"), "utf8");
        if (sha256(source) !== running.sourceHash) throw new CadDomainError("SOURCE_HASH_MISMATCH", "Candidate source hash mismatch.");
        let rawResult: unknown;
        try {
          rawResult = await this.options.renderer.validateAndRender({
            projectId: input.projectId,
            candidateId: input.candidateId,
            attemptId,
            source,
            sourceHash: running.sourceHash,
            previewProfile: input.previewProfile,
            signal: input.signal,
          });
        } catch (error) {
          if (error instanceof CadDomainError) throw error;
          if (input.signal?.aborted) throw new CadDomainError("CANCELLED", "Rendering was cancelled.");
          throw new CadDomainError("RENDER_FAILED", "Renderer failed safely.");
        }
        if (input.signal?.aborted) throw new CadDomainError("CANCELLED", "Rendering was cancelled.");
        const decision = evaluateRenderResult({
          rawResult,
          sourceHash: running.sourceHash,
          validationPolicyVersion: this.validationPolicyVersion,
          acceptRendererProvenance: this.options.acceptRendererProvenance,
          hashBytes: sha256,
        });
        await writeAtomic(attemptPath, safeJson({ attemptId, state: decision.outcome }));
        if (decision.outcome === "REJECTED") return this.updateCandidate(running, "REJECTED", { activeAttemptId: undefined, diagnostics: decision.diagnostics });
        const manifests = decision.artifacts.map((artifact) => artifact.manifest);
        if (decision.artifacts.length > 0) {
          const artifactsDirectory = join(this.candidateRoot(input.projectId, input.candidateId), "artifacts");
          await mkdir(artifactsDirectory, { recursive: false });
          for (const artifact of decision.artifacts) await writeDurable(join(artifactsDirectory, artifact.filename), artifact.bytes);
          await fsyncDirectory(artifactsDirectory);
          await fsyncDirectory(dirname(artifactsDirectory));
        }
        return this.updateCandidate(running, "VALID", {
          diagnostics: decision.diagnostics,
          activeAttemptId: undefined, geometry: decision.geometry,
          renderer: decision.provenance,
          validationPolicyVersion: decision.validationPolicyVersion,
          artifacts: manifests,
        });
      } catch (error) {
        const latest = await this.readCandidate(input.projectId, input.candidateId);
        if (latest.state !== "RUNNING") throw error;
        const code = error instanceof CadDomainError ? error.code : "RENDER_FAILED";
        const message = error instanceof CadDomainError ? error.message : "Validation failed safely.";
        if (error instanceof CadDomainError && ["SOURCE_HASH_MISMATCH", "ARTIFACT_HASH_MISMATCH", "CORRUPT_PROJECT", "PROVENANCE_MISMATCH", "POLICY_MISMATCH"].includes(error.code)) {
          await writeAtomic(attemptPath, safeJson({ attemptId, state: "REJECTED", code, message }));
          return this.updateCandidate(latest, "REJECTED", { activeAttemptId: undefined, diagnostics: [{code,severity:"error",message}] });
        }
        await writeAtomic(attemptPath, safeJson({ attemptId, state: "FAILED", code, message, details: error instanceof CadDomainError ? error.details : {} }));
        await this.updateCandidate(latest, "CREATED", { activeAttemptId: undefined, diagnostics: [{ code, severity: "error", message }] });
        throw error instanceof CadDomainError ? error : new CadDomainError("RENDER_FAILED", message, { retryable: true });
      }
    }, input.signal);
  }

  private async withProjectLock<T>(projectId: string, lockName: string, operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    await this.ensureProject(projectId);
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(lockName)) throw new CadDomainError("CORRUPT_PROJECT", "Invalid internal lock name.");
    const lock = join(this.controlRoot(projectId), "locks", `${lockName}.lock`);
    const deadline = Date.now() + this.lockTimeoutMs;
    for (;;) {
      if (signal?.aborted) throw new CadDomainError("CANCELLED", "Operation cancelled.");
      try {
        await mkdir(lock);
        try {
          await writeDurable(join(lock, "owner.json"), safeJson({ pid: process.pid, token: randomUUID(), acquiredAt: this.clock().toISOString() }));
          await fsyncDirectory(lock);
          await fsyncDirectory(dirname(lock));
        } catch (ownerWriteError) {
          await rm(lock, { recursive: true, force: true });
          throw ownerWriteError;
        }
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        let stale = false;
        try {
          const owner: unknown = JSON.parse(await readFile(join(lock, "owner.json"), "utf8"));
          const ownerRecord = z.object({ pid: z.number().int().positive(), token: z.string().uuid(), acquiredAt: z.string().datetime({ offset: true }) }).strict().safeParse(owner);
          const lockStat = await stat(lock);
          if (ownerRecord.success) {
            const leaseStart = Math.max(Date.parse(ownerRecord.data.acquiredAt), lockStat.mtimeMs);
            const leaseExpired = Date.now() - leaseStart >= this.lockStaleMs;
            let ownerDead = false;
            try {
              process.kill(ownerRecord.data.pid, 0);
            } catch (killError) {
              ownerDead = (killError as NodeJS.ErrnoException).code === "ESRCH";
            }
            stale = leaseExpired && ownerDead;
          }
        } catch {
          // Missing, partial, or malformed ownership cannot prove the holder is dead.
          // Contenders time out instead of stealing a potentially live lock.
          stale = false;
        }
        if (stale) {
          const abandoned = `${lock}.abandoned.${randomUUID()}`;
          try {
            await rename(lock, abandoned);
            await fsyncDirectory(dirname(lock));
            await rm(abandoned, { recursive: true, force: true });
            continue;
          } catch (recoveryError) {
            if ((recoveryError as NodeJS.ErrnoException).code !== "ENOENT") throw recoveryError;
          }
        }
        if (Date.now() >= deadline) throw new CadDomainError("LOCK_TIMEOUT", "Timed out waiting for the project promotion lock.");
        await delay(10, signal);
      }
    }
    try {
      return await operation();
    } finally {
      await rm(lock, { recursive: true, force: true });
    }
  }

  private async publishRevision(input: {
    projectId: string;
    revisionId: string;
    parentRevision: string | null;
    restoredFrom?: string;
    candidateId: string;
    source: Uint8Array;
    sourceHash: string;
    requestId: string;
    toolCallId: string;
    diagnostics: Diagnostic[];
    geometry?: import("@rjls/contracts").GeometrySummary;
    renderer: RendererProvenance;
    artifacts: CandidateRecord["artifacts"];
  }): Promise<RevisionManifest> {
    const artifacts: ArtifactManifest[] = [];
    for (const artifact of input.artifacts) {
      const candidatePath = join(this.candidateRoot(input.projectId, input.candidateId), "artifacts", artifact.format === "stl" ? "preview.stl" : "export.3mf");
      const bytes = await readFile(candidatePath);
      if (sha256(bytes) !== artifact.hash || bytes.byteLength !== artifact.byteSize || artifact.sourceHash !== input.sourceHash) {
        throw new CadDomainError("ARTIFACT_HASH_MISMATCH", "Candidate artifact failed integrity validation.");
      }
      const immutableDirectory = join(this.controlRoot(input.projectId), "artifacts", artifact.hash);
      await mkdir(immutableDirectory, { recursive: true });
      const immutablePath = join(immutableDirectory, artifact.format === "stl" ? "preview.stl" : "export.3mf");
      if (await exists(immutablePath)) {
        const immutableBytes = await readFile(immutablePath);
        if (immutableBytes.byteLength !== artifact.byteSize || sha256(immutableBytes) !== artifact.hash) {
          throw new CadDomainError("ARTIFACT_HASH_MISMATCH", "Stored immutable artifact failed integrity validation.");
        }
      } else {
        await writeDurable(immutablePath, bytes);
      }
      await this.options.failpoint?.("immutable-artifact-file-durable");
      await fsyncDirectory(immutableDirectory);
      await this.options.failpoint?.("immutable-artifact-directory-durable");
      await fsyncDirectory(dirname(immutableDirectory));
      await this.options.failpoint?.("immutable-artifacts-parent-durable");
      artifacts.push(artifactManifestSchema.parse({ ...artifact, sourceRevision: input.revisionId }));
    }
    await this.options.failpoint?.("immutable-artifacts-durable");
    const manifest = revisionManifestSchema.parse({
      version: CONTRACT_VERSION,
      projectId: input.projectId,
      revisionId: input.revisionId,
      parentRevision: input.parentRevision,
      ...(input.restoredFrom ? { restoredFrom: input.restoredFrom } : {}),
      sourceHash: input.sourceHash,
      sourceBytes: input.source.byteLength,
      createdAt: this.clock().toISOString(),
      requestId: input.requestId,
      toolCallId: input.toolCallId,
      candidateId: input.candidateId,
      validationPolicyVersion: this.validationPolicyVersion,
      validationResult: "VALID",
      diagnostics: input.diagnostics,
      artifacts,
      renderer: input.renderer,
      geometry: input.geometry,
    });
    const versions = join(this.controlRoot(input.projectId), "versions");
    const temporary = join(versions, `.${input.revisionId}.${randomUUID()}.tmp`);
    await mkdir(temporary);
    await writeDurable(join(temporary, "model.scad"), input.source);
    await this.options.failpoint?.("revision-source-durable");
    await writeDurable(join(temporary, "manifest.json"), safeJson(manifest));
    await this.options.failpoint?.("revision-manifest-file-durable");
    await fsyncDirectory(temporary);
    await this.options.failpoint?.("revision-directory-durable");
    await this.options.failpoint?.("revision-manifest-durable");
    await rename(temporary, this.versionRoot(input.projectId, input.revisionId));
    await this.options.failpoint?.("revision-renamed");
    await fsyncDirectory(versions);
    await this.options.failpoint?.("versions-directory-durable");
    await this.options.failpoint?.("revision-published");
    await this.writeAtomicPromotionPointer(join(this.controlRoot(input.projectId), "CURRENT"), `${input.revisionId}\n`, [
      "current-temp-durable",
      "current-renamed",
      "current-directory-durable",
    ]);
    await this.options.failpoint?.("current-advanced");
    await this.writeAtomicPromotionPointer(join(this.projectRoot(input.projectId), "model.scad"), input.source, [
      "model-temp-durable",
      "model-renamed",
      "model-directory-durable",
    ]);
    await this.options.failpoint?.("model-materialized");
    return manifest;
  }

  private async writeAtomicPromotionPointer(
    path: string,
    contents: string | Uint8Array,
    steps: readonly [PromotionDurabilityStep, PromotionDurabilityStep, PromotionDurabilityStep],
  ): Promise<void> {
    const temporary = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
    await writeDurable(temporary, contents);
    await this.options.failpoint?.(steps[0]);
    await rename(temporary, path);
    await this.options.failpoint?.(steps[1]);
    await fsyncDirectory(dirname(path));
    await this.options.failpoint?.(steps[2]);
  }

  async promoteCandidate(input: { projectId: string; candidateId: string; expectedParentRevision: string | null; signal?: AbortSignal }): Promise<RevisionManifest> {
    return this.withProjectLock(input.projectId, "promotion", async () => {
      const candidate = await this.readCandidate(input.projectId, input.candidateId);
      if (candidate.state !== "VALID") throw new CadDomainError("INVALID_CANDIDATE_STATE", "Only a validated candidate can be promoted.");
      const current = await this.readCurrent(input.projectId);
      if (current !== input.expectedParentRevision || candidate.parentRevision !== input.expectedParentRevision) {
        await this.updateCandidate(candidate, "SUPERSEDED");
        throw new CadDomainError("STALE_REVISION", "The current revision changed before promotion.", { current });
      }
      const source = await readFile(join(this.candidateRoot(input.projectId, input.candidateId), "model.scad"));
      if (sha256(source) !== candidate.sourceHash || source.byteLength !== candidate.sourceBytes) throw new CadDomainError("SOURCE_HASH_MISMATCH", "Candidate source failed integrity validation.");
      if (candidate.validationPolicyVersion !== this.validationPolicyVersion) throw new CadDomainError("POLICY_MISMATCH", "Candidate validation policy does not match.");
      if (!candidate.renderer || candidate.renderer.validationPolicyVersion !== this.validationPolicyVersion) throw new CadDomainError("PROVENANCE_MISMATCH", "Candidate renderer provenance is missing or mismatched.");
      if ((!isProductionRendererProvenance(candidate.renderer) && !isBrowserRendererProvenance(candidate.renderer)) || !this.options.acceptRendererProvenance(candidate.renderer)) {
        throw new CadDomainError("PROVENANCE_MISMATCH", "Candidate renderer provenance is not approved.");
      }
      assertArtifactSet(candidate.artifacts, candidate.sourceHash, candidate.renderer);
      const revisionId = this.createId();
      const manifest = await this.publishRevision({
        projectId: input.projectId,
        revisionId,
        parentRevision: current,
        candidateId: candidate.candidateId,
        source,
        sourceHash: candidate.sourceHash,
        requestId: candidate.requestId,
        toolCallId: candidate.toolCallId,
        diagnostics: candidate.diagnostics,
        renderer: candidate.renderer,
        geometry: candidate.geometry,
        artifacts: candidate.artifacts,
      });
      await this.reconcilePromotedCandidate(manifest);
      return manifest;
    }, input.signal);
  }

  async getProjectState(projectId: string): Promise<ProjectState> {
    const root = this.projectRoot(projectId);
    if (!(await exists(root))) return { projectId, currentRevision: null, source: null, artifacts: [], diagnostics: [] };
    const currentRevision = await this.readCurrent(projectId);
    if (!currentRevision) return { projectId, currentRevision: null, source: null, artifacts: [], diagnostics: [] };
    const manifest = await this.readManifest(projectId, currentRevision);
    const authoritativeSource = await readFile(join(this.versionRoot(projectId, currentRevision), "model.scad"));
    const materialized = join(root, "model.scad");
    if (!(await exists(materialized)) || sha256(await readFile(materialized)) !== manifest.sourceHash) await writeAtomic(materialized, authoritativeSource);
    return {
      projectId,
      currentRevision,
      source: { hash: manifest.sourceHash, byteSize: manifest.sourceBytes },
      artifacts: manifest.artifacts,
      diagnostics: manifest.diagnostics,
    };
  }

  async listProjects(): Promise<ProjectSummary[]> {
    let entries;
    try {
      entries = await readdir(this.options.workspaceRoot, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    return Promise.all(entries
      .filter((entry) => entry.isDirectory() && projectIdSchema.safeParse(entry.name).success)
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((entry) => this.readProjectDetails(entry.name)));
  }

  async readValidatedCandidateSource(projectId: string, candidateId: string) {
    const candidate = await this.readCandidate(projectId, candidateId);
    if (candidate.state !== "VALID") throw new CadDomainError("INVALID_CANDIDATE_STATE", "Validate the candidate before requesting a preview.");
    const source = await readFile(join(this.candidateRoot(projectId, candidateId), "model.scad"), "utf8");
    if (sha256(source) !== candidate.sourceHash) throw new CadDomainError("SOURCE_HASH_MISMATCH", "Candidate source failed integrity validation.");
    return { candidateId, source, sourceHash: candidate.sourceHash };
  }

  async readModelSource(projectId: string, revision?: string): Promise<{ revision: string; source: string; sourceHash: string }> {
    const selected = revision ?? (await this.readCurrent(projectId));
    if (!selected) throw new CadDomainError("PROJECT_NOT_FOUND", "Project has no current revision.");
    const manifest = await this.readManifest(projectId, selected);
    return { revision: selected, source: await readFile(join(this.versionRoot(projectId, selected), "model.scad"), "utf8"), sourceHash: manifest.sourceHash };
  }

  async listRevisions(projectId: string): Promise<RevisionManifest[]> {
    const current = await this.readCurrent(projectId);
    if (!current) return [];
    const revisions: RevisionManifest[] = [];
    let cursor: string | null = current;
    const seen = new Set<string>();
    while (cursor) {
      if (seen.has(cursor)) throw new CadDomainError("CORRUPT_PROJECT", "Revision history contains a cycle.");
      seen.add(cursor);
      const manifest = await this.readManifest(projectId, cursor);
      revisions.push(manifest);
      cursor = manifest.parentRevision;
    }
    return revisions;
  }

  async getExportMetadata(projectId: string, revision: string, format: "3mf"): Promise<{ revision: string; source: string; sourceHash: string; format: "3mf" }> {
    const current = await this.readCurrent(projectId);
    if (!current) throw new CadDomainError("PROJECT_NOT_FOUND", "Project has no current revision.");
    if (revision !== current) throw new CadDomainError("STALE_REVISION", "Exports are available only for the current revision.", { current });
    const manifest = await this.readManifest(projectId, revision);
    const source = await readFile(join(this.versionRoot(projectId, revision), "model.scad"), "utf8");
    if (sha256(source) !== manifest.sourceHash) throw new CadDomainError("SOURCE_HASH_MISMATCH", "Revision source failed integrity validation.");
    return { revision, source, sourceHash: manifest.sourceHash, format };
  }

  async readArtifact(
    projectId: string,
    revision: string,
    artifactId: string,
  ): Promise<{ manifest: ArtifactManifest; bytes: Uint8Array }> {
    const revisionManifest = await this.readManifest(projectId, revision);
    const manifest = revisionManifest.artifacts.find((item) => item.artifactId === artifactId);
    if (!manifest) throw new CadDomainError("ARTIFACT_NOT_FOUND", "Requested artifact is not available for this revision.");
    if (manifest.format === "3mf") {
      const current = await this.readCurrent(projectId);
      if (revision !== current) throw new CadDomainError("STALE_REVISION", "3MF downloads are available only for the current revision.", { current });
    }
    const filename = manifest.format === "stl" ? "preview.stl" : "export.3mf";
    const bytes = await readFile(join(this.controlRoot(projectId), "artifacts", manifest.hash, filename));
    if (bytes.byteLength !== manifest.byteSize || sha256(bytes) !== manifest.hash) {
      throw new CadDomainError("ARTIFACT_HASH_MISMATCH", "Stored artifact failed integrity validation.");
    }
    return { manifest, bytes };
  }

  async restoreRevision(input: { projectId: string; revision: string; requestId: string; toolCallId: string; signal?: AbortSignal }): Promise<RevisionManifest> {
    return this.withProjectLock(input.projectId, "promotion", async () => {
      const current = await this.readCurrent(input.projectId);
      if (!current) throw new CadDomainError("PROJECT_NOT_FOUND", "Project has no revision to restore from.");
      const target = await this.readManifest(input.projectId, input.revision);
      if (target.validationPolicyVersion !== this.validationPolicyVersion || target.renderer.validationPolicyVersion !== this.validationPolicyVersion) {
        throw new CadDomainError("POLICY_MISMATCH", "Historical revision does not match the active validation policy.");
      }
      if ((!isProductionRendererProvenance(target.renderer) && !isBrowserRendererProvenance(target.renderer)) || !this.options.acceptRendererProvenance(target.renderer)) {
        throw new CadDomainError("PROVENANCE_MISMATCH", "Historical renderer provenance is not approved.");
      }
      const source = await readFile(join(this.versionRoot(input.projectId, input.revision), "model.scad"));
      const candidateId = `restore-${this.createId()}`;
      const candidateRoot = this.candidateRoot(input.projectId, candidateId);
      await mkdir(join(candidateRoot, "artifacts"), { recursive: true });
      await writeDurable(join(candidateRoot, "model.scad"), source);
      for (const artifact of target.artifacts) {
        const sourcePath = join(this.controlRoot(input.projectId), "artifacts", artifact.hash, artifact.format === "stl" ? "preview.stl" : "export.3mf");
        await copyFile(sourcePath, join(candidateRoot, "artifacts", artifact.format === "stl" ? "preview.stl" : "export.3mf"));
      }
      const revisionId = this.createId();
      return this.publishRevision({
        projectId: input.projectId,
        revisionId,
        parentRevision: current,
        restoredFrom: input.revision,
        candidateId,
        source,
        sourceHash: target.sourceHash,
        requestId: input.requestId,
        toolCallId: input.toolCallId,
        diagnostics: target.diagnostics,
        renderer: target.renderer,
      geometry: target.geometry,
        artifacts: target.artifacts.map(({ sourceRevision, ...artifact }) => {
          void sourceRevision;
          return artifact;
        }),
      });
    }, input.signal);
  }
}
