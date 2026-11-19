"use client";
import {
  useMemo,
  useState,
  type ComponentProps,
  type JSX,
  type KeyboardEvent,
} from "react";
import {
  applyModelFileOperations,
  applyParameterOperations,
  copyModelObject,
  modelFileState,
  pasteModelObject,
  objectTransformSchema,
  type ModelFileOperation,
  type ModelFiles,
  type ModelObjectClipboard,
  type ObjectTransform,
} from "@theoryfoundry/contracts";
import { Button } from "../../../../shared/controls/index";
import { LayersIcon, ParametersIcon } from "../../../../shared/icons/index";
import {
  ObjectEditingView,
  type TransformInput,
} from "../../../object-editing/browser/index";
import {
  layerDraft,
  LayersPanelView,
} from "../../../object-layers/browser/index";
import type {
  WorkingDraftFields,
  WorkingModelView,
} from "../workingDraft.types";
import { WorkingParameters } from "./workingParameters.component";
import { WorkingRevisionActions } from "./workingRevisionActions.component";

export function WorkingEditingControls({
  draft,
  projectId,
  revision,
  previewReady,
  renderViewport,
}: {
  draft: WorkingModelView;
  projectId: string;
  revision: string | null;
  previewReady: boolean;
  renderViewport: ComponentProps<typeof ObjectEditingView>["renderViewport"];
}): JSX.Element {
  const [toolbar, setToolbar] = useState<HTMLDivElement | null>(null);
  const [selection, setSelection] = useState<string | null>(null);
  const [clipboard, setClipboard] = useState<ModelObjectClipboard>();
  const [objectMessage, setObjectMessage] = useState("");
  const files = draft.modelFiles;
  const selectedObject = files?.objects.find(
    (object) => object.id === selection,
  );
  const selectedId = selectedObject?.id ?? null;
  const snapshot = useMemo(
    () =>
      draft.base && {
        ...draft.base.layers,
        state: files && draft.layersAvailable ? modelFileState(files) : null,
      },
    [draft.base, files, draft.layersAvailable],
  );
  const layers = useMemo(() => layerDraft(snapshot), [snapshot]);
  const savedParameters = draft.base?.parameters.parameters;
  const operandOperations = draft.preview?.model.operations;
  const operandParameters = useMemo(
    () =>
      applyParameterOperations(savedParameters ?? [], operandOperations ?? []),
    [savedParameters, operandOperations],
  );

  function select(id: string): boolean {
    if (!canSelect(id)) return false;
    draft.finish();
    setSelection(id || null);
    return true;
  }

  function canSelect(id: string): boolean {
    return !id || Boolean(files?.objects.some((object) => object.id === id));
  }

  function editFiles(
    edit: (modelFiles: ModelFiles) => ModelFiles,
    group?: string,
    finish?: (fields: WorkingDraftFields) => WorkingDraftFields,
  ): boolean {
    if (!files || draft.blocked) return false;
    try {
      const changed = edit(files);
      draft.change(
        (fields) => ({
          ...(finish ? finish(fields) : fields),
          modelFiles: changed,
        }),
        group,
      );
      return true;
    } catch (error) {
      draft.setEditError(
        error instanceof Error ? error.message : "The object edit is invalid.",
      );
      return false;
    }
  }

  function apply(operation: ModelFileOperation, group?: string): void {
    editFiles(
      (modelFiles) => applyModelFileOperations(modelFiles, [operation]),
      group,
    );
  }

  function changeTransform(transform: ObjectTransform): void {
    if (!files || !selectedId || draft.blocked) return;
    const parsed = objectTransformSchema.safeParse(transform);
    if (!parsed.success) return;
    const initial = files;
    draft.change((fields) => {
      const modelFiles = fields.modelFiles ?? initial;
      return {
        ...fields,
        modelFiles: {
          ...modelFiles,
          objects: modelFiles.objects.map((object) =>
            object.id === selectedId
              ? {
                  ...object,
                  transform: parsed.data,
                }
              : object,
          ),
        },
      };
    }, "transform:" + selectedId);
  }

  function changeInput(key: string, input: TransformInput | undefined): void {
    draft.change((fields) => {
      const numeric = { ...fields.numeric };
      if (input) numeric[key] = input;
      else delete numeric[key];
      return { ...fields, numeric };
    }, "transform:" + selectedId);
  }

  function copy(): void {
    if (!files || !selectedId || draft.blocked) return;
    try {
      setClipboard(
        copyModelObject({
          projectId,
          modelFiles: files,
          objectId: selectedId,
          parameters: draft.parameters,
        }),
      );
      setObjectMessage("Object copied within this project.");
    } catch (error) {
      draft.setEditError(
        error instanceof Error
          ? error.message
          : "The object could not be copied.",
      );
    }
  }

  function paste(): void {
    if (!clipboard) return;
    const objectId = crypto.randomUUID();
    const fileId = crypto.randomUUID();
    if (
      editFiles((modelFiles) =>
        pasteModelObject({
          projectId,
          modelFiles,
          objectId,
          fileId,
          clipboard,
          parameters: draft.parameters,
        }),
      )
    ) {
      setSelection(objectId);
      setObjectMessage("Independent object copy added.");
    }
  }

  function shortcuts(event: KeyboardEvent<HTMLElement>): void {
    if (
      event.defaultPrevented ||
      event.repeat ||
      !(event.metaKey || event.ctrlKey) ||
      !(event.target instanceof HTMLElement) ||
      event.target.closest(
        "input, textarea, select, [contenteditable], [role=textbox]",
      )
    )
      return;
    const key = event.key.toLowerCase();
    const redo =
      (event.shiftKey && key === "z") || (!event.metaKey && key === "y");
    if (redo && draft.canRedo) {
      event.preventDefault();
      draft.redo();
    } else if (key === "z" && !event.shiftKey && draft.canUndo) {
      event.preventDefault();
      draft.undo();
    }
  }

  return (
    <div
      className="workspace-editor working-model-editor"
      onKeyDown={shortcuts}
    >
      <ObjectEditingView
        disabled={draft.blocked}
        selectedRevision={revision}
        previewReady={previewReady}
        renderViewport={renderViewport}
        panelToggles={
          <>
            {!draft.dirty && draft.canRedo && (
              <Button className="working-model-redo" onClick={draft.redo}>
                Redo
              </Button>
            )}
            <div className="editor-panel-toggles" ref={setToolbar} />
          </>
        }
        footer={<WorkingRevisionActions draft={draft} />}
        state={{
          snapshot: draft.base?.objects,
          draft: files,
          selectedId,
          selectedObject,
          loading: draft.loading,
          pending: draft.saving,
          historical: draft.historical,
          dirty: draft.dirty,
          stale: draft.stale,
          message: objectMessage,
          error: undefined,
          canUndo: draft.canUndo,
          canRedo: draft.canRedo,
          canPaste: Boolean(clipboard && files),
          canSelect,
          select,
          changeTransform,
          copy,
          paste,
          undo: async () => draft.undo(),
          redo: async () => draft.redo(),
        }}
        live={{
          dragging: draft.dragging,
          inputs: draft.fields.numeric,
          operandParameters,
          changeInput,
          finishInput: draft.finish,
          draggingChanged(active) {
            draft.finish();
            draft.setDragging(active);
          },
          cancelDrag() {
            draft.cancel("transform:" + selectedId);
          },
        }}
        renderPanels={(selection) => (
          <>
            <LayersPanelView
              {...selection}
              disabled={draft.blocked}
              floating={{
                toolbar,
                icon: LayersIcon,
                initiallyOpen: true,
                tuckLeft: true,
              }}
              state={{
                view: snapshot,
                base: snapshot,
                draft: layers,
                loading: draft.loading,
                pending: draft.saving,
                message: "",
                error: undefined,
                historical: draft.historical,
                stale: draft.stale,
                dirty: draft.dirty,
                problem: "",
                rename: (id, name) => apply({ op: "rename_object", id, name }),
                toggle(id) {
                  apply({
                    op: "set_object_visibility",
                    id,
                    visible: layers.hidden.includes(id),
                  });
                },
                showFile(id) {
                  apply({ op: "set_file_visibility", id, visible: true });
                },
                move(id, offset) {
                  const order = [...layers.order];
                  const index = order.indexOf(id);
                  const next = index + offset;
                  if (
                    index < 0 ||
                    next < 0 ||
                    next >= order.length ||
                    next === index
                  )
                    return;
                  order.splice(index, 1);
                  order.splice(next, 0, id);
                  apply({ op: "reorder_objects", ids: order });
                },
              }}
              live={{
                rename: draft.fields.rename,
                editName(id, value) {
                  draft.change(
                    (fields) => ({ ...fields, rename: { id, value } }),
                    "rename:" + id,
                  );
                },
                finishName(id, name) {
                  if (name === undefined) draft.cancelRename(id);
                  else
                    editFiles(
                      (modelFiles) =>
                        applyModelFileOperations(modelFiles, [
                          { op: "rename_object", id, name },
                        ]),
                      "rename:" + id,
                      (fields) => ({ ...fields, rename: undefined }),
                    );
                  draft.finish();
                },
              }}
            />
            <WorkingParameters
              draft={draft}
              floating={{ toolbar, icon: ParametersIcon }}
            />
          </>
        )}
      />
    </div>
  );
}
