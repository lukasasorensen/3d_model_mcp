"use client";
import {
  GripIcon,
  HiddenIcon,
  IconButton,
  VisibleIcon,
} from "../../../../shared/icons/index";
import {
  Panel,
  PanelActions,
  type PanelProps,
} from "../../../../shared/panels/index";
import { useLayerDrag } from "../hooks/useLayerDrag.hook";
import { LayerMenu } from "./layerMenu.component";
import { LayerNameField } from "./layerNameField.component";
import { useRef, useState, type JSX } from "react";
import {
  useObjectLayers,
  type ObjectLayersOptions,
} from "../hooks/useObjectLayers.hook";
import { layerDraft } from "../utils/layerDraft.util";
export function LayersPanel({
  selectedId,
  select,
  floating,
  ...options
}: ObjectLayersOptions & {
  selectedId: string | null;
  select(id: string): void;
  floating?: PanelProps["floating"];
}): JSX.Element {
  const [editing, setEditing] = useState<string | null>(null);
  const state = useObjectLayers(options);
  const summary = useRef<HTMLDivElement>(null);
  const snapshot = state.historical ? state.view : state.base;
  const draft = state.historical ? layerDraft(state.view) : state.draft;
  const disabled =
    options.disabled ||
    state.pending ||
    state.loading ||
    state.historical ||
    state.stale;
  const { list, marker, grip } = useLayerDrag(
    draft.order,
    disabled,
    state.move,
  );
  return (
    <Panel
      title="Layers"
      floating={floating}
      className="editor-layer-panel"
      busy={state.pending}
      dirty={state.dirty}
      error={state.error}
      errorFocusRef={summary}
    >
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
          <button
            type="button"
            disabled={state.pending || state.loading}
            onClick={state.reload}
          >
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
        <p>Layers appear when a model has named objects.</p>
      )}
      <ol
        ref={list}
        className="layers-list"
        aria-label="Objects in layer order"
        data-drop-end={marker?.before === null}
      >
        {draft.order.map((id, index) => {
          const object = snapshot?.state?.objects.find(
            (item) => item.id === id,
          );
          if (!object) return null;
          const file = snapshot?.state?.files.find(
            (item) => item.id === object.fileId,
          );
          const fileHidden = draft.hiddenFiles.includes(object.fileId);
          const visible = !fileHidden && !draft.hidden.includes(id);
          const name = draft.names.get(id) ?? object.name;
          const label = `${name} (${id})`;
          return (
            <li
              key={id}
              data-object-id={id}
              data-selected={selectedId === id}
              data-drop-before={marker?.before === id}
              data-visible={visible}
            >
              <IconButton
                icon={GripIcon}
                className="layer-grip"
                label={`Drag ${label} to reorder`}
                tabIndex={-1}
                disabled={disabled}
                {...grip(id)}
              />
              {editing === id && !disabled ? (
                <LayerNameField
                  initialName={name}
                  onFinish={(value) => {
                    if (value !== undefined) state.rename(id, value);
                    setEditing(null);
                    requestAnimationFrame(() =>
                      list.current
                        ?.querySelector<HTMLButtonElement>(
                          `[data-object-id="${CSS.escape(id)}"] [aria-haspopup="menu"]`,
                        )
                        ?.focus(),
                    );
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="layer-select"
                  aria-pressed={selectedId === id}
                  title={`Object: ${id} · File: ${file?.name} (${object.fileId})`}
                  aria-label={`Select ${label}`}
                  onClick={() => select(id)}
                >
                  {name}
                </button>
              )}
              <IconButton
                icon={visible ? VisibleIcon : HiddenIcon}
                label={`Show ${label}`}
                aria-pressed={visible}
                disabled={disabled || fileHidden}
                onClick={() => state.toggle(id)}
              />
              <LayerMenu
                label={label}
                disabled={disabled}
                first={index === 0}
                last={index === draft.order.length - 1}
                rename={() => setEditing(id)}
                move={(offset) => state.move(id, offset)}
              />
              {fileHidden && (
                <div className="layer-file-warning">
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
      {draft.order.length > 1 && !state.historical && (
        <p className="action-help">Drag to reorder</p>
      )}
      {!state.historical && Boolean(snapshot?.state) && (
        <PanelActions>
          <button
            type="button"
            aria-label="Discard layer changes"
            disabled={
              state.pending ||
              state.loading ||
              (!state.dirty && !state.stale && editing === null)
            }
            onClick={() => {
              setEditing(null);
              state.reset();
            }}
          >
            Discard
          </button>
          <button
            type="button"
            className="editor-apply"
            disabled={
              disabled ||
              !state.dirty ||
              Boolean(state.problem) ||
              editing !== null
            }
            onClick={() => void state.apply()}
          >
            {state.pending ? "Applying layers…" : "Apply layers"}
          </button>
          {state.pending && (
            <button type="button" onClick={state.cancel}>
              Cancel layer update
            </button>
          )}
        </PanelActions>
      )}
      {!state.historical && state.dirty && (
        <p>
          Unapplied layer changes. Apply layers to update the viewport and
          downloads.
        </p>
      )}
      {!state.historical && state.dirty && state.problem && (
        <p role="alert">{state.problem}</p>
      )}
      <p role="status" aria-live="polite">
        {state.message}
      </p>
    </Panel>
  );
}
