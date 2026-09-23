import type { CadWorkflowService } from "@rjls/contracts";
import { RemoteRenderJobsRepository, BrowserPresenceRepository, CadDomainError, ModelExportsRepository, type ModelProjectStore, type ProjectDatabase } from "@rjls/model-project";
import { remoteMcpIdentity } from "./remote-mcp-policy.js";
import { ModelExportService } from "./model-export-service.js";
import { DirectoryExportFileStore } from "./export-file-store.js";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
export function createModelExportService(database: ProjectDatabase) {
    return new ModelExportService(database, new DirectoryExportFileStore(process.env.RJLS_EXPORT_DIRECTORY ? resolve(process.env.RJLS_EXPORT_DIRECTORY) : join(tmpdir(), "rjls-cad-exports", createHash("sha256").update(process.env.DATABASE_URL ?? "local").digest("hex").slice(0, 16))));
}
export class RuntimeCadWorkflowService implements CadWorkflowService {
    constructor(private readonly database: ProjectDatabase, private readonly repository: ModelProjectStore, private readonly ownerId: string, private readonly mode: "local-mcp" | "remote-mcp" | "chat", private readonly origin = remoteMcpIdentity().origin, private readonly exports = createModelExportService(database)) { }
    projectUrl(projectId: string) { return `${this.origin}/projects/${encodeURIComponent(projectId)}`; }
    async inspect(projectId: string) {
        await this.repository.getProjectState(projectId);
        await new RemoteRenderJobsRepository(this.database.pool, this.ownerId, this.mode === "chat" ? "local-mcp" : this.mode).recover();
        const rendererAvailability = await new BrowserPresenceRepository(this.database.pool, this.ownerId).availability(projectId, this.mode);
        const exports = await new ModelExportsRepository(this.database.pool, this.ownerId).list(projectId);
        return { rendererAvailability, exports };
    }
    async requireReady(projectId: string) {
        const { rendererAvailability } = await this.inspect(projectId);
        if (rendererAvailability !== "ready")
            throw new CadDomainError(rendererAvailability === "busy" ? "BROWSER_BUSY" : "BROWSER_REQUIRED", rendererAvailability === "busy" ? "Wait for the existing browser render to finish, then retry." : "Open or focus this project visibly, sign in, then retry the same candidate.", { projectUrl: this.projectUrl(projectId), retryable: true });
    }
    async exportModel(input: Parameters<CadWorkflowService["exportModel"]>[0]) {
        await this.repository.getProjectState(input.projectId);
        const cached = (await new ModelExportsRepository(this.database.pool, this.ownerId).list(input.projectId)).some(e => e.revision === input.revision && e.format === input.format);
        if (!cached)
            await this.requireReady(input.projectId);
        return this.exports.generate(this.ownerId, input, this.mode, this.origin);
    }
}
