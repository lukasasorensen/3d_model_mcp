import {
  browserPreviewStatus,
  claimBrowserPreview,
  completeBrowserPreview,
  updateBrowserPreviewPresence,
  withConfiguredCadRuntime,
} from "@theoryfoundry/runtime";
import { authenticateRequest } from "./authentication.composition";
import { previewRoute as createRoute } from "./lib/preview-routes";
export function previewRoute(
  action: "presence" | "claim" | "complete" | "status",
) {
  return createRoute(action, {
    authenticate: authenticateRequest,
    authorize: (ownerId, projectId) =>
      withConfiguredCadRuntime(ownerId, (runtime) =>
        runtime.repository.getProjectState(projectId),
      ),
    presence: updateBrowserPreviewPresence,
    claim: claimBrowserPreview,
    status: browserPreviewStatus,
    complete: completeBrowserPreview,
  });
}
