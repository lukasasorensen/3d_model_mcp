import type { WorkerPreviewSource } from "@theoryfoundry/contracts";
import {
  CAD_LIMITS,
  workerPreviewSourceInputSchema,
  workerPreviewSourceSchema,
} from "@theoryfoundry/contracts";
import {
  CadDomainError,
  sha256,
  VALIDATION_POLICY_VERSION,
  type ModelProjectStore,
} from "@theoryfoundry/model-project";
import { expectedBrowserProvenance } from "../../browser-rendering/index.js";
type PreviewSources = Pick<
  ModelProjectStore,
  "readModelSource" | "readValidatedCandidateSource"
>;

export class WorkerPreviewSourceService {
  constructor(private readonly sources: PreviewSources) {}

  async resolve(raw: unknown): Promise<WorkerPreviewSource> {
    const input = workerPreviewSourceInputSchema.parse(raw);
    const target = input.candidateId
      ? await this.sources.readValidatedCandidateSource(
          input.projectId,
          input.candidateId,
        )
      : await this.sources.readModelSource(input.projectId, input.revisionId);
    if (Buffer.byteLength(target.source, "utf8") > CAD_LIMITS.sourceBytes) {
      throw new CadDomainError(
        "SOURCE_TOO_LARGE",
        "Preview source exceeds the source byte limit.",
      );
    }
    if (sha256(target.source) !== target.sourceHash) {
      throw new CadDomainError(
        "SOURCE_HASH_MISMATCH",
        "Preview source integrity failed.",
      );
    }
    return workerPreviewSourceSchema.parse({
      version: "1",
      projectId: input.projectId,
      ...("revision" in target
        ? { revisionId: target.revision }
        : { candidateId: target.candidateId }),
      source: target.source,
      sourceHash: target.sourceHash,
      renderer: expectedBrowserProvenance(VALIDATION_POLICY_VERSION),
    });
  }
}
