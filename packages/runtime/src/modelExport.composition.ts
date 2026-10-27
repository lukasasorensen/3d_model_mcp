import {
  ModelExportsRepository,
  lockExportCapacity,
  recoverWorkerExports,
  type ProjectDatabase,
} from "@theoryfoundry/model-project";
import type { ExportFileStore } from "./export-file-store.js";
import { ModelExportWorkflow } from "./model-export-service.js";
export class ModelExportService {
  private readonly implementation: ModelExportWorkflow;
  constructor(database: ProjectDatabase, files: ExportFileStore) {
    this.implementation = new ModelExportWorkflow(
      database,
      files,
      (ownerId) => new ModelExportsRepository(database.pool, ownerId),
      lockExportCapacity,
      recoverWorkerExports,
    );
  }
  generate: ModelExportWorkflow["generate"] = (...args) =>
    this.implementation.generate(...args);
  complete: ModelExportWorkflow["complete"] = (...args) =>
    this.implementation.complete(...args);
  fail: ModelExportWorkflow["fail"] = (...args) =>
    this.implementation.fail(...args);
  download: ModelExportWorkflow["download"] = (...args) =>
    this.implementation.download(...args);
  cleanup: ModelExportWorkflow["cleanup"] = (...args) =>
    this.implementation.cleanup(...args);
}
