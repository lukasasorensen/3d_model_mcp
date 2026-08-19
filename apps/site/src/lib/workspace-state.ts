import type { ArtifactManifest, ChatEvent, RevisionManifest } from "@rjls/contracts";

export type ToolActivityState = "running" | "success" | "error";
export interface ToolActivityItem {
  toolCallId: string;
  tool: string;
  state: ToolActivityState;
  code?: string;
}
export interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  text: string;
  activity: ToolActivityItem[];
  outcome?: "completed" | "failed" | "cancelled";
}
export interface WorkspaceState {
  hydrated: boolean;
  currentRevision: string | null;
  pendingCurrentRevision: string | null;
  selectedRevision: string | null;
  revisions: RevisionManifest[];
  artifacts: Record<string, ArtifactManifest | StreamArtifact>;
  turns: ChatTurn[];
  active: boolean;
  candidateStatus: "idle" | "created" | "validated" | "rejected" | "promoting";
  notice: string;
  announcement: { key: string; text: string } | null;
  announcedKeys: readonly string[];
}
export interface StreamArtifact {
  artifactId: string;
  revisionId: string;
  format: "stl" | "3mf";
  mimeType: "model/stl" | "model/3mf";
  hash: string;
  byteSize: number;
}

export const initialWorkspaceState: WorkspaceState = {
  hydrated: false,
  currentRevision: null,
  pendingCurrentRevision: null,
  selectedRevision: null,
  revisions: [],
  artifacts: {},
  turns: [],
  active: false,
  candidateStatus: "idle",
  notice: "",
  announcement: null,
  announcedKeys: [],
};

export function artifactKey(sourceRevision: string, artifactId: string): string {
  return `${sourceRevision}:${artifactId}`;
}

function announceOnce(state: WorkspaceState, key: string, text: string): Pick<WorkspaceState, "announcement" | "announcedKeys"> {
  if (state.announcedKeys.includes(key)) return { announcement: state.announcement, announcedKeys: state.announcedKeys };
  return { announcement: { key, text }, announcedKeys: [...state.announcedKeys.slice(-63), key] };
}

export function revisionLabel(revisions: RevisionManifest[], revisionId: string | null): string {
  if (!revisionId) return "No revision";
  const chronological = [...revisions].reverse();
  const index = chronological.findIndex((revision) => revision.revisionId === revisionId);
  return index >= 0 ? `R${index + 1}` : "Revision";
}

export function artifactFor(
  artifacts: Record<string, ArtifactManifest | StreamArtifact>,
  revisionId: string | null,
  format: "stl" | "3mf",
): ArtifactManifest | StreamArtifact | undefined {
  return Object.values(artifacts).find((artifact) => {
    const sourceRevision = "sourceRevision" in artifact ? artifact.sourceRevision : artifact.revisionId;
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
  if (!artifact || artifact.sourceRevision !== revision.revisionId || artifact.sourceHash !== revision.sourceHash) return undefined;
  const hydrated = artifacts[artifactKey(artifact.sourceRevision, artifact.artifactId)];
  if (!hydrated || !("sourceRevision" in hydrated)) return undefined;
  if (
    hydrated.artifactId !== artifact.artifactId || hydrated.sourceRevision !== artifact.sourceRevision ||
    hydrated.sourceHash !== artifact.sourceHash || hydrated.hash !== artifact.hash || hydrated.format !== artifact.format ||
    hydrated.mimeType !== artifact.mimeType || hydrated.byteSize !== artifact.byteSize
  ) return undefined;
  return artifact;
}

export type WorkspaceAction =
  | { type: "hydrate"; revisions: RevisionManifest[]; currentRevision: string | null }
  | { type: "submit"; id: string; text: string }
  | { type: "event"; event: ChatEvent }
  | { type: "local_error"; message: string }
  | { type: "select_revision"; revisionId: string }
  | { type: "restored"; revision: RevisionManifest };

function updateAssistant(state: WorkspaceState, update: (turn: ChatTurn) => ChatTurn): ChatTurn[] {
  const turns = [...state.turns];
  const index = turns.findLastIndex((turn) => turn.role === "assistant" && !turn.outcome);
  if (index >= 0) turns[index] = update(turns[index]);
  return turns;
}

export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  if (action.type === "hydrate") {
    const artifacts = { ...state.artifacts };
    for (const revision of action.revisions) for (const artifact of revision.artifacts) artifacts[artifactKey(artifact.sourceRevision, artifact.artifactId)] = artifact;
    const pendingHydrated = Boolean(state.pendingCurrentRevision && action.currentRevision === state.pendingCurrentRevision && action.revisions.some((revision) => revision.revisionId === state.pendingCurrentRevision));
    const currentChanged = action.currentRevision !== state.currentRevision;
    const currentHydrated = Boolean(action.currentRevision && action.revisions.some((revision) => revision.revisionId === action.currentRevision));
    const externalCurrentHydrated = state.hydrated && currentChanged && currentHydrated;
    const followCurrent = pendingHydrated || !state.selectedRevision || state.selectedRevision === state.currentRevision;
    const stableLabel = (pendingHydrated || externalCurrentHydrated) ? revisionLabel(action.revisions, action.currentRevision) : undefined;
    const announcement = (pendingHydrated || externalCurrentHydrated) && action.currentRevision && stableLabel
      ? announceOnce(state, `revision:${action.currentRevision}:hydrated`, `${stableLabel} is now current.`)
      : { announcement: state.announcement, announcedKeys: state.announcedKeys };
    return {
      ...state,
      hydrated: true,
      revisions: action.revisions,
      currentRevision: action.currentRevision,
      pendingCurrentRevision: pendingHydrated ? null : state.pendingCurrentRevision,
      selectedRevision: followCurrent ? action.currentRevision : state.selectedRevision,
      artifacts,
      ...announcement,
    };
  }
  if (action.type === "submit") {
    return {
      ...state,
      active: true,
      candidateStatus: "idle",
      notice: "",
      turns: [...state.turns, { id: action.id, role: "user", text: action.text, activity: [] }, { id: `${action.id}-assistant`, role: "assistant", text: "", activity: [] }],
    };
  }
  if (action.type === "local_error") return { ...state, active: false, notice: action.message, turns: updateAssistant(state, (turn) => ({ ...turn, outcome: "failed" })) };
  if (action.type === "select_revision") return { ...state, selectedRevision: action.revisionId };
  if (action.type === "restored") {
    const artifacts = { ...state.artifacts };
    for (const artifact of action.revision.artifacts) artifacts[artifactKey(artifact.sourceRevision, artifact.artifactId)] = artifact;
    const announcement = announceOnce(state, `revision:${action.revision.revisionId}`, `${revisionLabel([action.revision, ...state.revisions], action.revision.revisionId)} is now current.`);
    return {
      ...state,
      currentRevision: action.revision.revisionId,
      pendingCurrentRevision: null,
      selectedRevision: action.revision.revisionId,
      revisions: [action.revision, ...state.revisions],
      artifacts,
      ...announcement,
    };
  }

  const event = action.event;
  if (event.type === "assistant_delta") return { ...state, turns: updateAssistant(state, (turn) => ({ ...turn, text: turn.text + event.delta })) };
  if (event.type === "tool_start") {
    return { ...state, turns: updateAssistant(state, (turn) => ({ ...turn, activity: [...turn.activity, { toolCallId: event.toolCallId, tool: event.tool, state: "running" }] })) };
  }
  if (event.type === "tool_result") {
    return { ...state, turns: updateAssistant(state, (turn) => ({ ...turn, activity: turn.activity.map((item) => item.toolCallId === event.toolCallId ? { ...item, state: event.outcome, code: event.code } : item) })) };
  }
  if (event.type === "revision") {
    if (event.status === "candidate_created") return { ...state, candidateStatus: "created" };
    if (event.status === "candidate_validated") return { ...state, candidateStatus: "validated" };
    if (event.status === "candidate_rejected") return { ...state, candidateStatus: "rejected", notice: "The candidate was rejected. The current revision is unchanged." };
    if (event.status === "candidate_promoted" || event.status === "current") {
      const revisionId = event.revisionId ?? state.currentRevision;
      const hydrated = Boolean(revisionId && state.revisions.some((revision) => revision.revisionId === revisionId));
      const announcement = hydrated && revisionId ? announceOnce(state, `revision:${revisionId}:hydrated`, `${revisionLabel(state.revisions, revisionId)} is now current.`) : { announcement: state.announcement, announcedKeys: state.announcedKeys };
      return {
        ...state,
        currentRevision: revisionId,
        pendingCurrentRevision: hydrated ? null : revisionId,
        selectedRevision: hydrated ? revisionId : state.selectedRevision,
        candidateStatus: "idle",
        ...announcement,
      };
    }
  }
  if (event.type === "artifact") {
    const artifact: StreamArtifact = { artifactId: event.artifactId, revisionId: event.revisionId, format: event.format, mimeType: event.mimeType, hash: event.hash, byteSize: event.byteSize };
    return { ...state, artifacts: { ...state.artifacts, [artifactKey(event.revisionId, event.artifactId)]: artifact } };
  }
  if (event.type === "error") return { ...state, notice: event.message };
  if (event.type === "done") {
    const announcement = event.outcome === "completed" ? announceOnce(state, `done:${event.requestId}`, "Assistant response complete.") : { announcement: state.announcement, announcedKeys: state.announcedKeys };
    return { ...state, active: false, ...announcement, turns: updateAssistant(state, (turn) => ({ ...turn, outcome: event.outcome })) };
  }
  return state;
}
