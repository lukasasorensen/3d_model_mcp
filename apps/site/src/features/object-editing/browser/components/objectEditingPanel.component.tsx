"use client";
import { Panel, PanelActions } from "../../../../shared/panels/index";
import { useId, useMemo, useRef, useState, type JSX } from "react";
import { objectTransform } from "@theoryfoundry/contracts";
import {
  useObjectEditing,
  type ObjectEditingOptions,
} from "../hooks/useObjectEditing.hook";
import { ObjectTransformEditor } from "./objectTransformEditor.component";

export function ObjectEditingPanel(options: ObjectEditingOptions): JSX.Element {
  const state = useObjectEditing(options);
  const selectorId = useId();
  const errorRef = useRef<HTMLDivElement>(null);
  const [valid, setValid] = useState(true);
  const [editorReset, setEditorReset] = useState(0);
  const transform = useMemo(
    () =>
      state.selectedObject ? objectTransform(state.selectedObject) : undefined,
    [state.selectedObject],
  );
  const disabled =
    options.disabled ||
    state.pending ||
    state.loading ||
    state.historical ||
    state.stale ||
    !state.snapshot?.revision;
  return (
    <Panel
      title="Edit objects"
      busy={state.pending}
      dirty={state.dirty || !valid}
      error={state.error}
      errorFocusRef={errorRef}
      description={
        <>
          {!state.snapshot?.unsupportedReason && (
            <p>
              Select an object to move, rotate, resize, or copy it. Apply
              validates and saves a new revision. Downloads use the accepted
              model.
            </p>
          )}
        </>
      }
    >
      {state.loading && <p role="status">Loading objects…</p>}
      {state.error && (
        <div
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="notice notice-error"
        >
          <p>{state.error}</p>
        </div>
      )}
      {state.retryOutcome && (
        <button
          type="button"
          disabled={
            state.pending ||
            state.loading ||
            options.disabled ||
            state.historical
          }
          onClick={() => void state.retry()}
        >
          Retry saved outcome
        </button>
      )}
      {(state.error || state.stale) && (
        <button type="button" disabled={state.pending} onClick={state.reload}>
          Discard draft and reload objects
        </button>
      )}
      {state.historical && (
        <p>Return to the current revision to edit objects.</p>
      )}
      {state.stale && (
        <p role="status">
          The accepted revision changed. Retry an interrupted save to confirm
          its outcome, or discard your draft and reload objects before editing.
        </p>
      )}
      {!state.loading && !state.draft && (
        <p role="status">
          {state.snapshot?.unsupportedReason ??
            "No editable objects are available yet."}
        </p>
      )}
      {state.draft && (
        <>
          <p className="action-help">
            {state.draft.composition.operation === "difference"
              ? "Difference composition: pasted objects become subtracting operands."
              : state.draft.composition.operation === "intersection"
                ? "Intersection composition: pasted objects restrict the shared volume."
                : "Union composition: pasted objects add to the model."}
          </p>
          <label htmlFor={selectorId}>Selected object</label>
          <select
            id={selectorId}
            value={state.selectedId ?? ""}
            disabled={disabled}
            onChange={(event) => {
              state.select(event.target.value);
              setValid(true);
            }}
          >
            <option value="">Choose an object</option>
            {state.draft.objects.map((object) => (
              <option key={object.id} value={object.id}>
                {object.name} · {object.id}
              </option>
            ))}
          </select>
          {state.selectedObject && state.selectedSource && transform && (
            <ObjectTransformEditor
              key={`${state.selectedId}:${state.snapshot?.revision}:${editorReset}`}
              objectName={state.selectedObject.name}
              source={state.selectedSource}
              transform={transform}
              onChange={state.changeTransform}
              disabled={disabled}
              onValidityChange={setValid}
            />
          )}
          <PanelActions>
            <button
              type="button"
              disabled={disabled || !state.selectedObject || !valid}
              onClick={state.copy}
            >
              Copy object
            </button>
            <button
              type="button"
              disabled={disabled || !state.canPaste || !valid}
              onClick={state.paste}
            >
              Paste object
            </button>
            <button
              type="button"
              disabled={disabled || !state.dirty || !valid}
              onClick={() => void state.apply()}
            >
              {state.pending ? "Applying…" : "Apply object changes"}
            </button>
            <button
              type="button"
              disabled={
                state.loading || state.pending || (!state.dirty && valid)
              }
              onClick={() => {
                state.cancel();
                setEditorReset((value) => value + 1);
                setValid(true);
              }}
            >
              Cancel object changes
            </button>
            <button
              type="button"
              disabled={disabled || state.dirty || !state.canUndo || !valid}
              onClick={() => void state.undo()}
            >
              Undo object edit
            </button>
            <button
              type="button"
              disabled={disabled || state.dirty || !state.canRedo || !valid}
              onClick={() => void state.redo()}
            >
              Redo object edit
            </button>
          </PanelActions>
          {state.dirty && !state.pending && <p>Unapplied object changes</p>}
        </>
      )}
      <p role="status" aria-live="polite">
        {state.message}
      </p>
    </Panel>
  );
}
