import { type VersionedEnvelope } from "../envelope.types.js";
import { CONTRACT_VERSION } from "../version.constants.js";

export function createEnvelope<TType extends string, TPayload>(
  type: TType,
  payload: TPayload,
): VersionedEnvelope<TType, TPayload> {
  return { version: CONTRACT_VERSION, type, payload };
}
