import type {
  ArtifactManifest,
  RevisionManifest,
} from "@theoryfoundry/contracts";
import type { StreamArtifact, WorkspaceState } from "../workspaceState.types";
export function artifactKey(
  sourceRevision: string,
  artifactId: string,
): string {
  return `${sourceRevision}:${artifactId}`;
}

export function announceOnce(
  state: WorkspaceState,
  key: string,
  text: string,
): Pick<WorkspaceState, "announcement" | "announcedKeys"> {
  if (state.announcedKeys.includes(key))
    return {
      announcement: state.announcement,
      announcedKeys: state.announcedKeys,
    };
  return {
    announcement: { key, text },
    announcedKeys: [...state.announcedKeys.slice(-63), key],
  };
}

export function revisionLabel(
  revisions: RevisionManifest[],
  revisionId: string | null,
): string {
  if (!revisionId) return "No revision";
  const chronological = [...revisions].reverse();
  const index = chronological.findIndex(
    (revision) => revision.revisionId === revisionId,
  );
  return index >= 0 ? `R${index + 1}` : "Revision";
}

export function artifactFor(
  artifacts: Record<string, ArtifactManifest | StreamArtifact>,
  revisionId: string | null,
  format: "stl" | "3mf",
): ArtifactManifest | StreamArtifact | undefined {
  return Object.values(artifacts).find((artifact) => {
    const sourceRevision =
      "sourceRevision" in artifact
        ? artifact.sourceRevision
        : artifact.revisionId;
    return sourceRevision === revisionId && artifact.format === format;
  });
}

export function validatedArtifactFor(
  artifacts: Record<string, ArtifactManifest | StreamArtifact>,
  revisions: RevisionManifest[],
  revisionId: string | null,
  format: "stl" | "3mf",
): ArtifactManifest | undefined {
  const revision = revisions.find((item) => item.revisionId === revisionId);
  if (!revision) return undefined;
  const artifact = revision.artifacts.find((item) => item.format === format);
  if (
    !artifact ||
    artifact.sourceRevision !== revision.revisionId ||
    artifact.sourceHash !== revision.sourceHash
  )
    return undefined;
  const hydrated =
    artifacts[artifactKey(artifact.sourceRevision, artifact.artifactId)];
  if (!hydrated || !("sourceRevision" in hydrated)) return undefined;
  if (
    hydrated.artifactId !== artifact.artifactId ||
    hydrated.sourceRevision !== artifact.sourceRevision ||
    hydrated.sourceHash !== artifact.sourceHash ||
    hydrated.hash !== artifact.hash ||
    hydrated.format !== artifact.format ||
    hydrated.mimeType !== artifact.mimeType ||
    hydrated.byteSize !== artifact.byteSize
  )
    return undefined;
  return artifact;
}
