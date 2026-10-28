import type { CadWorkflowService } from "@theoryfoundry/contracts";
import type {
  BrowserPresenceStore,
  ModelExportsStore,
  RemoteRenderJobs,
} from "@theoryfoundry/model-project";
import {
  CadDomainError,
  type ModelProjectStore,
} from "@theoryfoundry/model-project";
import type { ModelExportOperations } from "../../model-export/index.js";
export class RuntimeCadWorkflow implements CadWorkflowService {
  constructor(
    private readonly repository: ModelProjectStore,
    private readonly ownerId: string,
    private readonly mode: "local-mcp" | "remote-mcp" | "chat",
    private readonly origin: string,
    private readonly exports: ModelExportOperations,
    private readonly jobs: RemoteRenderJobs,
    private readonly presence: BrowserPresenceStore,
    private readonly exportRecords: ModelExportsStore,
  ) {}
  projectUrl(projectId: string): string {
    return `${this.origin}/projects/${encodeURIComponent(projectId)}`;
  }
  async inspect(projectId: string): ReturnType<CadWorkflowService["inspect"]> {
    await this.repository.getProjectState(projectId);
    await this.jobs.recover();
    const rendererAvailability = await this.presence.availability(
      projectId,
      this.mode,
    );
    const exports = await this.exportRecords.list(projectId);
    return { rendererAvailability, exports };
  }
  async requireReady(projectId: string): Promise<void> {
    const { rendererAvailability } = await this.inspect(projectId);
    if (rendererAvailability !== "ready")
      throw new CadDomainError(
        rendererAvailability === "busy" ? "BROWSER_BUSY" : "BROWSER_REQUIRED",
        rendererAvailability === "busy"
          ? "Wait for the existing browser render to finish, then retry."
          : "Open or focus this project visibly, sign in, then retry the same candidate.",
        { projectUrl: this.projectUrl(projectId), retryable: true },
      );
  }
  async exportModel(
    input: Parameters<CadWorkflowService["exportModel"]>[0],
  ): ReturnType<CadWorkflowService["exportModel"]> {
    await this.repository.getProjectState(input.projectId);
    const cached = (await this.exportRecords.list(input.projectId)).some(
      (e) => e.revision === input.revision && e.format === input.format,
    );
    if (!cached) await this.requireReady(input.projectId);
    return this.exports.generate(this.ownerId, input, this.mode, this.origin);
  }
}
