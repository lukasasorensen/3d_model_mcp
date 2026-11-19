import { parameterControlsErrorSchema } from "@theoryfoundry/contracts";
import {
  workingPreviewSchema,
  type WorkingModel,
  type PreparedWorkingPreview,
} from "../../workingModel.schema";

export async function prepareWorkingPreview(
  projectId: string,
  model: WorkingModel,
  signal: AbortSignal,
): Promise<PreparedWorkingPreview> {
  const response = await fetch(
    "/v1/projects/" + encodeURIComponent(projectId) + "/draft/preview",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(model),
      signal,
    },
  );
  const raw: unknown = await response.json();
  if (!response.ok) {
    const error = parameterControlsErrorSchema.safeParse(
      raw && typeof raw === "object" && "error" in raw ? raw.error : undefined,
    );
    throw new Error(
      error.success
        ? error.data.message
        : "The draft preview could not be prepared.",
    );
  }
  const preview = workingPreviewSchema.parse(raw);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(preview.source),
  );
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  if (
    preview.parentRevision !== model.parentRevision ||
    preview.sourceHash !== hash
  )
    throw new Error("The draft preview could not be verified.");
  return preview;
}
