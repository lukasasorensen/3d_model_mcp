import { type CONTRACT_VERSION } from "./version.constants.js";

export type ServiceName =
  "site" | "gateway" | "mcp" | "model-project" | "renderer" | "runtime";

export interface VersionedEnvelope<TType extends string, TPayload> {
  version: typeof CONTRACT_VERSION;
  type: TType;
  payload: TPayload;
}
