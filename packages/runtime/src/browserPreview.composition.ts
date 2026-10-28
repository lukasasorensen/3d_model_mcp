import type { BrowserPresence } from "@theoryfoundry/contracts";
import {
  BrowserPresenceRepository,
  BrowserPreviewJobsRepository,
} from "@theoryfoundry/model-project";
import { getProjectDatabase } from "./database.composition.js";
import { validatePreviewCompletion } from "./model-preview-service.js";

export async function updateBrowserPreviewPresence(
  ownerId: string,
  projectId: string,
  presence: BrowserPresence,
) {
  const pool = getProjectDatabase().pool;
  await new BrowserPresenceRepository(pool, ownerId).update(
    projectId,
    presence,
  );
  await new BrowserPreviewJobsRepository(pool, ownerId).sweep();
}
export async function claimBrowserPreview(
  ownerId: string,
  projectId: string,
  sessionId: string,
  modes: string[],
) {
  return new BrowserPreviewJobsRepository(
    getProjectDatabase().pool,
    ownerId,
  ).claim(projectId, sessionId, modes);
}
export async function completeBrowserPreview(ownerId: string, raw: unknown) {
  return new BrowserPreviewJobsRepository(
    getProjectDatabase().pool,
    ownerId,
  ).complete(validatePreviewCompletion(raw));
}

export async function browserPreviewStatus(
  ownerId: string,
  projectId: string,
  sessionId: string,
  jobId: string,
  token: string,
) {
  return new BrowserPreviewJobsRepository(
    getProjectDatabase().pool,
    ownerId,
  ).browserStatus(projectId, sessionId, jobId, token);
}
