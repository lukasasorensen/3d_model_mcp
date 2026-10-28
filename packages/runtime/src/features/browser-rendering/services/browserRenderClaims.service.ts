import type { RemoteRenderJobs } from "@theoryfoundry/model-project";
import { sha256 } from "@theoryfoundry/model-project";
import { randomBytes } from "node:crypto";
export async function claimMcpBrowserRender(
  jobs: RemoteRenderJobs,
  projectId: string,
  sessionId: string,
  recordClaim: () => void,
): Promise<
  | (NonNullable<Awaited<ReturnType<RemoteRenderJobs["claim"]>>> & {
      token: string;
      purpose: "candidate";
      format: "stl";
    })
  | undefined
> {
  const token = randomBytes(32).toString("hex");
  const job = await jobs.claim(projectId, sessionId, sha256(token));
  if (!job) return undefined;
  recordClaim();
  return {
    ...job,
    token,
    purpose: "candidate" as const,
    format: "stl" as const,
  };
}

export async function claimRemoteBrowserRender(
  jobs: RemoteRenderJobs,
  projectId: string,
  sessionId: string,
  recordClaim: () => void,
): Promise<
  | {
      jobId: string;
      candidateId: string;
      source: string;
      sourceHash: string;
      deadline: string;
      token: string;
      purpose: "candidate";
      format: "stl";
    }
  | undefined
> {
  const job = await claimMcpBrowserRender(
    jobs,
    projectId,
    sessionId,
    recordClaim,
  );
  if (!job) return undefined;
  return {
    jobId: job.jobId,
    candidateId: job.candidateId,
    source: job.source,
    sourceHash: job.sourceHash,
    deadline: job.deadline,
    token: job.token,
    purpose: job.purpose,
    format: job.format,
  };
}
