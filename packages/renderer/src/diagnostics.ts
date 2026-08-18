export type RendererErrorCode = "INTEGRITY_FAILURE" | "RESOURCE_LIMIT" | "INVALID_ARTIFACT";

/** Error type retained by the legacy mesh codecs; it does not represent an executable renderer. */
export class RendererError extends Error {
  constructor(
    public readonly code: RendererErrorCode,
    message: string,
    public readonly details: Readonly<Record<string, string | number | boolean | null>> = {},
  ) {
    super(message);
    this.name = "RendererError";
  }
}
