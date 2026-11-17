import {
  parameterToolErrorSchema,
  type ParameterControlsError,
} from "@theoryfoundry/contracts";

export class LayerFailure extends Error {
  constructor(readonly failure: ParameterControlsError) {
    super(failure.message);
  }
}

export function layerFailure(error: unknown): ParameterControlsError {
  if (error instanceof LayerFailure) return error.failure;
  return {
    code: "LAYER_UPDATE_FAILED",
    message:
      "The update could not be confirmed. Refresh or retry the same draft to check its saved outcome.",
  };
}

export function toolFailure(error: unknown): LayerFailure {
  const parsed = parameterToolErrorSchema.safeParse(error);
  if (parsed.success) return new LayerFailure(parsed.data);
  const code =
    error && typeof error === "object" && "code" in error
      ? error.code
      : undefined;
  const messages: Record<string, string> = {
    INVALID_MODEL_FILES:
      "The layer changes cannot produce a valid model. Keep at least one object and the original difference base visible.",
    STALE_REVISION:
      "The current revision changed. Review your draft against the latest values.",
    PROJECT_NOT_FOUND: "The project is unavailable.",
    BROWSER_BUSY: "The renderer is busy. Retry when it is available.",
    BROWSER_REQUIRED:
      "Keep this project tab visible and wait for the CAD runtime to be ready, then retry.",
    CANCELLED: "The update was cancelled. Checking the saved revision.",
  };
  return new LayerFailure(
    typeof code === "string" && messages[code]
      ? { code, message: messages[code]! }
      : {
          code: "LAYER_UPDATE_FAILED",
          message: "The layer update failed. Your draft has been retained.",
        },
  );
}
