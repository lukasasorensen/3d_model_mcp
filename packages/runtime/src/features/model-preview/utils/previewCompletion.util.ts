import { previewCompletionSchema } from "@theoryfoundry/contracts";
import { CadDomainError } from "@theoryfoundry/model-project";
import { expectedBrowserProvenance } from "../../browser-rendering/index.js";
import { validatePreviewPng } from "./previewPng.util.js";
export function validatePreviewCompletion(raw: unknown) {
  const completion = previewCompletionSchema.parse(raw);
  if (
    JSON.stringify(completion.provenance) !==
    JSON.stringify(expectedBrowserProvenance("cad-validation-v1"))
  )
    throw new CadDomainError(
      "PROVENANCE_MISMATCH",
      "Preview renderer provenance mismatch.",
    );
  if (completion.png) validatePreviewPng(completion.png);
  return completion;
}
