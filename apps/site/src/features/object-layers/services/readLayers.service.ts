import {
  getProjectStateOutputSchema,
  readModelSourceOutputSchema,
  modelFilesPresentation,
} from "@theoryfoundry/contracts";
import type { CadMcpClient } from "@theoryfoundry/gateway";
import {
  objectLayersSnapshotSchema,
  type ObjectLayersSnapshot,
} from "../objectLayers.schema";
import { toolFailure } from "../utils/layerFailure.util";
export async function readLayers(
  client: CadMcpClient,
  projectId: string,
  revision: string | undefined,
  signal: AbortSignal,
): Promise<ObjectLayersSnapshot> {
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
  if (!revision) return { revision: null, sourceHash: null, state: null };
  const result = await client.callTool(
    "read_model_source",
    { projectId, revision },
    { signal },
  );
  if (result.isError) throw toolFailure(result.error);
  const { model } = readModelSourceOutputSchema.parse(result.structuredContent);
  if (model.revision !== revision) throw new Error("Revision mismatch");
  const snapshot = model.modelFiles;
  return objectLayersSnapshotSchema.parse({
    revision,
    sourceHash: model.sourceHash,
    state: snapshot
      ? {
          version: snapshot.version,
          files: snapshot.files.map(({ id, name }) => ({ id, name })),
          objects: snapshot.objects,
          composition: snapshot.composition,
          presentation: modelFilesPresentation(snapshot),
        }
      : null,
  });
}
