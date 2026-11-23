import type { WorkingDraftFields } from "../workingDraft.types";

const HISTORY_LIMIT = 30;
export interface WorkingHistory {
  fields?: WorkingDraftFields | undefined;
  past: WorkingDraftFields[];
  future: WorkingDraftFields[];
  group?: string | undefined;
}

type HistoryAction =
  | { type: "load"; fields?: WorkingDraftFields | undefined }
  | {
      type: "edit";
      initial: WorkingDraftFields;
      update(fields: WorkingDraftFields): WorkingDraftFields;
      group?: string | undefined;
    }
  | { type: "cancel"; group?: string | undefined }
  | { type: "cancel_rename"; id: string }
  | { type: "finish" | "undo" | "redo" };

export const emptyWorkingHistory: WorkingHistory = { past: [], future: [] };

export function workingHistoryReducer(
  state: WorkingHistory,
  action: HistoryAction,
): WorkingHistory {
  switch (action.type) {
    case "load":
      return { fields: action.fields, past: [], future: [] };
    case "finish":
      return state.group ? { ...state, group: undefined } : state;
    case "cancel": {
      const previous = state.past.at(-1);
      return state.group &&
        (!action.group || action.group === state.group) &&
        previous
        ? { fields: previous, past: state.past.slice(0, -1), future: [] }
        : state;
    }
    case "cancel_rename": {
      if (state.fields?.rename?.id !== action.id) return state;
      const previous = state.past.at(-1);
      if (state.group === "rename:" + action.id && previous && !previous.rename)
        return { fields: previous, past: state.past.slice(0, -1), future: [] };
      return { ...state, fields: { ...state.fields, rename: undefined } };
    }
    case "undo": {
      const previous = state.past.at(-1);
      if (!previous || !state.fields) return state;
      return {
        fields: previous,
        past: state.past.slice(0, -1),
        future: [state.fields, ...state.future],
      };
    }
    case "redo": {
      const next = state.future[0];
      if (!next || !state.fields) return state;
      return {
        fields: next,
        past: [...state.past, state.fields],
        future: state.future.slice(1),
      };
    }
    case "edit": {
      const previous = state.fields ?? action.initial;
      const fields = action.update(previous);
      if (fields === previous) return state;
      const merge = action.group !== undefined && action.group === state.group;
      const past = merge
        ? state.past
        : [...state.past, previous].slice(-HISTORY_LIMIT);
      return { fields, past, future: [], group: action.group };
    }
  }
}
