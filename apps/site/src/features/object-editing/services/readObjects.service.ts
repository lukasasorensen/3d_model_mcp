import {
  getProjectStateOutputSchema,
  readModelSourceOutputSchema,
} from "@theoryfoundry/contracts";
import type { CadMcpClient } from "@theoryfoundry/gateway";
import { assertModelFiles, CadDomainError } from "@theoryfoundry/runtime";
import {
  objectEditingSnapshotSchema,
  type ObjectEditingSnapshot,
} from "../objectEditing.schema";
import { toolFailure } from "../utils/objectFailure.util";

export async function readObjects(
  client: CadMcpClient,
  projectId: string,
  revision: string | undefined,
  signal: AbortSignal,
): Promise<ObjectEditingSnapshot> {
  if (!revision) {
    const result = await client.callTool(
      "get_project_state",
      { projectId },
      { signal },
    );
    if (result.isError) throw toolFailure(result.error);
    revision =
      getProjectStateOutputSchema.parse(result.structuredContent).state
        .currentRevision ?? undefined;
  }
  if (!revision)
    return {
      revision: null,
      sourceHash: null,
      modelFiles: null,
      parameters: [],
    };
  const result = await client.callTool(
    "read_model_source",
    { projectId, revision },
    { signal },
  );
  if (result.isError) throw toolFailure(result.error);
  const { model } = readModelSourceOutputSchema.parse(result.structuredContent);
  if (model.revision !== revision) throw new Error("Revision mismatch");
  // Legacy single-source projects acquire stable identities on their first edit.
  const body = model.modelBody ?? model.source;
  let modelFiles = model.modelFiles;
  let unsupportedReason: string | undefined;
  if (!modelFiles && body) {
    modelFiles = {
      version: 1,
      files: [{ id: "main-file", name: "Main", body }],
      objects: [{ id: "main-object", name: "Main", fileId: "main-file" }],
      composition: { operation: "union", objectIds: ["main-object"] },
    };
    try {
      // Adoption must satisfy the same scope/reference policy as Apply.
      assertModelFiles(modelFiles);
    } catch (error) {
      if (
        !(error instanceof CadDomainError) ||
        ![
          "INVALID_MODEL_FILES",
          "FORBIDDEN_SOURCE_REFERENCE",
          "SOURCE_TOO_LARGE",
        ].includes(error.code)
      )
        throw error;
      modelFiles = undefined;
      const reason =
        typeof error.details.reason === "string"
          ? error.details.reason
          : error.message;
      unsupportedReason =
        `Object editing is unavailable for this legacy model. ${reason.slice(0, 200)} ` +
        "Your saved model, preview and downloads remain available. Use source or AI edits to update it.";
    }
  }
  return objectEditingSnapshotSchema.parse({
    revision,
    sourceHash: model.sourceHash,
    parameters: model.parameters ?? [],
    modelFiles: modelFiles ?? null,
    ...(unsupportedReason ? { unsupportedReason } : {}),
  });
}
