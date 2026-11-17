import type {
  ApplyObjectLayers,
  ObjectLayersSnapshot,
} from "../../objectLayers.schema";
export interface LayerDraft {
  order: string[];
  hidden: string[];
  hiddenFiles: string[];
}
export function layerDraft(
  snapshot: ObjectLayersSnapshot | undefined,
): LayerDraft {
  const presentation = snapshot?.state?.presentation;
  return {
    order: [...(presentation?.objectOrder ?? [])],
    hidden: [...(presentation?.hiddenObjectIds ?? [])],
    hiddenFiles: [...(presentation?.hiddenFileIds ?? [])],
  };
}
export function layerOperations(
  snapshot: ObjectLayersSnapshot | undefined,
  draft: LayerDraft,
): ApplyObjectLayers["operations"] {
  if (!snapshot?.state) return [];
  const original = layerDraft(snapshot);
  const operations: ApplyObjectLayers["operations"] = [];
  if (JSON.stringify(original.order) !== JSON.stringify(draft.order))
    operations.push({ op: "reorder_objects", ids: draft.order });
  for (const id of original.order)
    if (original.hidden.includes(id) !== draft.hidden.includes(id))
      operations.push({
        op: "set_object_visibility",
        id,
        visible: !draft.hidden.includes(id),
      });
  for (const file of snapshot.state.files)
    if (
      original.hiddenFiles.includes(file.id) !==
      draft.hiddenFiles.includes(file.id)
    )
      operations.push({
        op: "set_file_visibility",
        id: file.id,
        visible: true,
      });
  return operations;
}
export function layerDraftProblem(
  snapshot: ObjectLayersSnapshot | undefined,
  draft: LayerDraft,
): string {
  const state = snapshot?.state;
  if (!state) return "";
  const visible = (id: string): boolean => {
    const object = state.objects.find((item) => item.id === id);
    return Boolean(
      object &&
      !draft.hidden.includes(id) &&
      !draft.hiddenFiles.includes(object.fileId),
    );
  };
  if (!draft.order.some(visible))
    return "Keep at least one object visible before applying. Empty models cannot be saved.";
  const base = state.composition.objectIds[0];
  if (state.composition.operation === "difference" && base && !visible(base))
    return "Keep the first difference operand visible. Hiding it would change the meaning of the boolean operation.";
  return "";
}
