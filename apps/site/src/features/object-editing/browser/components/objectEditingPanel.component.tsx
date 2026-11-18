"use client";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type JSX,
  type ReactNode,
  type KeyboardEvent,
} from "react";
import {
  objectTransform,
  visibleModelObjectIds,
} from "@theoryfoundry/contracts";
import {
  useObjectEditing,
  type ObjectEditingOptions,
} from "../hooks/useObjectEditing.hook";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { TransformControlsMode } from "three/addons/controls/TransformControls.js";
import { useObjectPreview } from "../hooks/useObjectPreview.hook";
import { objectPreviewSources } from "../utils/objectDraft.util";
import { transformedObjectDimensions } from "../utils/objectGeometry.util";
import { ObjectTransformScene } from "./objectTransformScene.component";
import { ObjectTransformEditor } from "./objectTransformEditor.component";

interface ObjectEditingPanelProps extends ObjectEditingOptions {
  previewReady: boolean;
  renderViewport(options: {
    renderEditingScene?: (orbit: OrbitControls) => ReactNode;
    showAccepted: boolean;
  }): ReactNode;
  panelToggles?: ReactNode;
  renderPanels?(selection: {
    selectedId: string | null;
    canSelect(id: string): boolean;
    select(id: string): void;
  }): ReactNode;
}

export function ObjectEditingPanel({
  previewReady,
  renderViewport,
  panelToggles,
  renderPanels,
  ...options
}: ObjectEditingPanelProps): JSX.Element {
  const state = useObjectEditing(options);
  const headingId = useId();
  const selectorId = useId();
  const errorRef = useRef<HTMLDivElement>(null);
  const [valid, setValid] = useState(true);
  const [mode, setMode] = useState<TransformControlsMode>("translate");
  const [dragError, setDragError] = useState<string>();
  const [fitRequest, setFitRequest] = useState<{ id: string }>();
  const [editorReset, setEditorReset] = useState(0);
  const transform = useMemo(
    () =>
      state.selectedObject ? objectTransform(state.selectedObject) : undefined,
    [state.selectedObject],
  );
  useEffect(() => {
    if (state.error) errorRef.current?.focus();
  }, [state.error]);
  const disabled =
    options.disabled ||
    state.pending ||
    state.loading ||
    state.historical ||
    state.stale ||
    !state.snapshot?.revision;
  const files = state.draft?.files;
  const parametersSnapshot = state.snapshot?.parameters;
  const acceptedFiles = state.snapshot?.modelFiles;
  const hiddenFileIds = useMemo(() => {
    if (!acceptedFiles) return new Set<string>();
    const visible = new Set(visibleModelObjectIds(acceptedFiles));
    const displayedFiles = new Set(
      acceptedFiles.objects
        .filter((object) => visible.has(object.id))
        .map((object) => object.fileId),
    );
    return new Set(
      acceptedFiles.files
        .filter((file) => !displayedFiles.has(file.id))
        .map((file) => file.id),
    );
  }, [acceptedFiles]);
  const sources = useMemo(
    () =>
      files && parametersSnapshot
        ? objectPreviewSources(
            files.filter((file) => !hiddenFileIds.has(file.id)),
            parametersSnapshot,
          )
        : undefined,
    [files, hiddenFileIds, parametersSnapshot],
  );
  const currentScene =
    !state.historical && !state.stale && Boolean(options.selectedRevision);
  const objects = useMemo(() => {
    if (!state.draft) return [];
    const ids = new Set(visibleModelObjectIds(state.draft));
    return state.draft.objects.filter((object) => ids.has(object.id));
  }, [state.draft]);
  const { meshes, error: previewError } = useObjectPreview(
    sources,
    objects,
    currentScene && previewReady,
  );
  const selectedVisible = objects.find(
    (object) => object.id === state.selectedId,
  );
  const showOperands = Boolean(meshes && (selectedVisible || state.dirty));

  const selectedGeometry =
    selectedVisible && meshes?.get(selectedVisible.fileId);
  const dimensions = useMemo(
    () =>
      selectedGeometry && transform
        ? transformedObjectDimensions(selectedGeometry, transform)
        : undefined,
    [selectedGeometry, transform],
  );

  function select(id: string): void {
    if (!state.select(id)) return;
    setValid(true);
    setDragError(undefined);
  }

  function shortcuts(event: KeyboardEvent<HTMLElement>): void {
    if (
      disabled ||
      !valid ||
      event.defaultPrevented ||
      event.repeat ||
      !(event.metaKey || event.ctrlKey) ||
      event.altKey ||
      event.nativeEvent.isComposing ||
      !(event.target instanceof HTMLElement) ||
      event.target.isContentEditable ||
      !event.target.closest(
        ".editor-viewport, .editor-tool-panel, .editor-feedback",
      ) ||
      event.target.closest(
        "input, textarea, select, [role=textbox], .parameter-panel",
      )
    )
      return;
    const key = event.key.toLowerCase();
    let action: (() => void | Promise<void>) | undefined;
    if (event.shiftKey) {
      if (key === "z" && state.canRedo) action = state.redo;
    } else if (key === "c" && state.selectedObject) {
      action = state.copy;
    } else if (key === "v" && state.canPaste) {
      action = state.paste;
    } else if (key === "z" && state.canUndo) {
      action = state.undo;
    } else if (key === "y" && !event.metaKey && state.canRedo) {
      action = state.redo;
    }
    if (action) {
      event.preventDefault();
      void action();
    }
  }

  return (
    <section
      className="editor-stage"
      aria-labelledby={headingId}
      onKeyDown={shortcuts}
    >
      <h2 className="sr-only" id={headingId}>
        Edit objects
      </h2>
      <div className="editor-heading-bar">
        {state.draft && !state.historical && (
          <div className="editor-object-selector">
            <label htmlFor={selectorId}>Selected object</label>
            <select
              id={selectorId}
              value={state.selectedId ?? ""}
              disabled={disabled}
              onChange={(event) => select(event.target.value)}
            >
              <option value="">Choose an object</option>
              {state.draft.objects.map((object) => (
                <option key={object.id} value={object.id}>
                  {object.name} · {object.id}
                </option>
              ))}
            </select>
          </div>
        )}
        {panelToggles}
      </div>
      {(state.selectedObject || state.dirty) && !state.historical && (
        <div
          className="editor-tool-panel"
          role="group"
          aria-label="Object editing tools"
        >
          {state.selectedObject && transform && (
            <ObjectTransformEditor
              key={`${state.selectedId}:${state.snapshot?.revision}:${editorReset}`}
              objectName={state.selectedObject.name}
              transform={transform}
              mode={mode}
              setMode={setMode}
              onChange={state.changeTransform}
              disabled={disabled}
              onValidityChange={setValid}
            />
          )}
          <div className="parameter-actions">
            <button
              type="button"
              disabled={!selectedGeometry}
              onClick={() => {
                if (state.selectedId) setFitRequest({ id: state.selectedId });
              }}
            >
              Fit selected object
            </button>
            <button
              type="button"
              disabled={
                state.loading || state.pending || (!state.dirty && valid)
              }
              onClick={() => {
                state.cancel();
                setEditorReset((value) => value + 1);
                setDragError(undefined);
                setValid(true);
              }}
            >
              Cancel object changes
            </button>
            <button
              type="button"
              className="editor-apply"
              disabled={disabled || !state.dirty || !valid}
              onClick={() => void state.apply()}
            >
              {state.pending ? "Applying…" : "Apply object changes"}
            </button>
          </div>
        </div>
      )}
      <div className="editor-content">
        <div className="editor-viewport">
          {renderViewport({
            showAccepted: !showOperands,
            ...(meshes && {
              renderEditingScene: (orbit: OrbitControls) => (
                <ObjectTransformScene
                  meshes={meshes}
                  objects={objects}
                  selectedId={state.selectedId}
                  showOperands={showOperands}
                  mode={mode}
                  disabled={disabled}
                  orbit={orbit}
                  fitRequest={fitRequest}
                  onSelect={select}
                  onChange={state.changeTransform}
                  onError={setDragError}
                />
              ),
            }),
          })}
        </div>
        {renderPanels?.({
          selectedId: state.selectedId,
          canSelect: state.canSelect,
          select,
        })}
      </div>
      <div className="editor-feedback" aria-busy={state.pending}>
        {state.selectedObject && currentScene && (
          <p className="action-help">
            {!selectedVisible
              ? "This object is hidden in Layers. You can still edit its exact transform."
              : previewError
                ? `Object preview unavailable. Use the exact fields to edit. ${previewError}`
                : showOperands && state.draft?.composition.operation !== "union"
                  ? "Editing individual operands. Apply to validate the boolean result."
                  : !meshes && previewReady
                    ? "Loading object geometry…"
                    : ""}
          </p>
        )}
        {dimensions && (
          <p className="editor-object-bounds">
            Object bounds · X {dimensions[0].toFixed(3)} mm · Y{" "}
            {dimensions[1].toFixed(3)} mm · Z {dimensions[2].toFixed(3)} mm
          </p>
        )}
        {dragError && (
          <p className="notice notice-error" role="alert">
            {dragError}
          </p>
        )}
        {state.dirty && !state.pending && !state.historical && (
          <p>Unapplied object changes</p>
        )}
        <p role="status" aria-live="polite">
          {state.message}
        </p>
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
            its outcome, or discard your draft and reload objects before
            editing.
          </p>
        )}
        {!state.loading && !state.draft && (
          <p role="status">
            {state.snapshot?.unsupportedReason ??
              "No editable objects are available yet."}
          </p>
        )}
      </div>
    </section>
  );
}
