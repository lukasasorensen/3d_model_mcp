export type CadDomainErrorCode =
  | "VALIDATION_RUNNING"
  | "EXPORT_CAPACITY"
  | "EXPORT_UNAVAILABLE"
  | "BROWSER_REQUIRED"
  | "BROWSER_BUSY"
  | "PREVIEW_TIMEOUT"
  | "INVALID_PREVIEW"
  | "PROJECT_NOT_FOUND"
  | "REVISION_NOT_FOUND"
  | "CANDIDATE_NOT_FOUND"
  | "ARTIFACT_NOT_FOUND"
  | "INVALID_CANDIDATE_STATE"
  | "STALE_REVISION"
  | "SOURCE_TOO_LARGE"
  | "FORBIDDEN_SOURCE_REFERENCE"
  | "SOURCE_HASH_MISMATCH"
  | "ARTIFACT_HASH_MISMATCH"
  | "ARTIFACT_LIMIT_EXCEEDED"
  | "POLICY_MISMATCH"
  | "PROVENANCE_MISMATCH"
  | "CORRUPT_PROJECT"
  | "RENDER_FAILED"
  | "BROWSER_RENDERER_UNAVAILABLE"
  | "CANCELLED"
  | "LOCK_TIMEOUT";

export class CadDomainError extends Error {
  constructor(
    public readonly code: CadDomainErrorCode,
    message: string,
    public readonly details: Readonly<Record<string, string | number | boolean | null>> = {},
  ) {
    super(message);
    this.name = "CadDomainError";
  }
}
