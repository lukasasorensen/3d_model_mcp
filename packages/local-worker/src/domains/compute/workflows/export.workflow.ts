import {
  exportModelInputSchema,
  reusedWorkerExportSchema,
  workerExportLeaseSchema,
  workerExportStatusSchema,
  workerExportCapabilitySchema,
  CAD_LIMITS,
  type ExportReceipt,
} from "@theoryfoundry/contracts";
import type { ComputeDependencies } from "../compute.port.js";
import {
  verifySource,
  requireBinding,
  leaseSignal,
  sha256,
} from "../utils/sourceBinding.util.js";
import { LocalWorkerError } from "../../../shared/utils/workerError.util.js";
export async function exportLocally(
  raw: unknown,
  { api, renderer }: ComputeDependencies,
  signal: AbortSignal,
): Promise<{ export: ExportReceipt }> {
  const input = exportModelInputSchema.parse(raw);
  const begin = await api.json(
    "exports/begin",
    {
      version: "1",
      projectId: input.projectId,
      revisionId: input.revision,
      format: input.format,
      previewProfile: "standard",
    },
    signal,
  );
  const reused = reusedWorkerExportSchema.safeParse(begin);
  if (reused.success) {
    const receipt = reused.data.receipt;
    requireBinding(
      receipt.projectId === input.projectId &&
        receipt.revision === input.revision &&
        receipt.format === input.format,
    );
    return { export: receipt };
  }
  const lease = workerExportLeaseSchema.parse(begin);
  requireBinding(
    lease.projectId === input.projectId &&
      lease.revisionId === input.revision &&
      lease.format === input.format,
  );
  const capability = workerExportCapabilitySchema.parse({
    version: "1",
    projectId: lease.projectId,
    revisionId: lease.revisionId,
    format: lease.format,
    jobId: lease.jobId,
    exportId: lease.exportId,
    sourceHash: lease.sourceHash,
    token: lease.token,
  });
  let completed = false;
  try {
    const active = leaseSignal(lease.deadline, signal);
    verifySource(
      lease.source,
      lease.sourceHash,
      lease.renderer,
      renderer.provenance,
    );
    const result = await renderer.render(
      {
        source: lease.source,
        sourceHash: lease.sourceHash,
        format: lease.format,
        view: "isometric",
      },
      active,
    );
    active.throwIfAborted();
    if (!result.ok)
      throw new LocalWorkerError(
        "RENDER_FAILED",
        "Local export failed; retry the same revision.",
      );
    const bytes = Buffer.from(result.encoded, "base64");
    if (
      !bytes.length ||
      bytes.length >
        (lease.format === "stl"
          ? CAD_LIMITS.previewBytes
          : CAD_LIMITS.exportBytes) ||
      bytes.toString("base64") !== result.encoded
    )
      throw new LocalWorkerError(
        "ARTIFACT_LIMIT_EXCEEDED",
        "Local export exceeds its artifact limit.",
      );
    let status;
    try {
      status = workerExportStatusSchema.parse(
        await api.upload(
          {
            ...capability,
            outcome: "COMPLETED",
            provenance: renderer.provenance,
          },
          bytes,
          active,
        ),
      );
    } catch (error) {
      if (signal.aborted) throw error;
      status = workerExportStatusSchema.parse(
        await api.json("exports/status", capability, AbortSignal.timeout(5000)),
      );
      if (status.state !== "COMPLETED") throw error;
    }
    requireBinding(
      status.jobId === lease.jobId &&
        status.exportId === lease.exportId &&
        status.projectId === input.projectId &&
        status.revisionId === input.revision &&
        status.sourceHash === lease.sourceHash &&
        status.format === input.format &&
        status.state === "COMPLETED",
    );
    completed = true;
    const receipt = status.receipt;
    if (!receipt || !status.artifactAvailable)
      throw new LocalWorkerError(
        "EXPORT_UNAVAILABLE",
        "Export completed but its download is no longer available. Request the export again.",
      );
    requireBinding(
      receipt.exportId === lease.exportId &&
        receipt.projectId === input.projectId &&
        receipt.revision === input.revision &&
        receipt.format === input.format &&
        receipt.sourceHash === lease.sourceHash &&
        receipt.hash === sha256(bytes) &&
        receipt.byteSize === bytes.length,
    );
    return { export: receipt };
  } finally {
    if (!completed)
      await api
        .json("exports/cancel", capability, AbortSignal.timeout(5000))
        .catch(() => undefined);
  }
}
