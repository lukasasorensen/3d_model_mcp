import { exportDirectory } from "@theoryfoundry/model-project";
import { DirectoryExportFileStore } from "./features/model-export/index.js";
export function createExportFileStore(): DirectoryExportFileStore {
  return new DirectoryExportFileStore(exportDirectory());
}
