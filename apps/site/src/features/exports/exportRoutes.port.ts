import type {
  AuthenticatedUser,
  ModelExportOperations,
  ModelExportsStore,
} from "@theoryfoundry/runtime";
export interface ExportRouteDependencies {
  authenticate(request: Request): Promise<AuthenticatedUser | Response>;
  createStore(ownerId: string): Pick<ModelExportsStore, "claim" | "get">;
  createExports(): Pick<
    ModelExportOperations,
    "fail" | "complete" | "download"
  >;
}
