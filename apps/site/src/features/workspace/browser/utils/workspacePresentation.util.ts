import type { PreviewLoadState } from "../../../model-preview/browser/index";
const activeObjectUrls = new Set<string>();

export function newOpaqueId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function releaseObjectUrl(objectUrl: string): void {
  if (!activeObjectUrls.delete(objectUrl)) return;
  URL.revokeObjectURL(objectUrl);
}

export function trackObjectUrl(objectUrl: string): string {
  activeObjectUrls.add(objectUrl);
  return objectUrl;
}

export function shouldRestoreComposerFocus(
  wasActive: boolean,
  active: boolean,
  available: boolean,
): boolean {
  return wasActive && !active && available;
}

export function readinessFromProbe(
  response: Pick<Response, "ok">,
): "ready" | "unavailable" {
  return response.ok ? "ready" : "unavailable";
}

export function previewStatusLabel(
  hasPreview: boolean,
  loadState: PreviewLoadState,
):
  | "Preview validated"
  | "Verifying preview"
  | "Preview unavailable"
  | "Blank project" {
  if (!hasPreview) return "Blank project";
  if (loadState === "ready") return "Preview validated";
  if (loadState === "loading") return "Verifying preview";
  return "Preview unavailable";
}

export function promotionStatusLabel(
  selectedLabel: string,
  hasSelectedRevision: boolean,
): string {
  return hasSelectedRevision
    ? `Updating—showing last-known-valid ${selectedLabel} until the promoted revision is verified for display.`
    : "Promoting the first validated revision. The viewer remains empty until it is verified for display.";
}
