import {
  browserPreviewStatus,
  claimBrowserPreview,
  completeBrowserPreview,
  updateBrowserPreviewPresence,
  withConfiguredCadRuntime,
} from "@theoryfoundry/runtime";
import { authenticateRequest } from "./authentication.composition";
import { previewRoute as createRoute } from "./features/model-preview/index";
export function previewRoute(
  action: "presence" | "claim" | "complete" | "status",
): (
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) => Promise<Response> {
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
