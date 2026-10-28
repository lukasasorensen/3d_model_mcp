import { createHash } from "node:crypto";
import {
  acceptsWorkerRenderer,
  CAD_LIMITS,
  type RendererProvenance,
} from "@theoryfoundry/contracts";
import { LocalWorkerError } from "../../../shared/utils/workerError.util.js";
export const sha256 = (value: string | Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");
export function verifySource(
  source: string,
  hash: string,
  expected: RendererProvenance,
  actual: RendererProvenance,
): void {
  if (
    Buffer.byteLength(source) > CAD_LIMITS.sourceBytes ||
    sha256(source) !== hash
  )
    throw new LocalWorkerError(
      "SOURCE_INTEGRITY",
      "Hosted source failed integrity or size checks.",
    );
  if (
    !acceptsWorkerRenderer(expected) ||
    !acceptsWorkerRenderer(actual) ||
    Object.entries(expected).some(
      ([key, value]) => actual[key as keyof RendererProvenance] !== value,
    )
  )
    throw new LocalWorkerError(
      "RENDERER_INCOMPATIBLE",
      "Hosted source requires a different renderer or validation policy. Update the worker.",
    );
}
export function leaseSignal(
  deadline: string,
  signal: AbortSignal,
): AbortSignal {
  const remaining = Date.parse(deadline) - Date.now();
  if (!Number.isFinite(remaining) || remaining <= 0 || remaining > 120_000)
    throw new LocalWorkerError(
      "LEASE_EXPIRED",
      "Worker lease is expired or invalid; retry the same operation.",
    );
  return AbortSignal.any([
    signal,
    AbortSignal.timeout(Math.max(1, remaining - 1000)),
  ]);
}
export function requireBinding(valid: boolean): void {
  if (!valid)
    throw new LocalWorkerError(
      "INVALID_HOSTED_RESPONSE",
      "Hosted response does not match the requested project or target.",
    );
}
