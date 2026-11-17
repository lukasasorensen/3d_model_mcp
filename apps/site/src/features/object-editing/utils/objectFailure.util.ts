import {
  parameterToolErrorSchema,
  type ParameterControlsError,
} from "@theoryfoundry/contracts";

export class ObjectFailure extends Error {
  constructor(readonly failure: ParameterControlsError) {
    super(failure.message);
  }
}

export function objectFailure(error: unknown): ParameterControlsError {
  if (error instanceof ObjectFailure) return error.failure;
  return {
    code: "OBJECT_UPDATE_FAILED",
    message:
      "The update could not be confirmed. Refresh or retry the same draft to check its saved outcome.",
  };
}

export function toolFailure(error: unknown): ObjectFailure {
  const parsed = parameterToolErrorSchema.safeParse(error);
  if (parsed.success) {
    const reason = parsed.data.details?.reason;
    return new ObjectFailure({
      ...parsed.data,
      message: reason
        ? `${parsed.data.message} ${reason}`.slice(0, 500)
        : parsed.data.message,
    });
  }
  const code =
    error && typeof error === "object" && "code" in error
      ? error.code
      : undefined;
  const messages: Record<string, string> = {
    STALE_REVISION:
      "The current revision changed. Review your draft against the latest values.",
    PROJECT_NOT_FOUND: "The project is unavailable.",
    BROWSER_BUSY: "The renderer is busy. Retry when it is available.",
    BROWSER_REQUIRED:
      "Keep this project tab visible and wait for the CAD runtime to be ready, then retry.",
    CANCELLED: "The update was cancelled. Checking the saved revision.",
  };
  return new ObjectFailure(
    typeof code === "string" && messages[code]
      ? { code, message: messages[code]! }
      : {
          code: "OBJECT_UPDATE_FAILED",
          message: "The object update failed. Your draft has been retained.",
        },
  );
}
