import {
  candidateRecordSchema,
  projectIdSchema,
  revisionManifestSchema,
} from "@theoryfoundry/contracts";
import { join } from "node:path";
import type { ModelProjectRepositoryOptions } from "../../domains/project/index.js";
export class FileProjectPaths {
  constructor(
    private readonly options: Pick<
      ModelProjectRepositoryOptions,
      "workspaceRoot"
    >,
  ) {}
  projectRoot(projectId: string): string {
    return join(this.options.workspaceRoot, projectIdSchema.parse(projectId));
  }
  controlRoot(projectId: string): string {
    return join(this.projectRoot(projectId), ".theoryfoundry");
  }
  candidateRoot(projectId: string, candidateId: string): string {
    candidateRecordSchema.shape.candidateId.parse(candidateId);
    return join(this.controlRoot(projectId), "candidates", candidateId);
  }
  versionRoot(projectId: string, revisionId: string): string {
    revisionManifestSchema.shape.revisionId.parse(revisionId);
    return join(this.controlRoot(projectId), "versions", revisionId);
  }
}
export function safeJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
