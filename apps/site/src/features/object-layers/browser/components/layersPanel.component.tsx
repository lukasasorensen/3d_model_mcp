"use client";
import { useEffect, useRef, type JSX } from "react";
import {
  useObjectLayers,
  type ObjectLayersOptions,
} from "../hooks/useObjectLayers.hook";
import { layerDraft } from "../utils/layerDraft.util";
export function LayersPanel(options: ObjectLayersOptions): JSX.Element {
  const state = useObjectLayers(options);
  const summary = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.error) summary.current?.focus();
  }, [state.error]);
  const snapshot = state.historical ? state.view : state.base;
  const draft = state.historical ? layerDraft(state.view) : state.draft;
  const disabled =
    options.disabled ||
    state.pending ||
    state.loading ||
    state.historical ||
    state.stale;
  const selected = snapshot?.state?.objects.find(
    (object) => object.id === state.selected,
  );
  return (
    <section
      className="layers-panel"
      aria-labelledby="layers-heading"
      aria-busy={state.pending}
    >
      <h2 id="layers-heading">Layers</h2>
      <p className="action-help">
        Select an object to inspect its name and source file. Selection does not
        change visibility. Layer order organizes this list; boolean operand
        order stays unchanged.
      </p>
      <p className="action-help">
        Apply validates and saves visibility and order. Preview and downloads
        use saved visibility; hidden objects are excluded. Keep at least one
        object and the first difference operand visible.
      </p>
      {state.loading && <p role="status">Loading layers…</p>}
      {state.error && (
        <div
          ref={summary}
          tabIndex={-1}
          role="alert"
          className="notice notice-error"
        >
          <p>{state.error.message}</p>
          {state.retryOutcome && (
            <button
              type="button"
              disabled={state.pending || options.disabled || state.loading}
              onClick={() => void state.apply(true)}
            >
              Retry interrupted layer update
            </button>
          )}
          <button type="button" disabled={state.pending} onClick={state.reload}>
            Refresh saved layers
          </button>
        </div>
      )}
      {state.historical && (
        <p>
          Historical layers are read-only. Return to the current revision to
          edit.
        </p>
      )}
      {state.stale && !state.historical && (
        <p role="status">
          The current revision changed. Your draft is retained; discard it to
          load the latest saved layers.
        </p>
      )}
      {!state.loading && !snapshot?.state && (
        <p>
          No named objects are available. Ask AI to create a model with named
          files and objects.
        </p>
      )}
      {selected && (
        <p className="layer-selection" role="status">
          Selected: {selected.name} · Object ID: {selected.id} ·{" "}
          {draft.hidden.includes(selected.id) ||
          draft.hiddenFiles.includes(selected.fileId)
            ? "Hidden"
            : "Visible"}
          . Selection applies to this panel.
        </p>
      )}
      <ol className="layers-list" aria-label="Objects in layer order">
        {draft.order.map((id, index) => {
          const object = snapshot?.state?.objects.find(
            (item) => item.id === id,
          );
          if (!object) return null;
          const file = snapshot?.state?.files.find(
            (item) => item.id === object.fileId,
          );
          const fileHidden = draft.hiddenFiles.includes(object.fileId);
          const hidden = draft.hidden.includes(id);
          return (
            <li
              key={id}
              data-object-id={id}
              data-selected={state.selected === id}
            >
              <button
                type="button"
                className="layer-select"
                aria-pressed={state.selected === id}
                aria-label={`Select ${object.name} (${id})`}
                onClick={() => state.select(id)}
              >
                <strong>{object.name}</strong>
                <span>Object: {id}</span>
                <span>
                  File: {file?.name} ({object.fileId})
                </span>
              </button>
              <span className="layer-visibility">
                {fileHidden ? "Hidden by file" : hidden ? "Hidden" : "Visible"}
                {state.selected === id ? " · Selected" : ""}
              </span>
              <div className="layer-actions">
                <label>
                  <input
                    type="checkbox"
                    checked={!hidden && !fileHidden}
                    disabled={disabled || fileHidden}
                    aria-label={`Show ${object.name} (${id})`}
                    onChange={() => state.toggle(id)}
                  />
                  Show
                </label>
                <button
                  type="button"
                  disabled={disabled || index === 0}
                  aria-label={`Move ${object.name} (${id}) up`}
                  onClick={() => state.move(id, -1)}
                >
                  Move up
                </button>
                <button
                  type="button"
                  disabled={disabled || index === draft.order.length - 1}
                  aria-label={`Move ${object.name} (${id}) down`}
                  onClick={() => state.move(id, 1)}
                >
                  Move down
                </button>
              </div>
              {fileHidden && (
                <div>
                  <small>
                    Its source file is hidden. Showing the file enables all its
                    objects; individually hidden objects stay hidden.
                  </small>
                  <button
                    type="button"
                    disabled={disabled}
                    aria-label={`Show source file ${file?.name} for ${object.name} (${id})`}
                    onClick={() => state.showFile(object.fileId)}
                  >
                    Show source file
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {!state.historical && Boolean(snapshot?.state) && (
        <div className="layer-actions">
          <button
            type="button"
            disabled={disabled || !state.dirty || Boolean(state.problem)}
            onClick={() => void state.apply()}
          >
            {state.pending ? "Applying layers…" : "Apply layers"}
          </button>
          <button
            type="button"
            disabled={
              state.pending || state.loading || (!state.dirty && !state.stale)
            }
            onClick={state.reset}
          >
            Discard layer changes
          </button>
          {state.pending && (
            <button type="button" onClick={state.cancel}>
              Cancel layer update
            </button>
          )}
        </div>
      )}
      {!state.historical && state.dirty && (
        <p>
          Unapplied layer changes. The preview and downloads still use saved
          layers.
        </p>
      )}
      {!state.historical && state.dirty && state.problem && (
        <p role="alert">{state.problem}</p>
      )}
      <p role="status" aria-live="polite">
        {state.message}
      </p>
    </section>
  );
}
