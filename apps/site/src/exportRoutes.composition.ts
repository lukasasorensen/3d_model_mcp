import {
  createModelExportService,
  getProjectDatabase,
  ModelExportsRepository,
} from "@theoryfoundry/runtime";
import { authenticateRequest } from "./authentication.composition";
import {
  exportRoute as createRoute,
  downloadExport as download,
} from "./features/exports/index";
const dependencies = {
  authenticate: authenticateRequest,
  createStore: (ownerId: string): ModelExportsRepository =>
    new ModelExportsRepository(getProjectDatabase().pool, ownerId),
  createExports: (): ReturnType<typeof createModelExportService> =>
    createModelExportService(getProjectDatabase()),
};
export function exportRoute(
  action: "claim" | "complete",
): (
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) => Promise<Response> {
  return createRoute(action, dependencies);
}
export function downloadExport(
  request: Request,
  context: { params: Promise<{ exportId: string }> },
): Promise<Response> {
  return download(request, context, dependencies);
}
