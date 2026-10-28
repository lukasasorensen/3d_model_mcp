import {
  validateAndRenderInputSchema,
  workerValidationLeaseSchema,
  workerValidationStatusSchema,
  completeWorkerValidationSchema,
  type CandidateRecord,
} from "@theoryfoundry/contracts";
import type { ComputeDependencies } from "../compute.port.js";
import {
  verifySource,
  leaseSignal,
  requireBinding,
} from "../utils/sourceBinding.util.js";
import { LocalWorkerError } from "../../../shared/utils/workerError.util.js";
export async function validateLocally(
  raw: unknown,
  dependencies: ComputeDependencies,
  signal: AbortSignal,
): Promise<{ candidate: CandidateRecord }> {
  const input = validateAndRenderInputSchema.parse(raw);
  const { api, renderer } = dependencies;
  const lease = workerValidationLeaseSchema.parse(
    await api.json("validation/begin", { version: "1", ...input }, signal),
  );
  requireBinding(
    lease.projectId === input.projectId &&
      lease.candidateId === input.candidateId,
  );
  const capability = {
    projectId: lease.projectId,
    candidateId: lease.candidateId,
    jobId: lease.jobId,
    token: lease.token,
  };
  let completed = false;
  try {
    const active = leaseSignal(lease.deadline, signal);
    verifySource(
      lease.source,
      lease.sourceHash,
      renderer.provenance,
      renderer.provenance,
    );
    requireBinding(
      lease.validationPolicyVersion ===
        renderer.provenance.validationPolicyVersion,
    );
    const rendered = await renderer.render(
      {
        source: lease.source,
        sourceHash: lease.sourceHash,
        format: "stl",
        view: "isometric",
      },
      active,
    );
    active.throwIfAborted();
    const result = completeWorkerValidationSchema.parse({
      ...capability,
      sourceHash: lease.sourceHash,
      result: {
        outcome: rendered.ok
          ? "VALID"
          : rendered.failureKind === "model"
            ? "REJECTED"
            : "FAILED",
        ...(rendered.ok && rendered.geometry
          ? { geometry: rendered.geometry }
          : {}),
        diagnostics: rendered.diagnostics ?? [],
        provenance: renderer.provenance,
      },
    });
    if (rendered.ok && !rendered.geometry)
      throw new LocalWorkerError(
        "RENDER_FAILED",
        "Local renderer returned no geometry.",
      );
    let status;
    try {
      status = workerValidationStatusSchema.parse(
        await api.json("validation/complete", result, active),
      );
    } catch (error) {
      if (signal.aborted) throw error;
      status = workerValidationStatusSchema.parse(
        await api.json(
          "validation/status",
          capability,
          AbortSignal.timeout(5000),
        ),
      );
      if (status.state !== "COMPLETED") throw error;
    }
    requireBinding(
      status.jobId === lease.jobId &&
        status.state === "COMPLETED" &&
        Boolean(status.candidate),
    );
    requireBinding(
      status.candidate!.projectId === input.projectId &&
        status.candidate!.candidateId === input.candidateId &&
        status.candidate!.sourceHash === lease.sourceHash,
    );
    completed = true;
    if (!rendered.ok && rendered.failureKind !== "model")
      throw new LocalWorkerError(
        "RENDER_FAILED",
        "Local rendering failed; retry the same candidate.",
        { retryable: true },
      );
    return { candidate: status.candidate! };
  } finally {
    if (!completed)
      await api
        .json("validation/cancel", capability, AbortSignal.timeout(5000))
        .catch(() => undefined);
  }
}
