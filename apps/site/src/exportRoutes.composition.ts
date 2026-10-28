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
  createStore: (ownerId: string) =>
    new ModelExportsRepository(getProjectDatabase().pool, ownerId),
  createExports: () => createModelExportService(getProjectDatabase()),
};
export function exportRoute(action: "claim" | "complete") {
  return createRoute(action, dependencies);
}
export function downloadExport(
  request: Request,
  context: { params: Promise<{ exportId: string }> },
) {
  return download(request, context, dependencies);
}
