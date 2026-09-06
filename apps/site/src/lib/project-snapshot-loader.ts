import { projectStateSchema, revisionManifestSchema, type RevisionManifest } from "@rjls/contracts";

export interface ProjectSnapshot {
  currentRevision: string | null;
  revisions: RevisionManifest[];
}

/** Serializes invalidations and never publishes a read superseded while it was in flight. */
export function createProjectSnapshotLoader(projectId: string, hydrate: (snapshot: ProjectSnapshot) => void, request: typeof fetch = fetch) {
  const controller = new AbortController();
  let pending = false;
  let running: Promise<boolean> | undefined;
  async function readUntilCurrent(): Promise<boolean> {
    try {
      while (pending && !controller.signal.aborted) {
        pending = false;
        const response = await request(`/v1/projects/${encodeURIComponent(projectId)}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) return false;
        const raw = await response.json() as { state?: unknown; revisions?: unknown };
        const project = projectStateSchema.safeParse(raw.state);
        if (!project.success || project.data.projectId !== projectId || !Array.isArray(raw.revisions)) return false;
        const revisions = raw.revisions.map((revision) => revisionManifestSchema.safeParse(revision));
        if (revisions.some((revision) => !revision.success)) return false;
        if (!pending && !controller.signal.aborted) hydrate({ currentRevision: project.data.currentRevision, revisions: revisions.map((revision) => revision.data as RevisionManifest) });
      }
      return !controller.signal.aborted;
    } catch { return false; }
    finally { running = undefined; }
  }
  return {
    refresh(): Promise<boolean> {
      if (controller.signal.aborted) return Promise.resolve(false);
      pending = true;
      return running ??= readUntilCurrent();
    },
    close() { controller.abort(); },
  };
}
