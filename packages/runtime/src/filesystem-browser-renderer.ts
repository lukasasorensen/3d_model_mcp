import {
  BROWSER_RENDERER,
  browserRenderCompletionSchema,
  localMcpBrowserRenderJobSchema,
  sessionIdSchema,
  type BrowserRenderCompletion,
  type CadRenderer,
  type CandidateRenderRequest,
  type LocalMcpBrowserRenderJob,
  type RenderValidationResult,
} from "@rjls/contracts";
import { randomBytes } from "node:crypto";
import { mkdir, open, readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { expectedBrowserProvenance } from "./browser-renderer.js";

const BRIDGE_DIRECTORY = ".rjls-local-mcp-browser";
const POLL_INTERVAL_MS = 50;

interface ClaimRecord {
  sessionId: string;
  claimedAt: string;
}

function opaqueRandomId(prefix: string): string {
  return `${prefix}-${randomBytes(18).toString("hex")}`;
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

async function exists(path: string): Promise<boolean> {
  try { await readFile(path); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
}

async function writeExclusive(path: string, value: unknown): Promise<void> {
  const handle = await open(path, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function parseClaim(raw: unknown): ClaimRecord {
  if (!raw || typeof raw !== "object") throw new Error("Render job claim is invalid.");
  const value = raw as Record<string, unknown>;
  return {
    sessionId: sessionIdSchema.parse(value.sessionId),
    claimedAt: typeof value.claimedAt === "string" && Number.isFinite(Date.parse(value.claimedAt))
      ? value.claimedAt
      : (() => { throw new Error("Render job claim timestamp is invalid."); })(),
  };
}

async function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new Error("Browser rendering was cancelled.");
  await new Promise<void>((resolve, reject) => {
    const finish = (complete: () => void) => {
      signal?.removeEventListener("abort", abort);
      complete();
    };
    const timer = setTimeout(() => finish(resolve), milliseconds);
    const abort = () => {
      clearTimeout(timer);
      finish(() => reject(new Error("Browser rendering was cancelled.")));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

/**
 * Cross-process renderer used by the standalone stdio MCP server. The server writes
 * bounded jobs; the local Next.js app claims them for its open browser tab.
 */
export class FilesystemBrowserRenderBridge implements CadRenderer {
  private readonly jobsRoot: string;

  constructor(workspaceRoot: string, private readonly validationPolicyVersion: string) {
    this.jobsRoot = join(workspaceRoot, BRIDGE_DIRECTORY, "jobs");
  }

  private jobRoot(jobId: string): string {
    return join(this.jobsRoot, localMcpBrowserRenderJobSchema.shape.jobId.parse(jobId));
  }

  private async readJob(jobId: string): Promise<LocalMcpBrowserRenderJob> {
    const parsed = localMcpBrowserRenderJobSchema.parse(await readJson(join(this.jobRoot(jobId), "request.json")));
    if (parsed.jobId !== jobId) throw new Error("Render job binding failed.");
    return parsed;
  }

  private async readCompletion(job: LocalMcpBrowserRenderJob): Promise<BrowserRenderCompletion | undefined> {
    try {
      const completion = browserRenderCompletionSchema.parse(await readJson(join(this.jobRoot(job.jobId), "completion.json")));
      const claim = parseClaim(await readJson(join(this.jobRoot(job.jobId), "claim.json")));
      if (
        completion.sessionId !== claim.sessionId ||
        completion.token !== job.token ||
        completion.sourceHash !== job.sourceHash ||
        JSON.stringify(completion.provenance) !== JSON.stringify(expectedBrowserProvenance(this.validationPolicyVersion))
      ) throw new Error("Render completion binding failed.");
      return completion;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }

  async validateAndRender(request: CandidateRenderRequest): Promise<RenderValidationResult> {
    await mkdir(this.jobsRoot, { recursive: true });
    const now = new Date();
    const job = localMcpBrowserRenderJobSchema.parse({
      version: "1",
      jobId: opaqueRandomId("local-render"),
      projectId: request.projectId,
      candidateId: request.candidateId,
      token: randomBytes(32).toString("hex"),
      source: request.source,
      sourceHash: request.sourceHash,
      format: "stl",
      createdAt: now.toISOString(),
      deadline: new Date(now.getTime() + BROWSER_RENDERER.timeoutMs).toISOString(),
    });
    const root = this.jobRoot(job.jobId);
    await mkdir(root);
    try {
      await writeExclusive(join(root, "request.json"), job);
      while (Date.now() < Date.parse(job.deadline)) {
        if (request.signal?.aborted) throw new Error("Browser rendering was cancelled.");
        const completion = await this.readCompletion(job);
        if (completion) {
          return {
            outcome: completion.outcome,
            diagnostics: completion.diagnostics,
            provenance: completion.provenance,
            validationPolicyVersion: this.validationPolicyVersion,
            artifacts: [],
          };
        }
        await delay(POLL_INTERVAL_MS, request.signal);
      }
      throw new Error("Browser rendering timed out.");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }

  async claimNext(projectId: string, sessionId: string): Promise<LocalMcpBrowserRenderJob | null> {
    localMcpBrowserRenderJobSchema.shape.projectId.parse(projectId);
    sessionIdSchema.parse(sessionId);
    await mkdir(this.jobsRoot, { recursive: true });
    const entries = (await readdir(this.jobsRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    const jobs: LocalMcpBrowserRenderJob[] = [];
    for (const jobId of entries) {
      const parsedId = localMcpBrowserRenderJobSchema.shape.jobId.safeParse(jobId);
      if (!parsedId.success) continue;
      try { jobs.push(await this.readJob(jobId)); }
      catch { continue; }
    }
    jobs.sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
    for (const job of jobs) {
      const jobId = job.jobId;
      if (Date.now() >= Date.parse(job.deadline)) {
        await rm(this.jobRoot(jobId), { recursive: true, force: true });
        continue;
      }
      if (job.projectId !== projectId) continue;
      if (await exists(join(this.jobRoot(jobId), "completion.json"))) continue;
      const claimPath = join(this.jobRoot(jobId), "claim.json");
      try {
        await writeExclusive(claimPath, { sessionId, claimedAt: new Date().toISOString() });
        return job;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") continue;
        try {
          const claim = parseClaim(await readJson(claimPath));
          if (claim.sessionId === sessionId) return job;
        } catch { continue; }
      }
    }
    return null;
  }

  async complete(jobId: string, raw: unknown): Promise<void> {
    const job = await this.readJob(jobId);
    if (Date.now() >= Date.parse(job.deadline)) throw new Error("Render job expired.");
    const completion = browserRenderCompletionSchema.parse(raw);
    const claim = parseClaim(await readJson(join(this.jobRoot(jobId), "claim.json")));
    if (
      completion.sessionId !== claim.sessionId ||
      completion.token !== job.token ||
      completion.sourceHash !== job.sourceHash ||
      JSON.stringify(completion.provenance) !== JSON.stringify(expectedBrowserProvenance(this.validationPolicyVersion))
    ) throw new Error("Render completion binding failed.");
    await writeExclusive(join(this.jobRoot(jobId), "completion.json"), completion);
  }
}
