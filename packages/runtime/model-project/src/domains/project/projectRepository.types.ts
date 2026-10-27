import {
  type CadRenderer,
  type RendererProvenance,
} from "@theoryfoundry/contracts";
export interface ModelProjectRepositoryOptions {
  workspaceRoot: string;
  renderer: CadRenderer;
  acceptRendererProvenance: (provenance: RendererProvenance) => boolean;
  clock?: () => Date;
  createId?: () => string;
  validationPolicyVersion?: string;
  lockTimeoutMs?: number;
  lockStaleMs?: number;
  failpoint?: (step: PromotionDurabilityStep) => void | Promise<void>;
}
export type PromotionDurabilityStep =
  | "immutable-artifact-file-durable"
  | "immutable-artifact-directory-durable"
  | "immutable-artifacts-parent-durable"
  | "immutable-artifacts-durable"
  | "revision-source-durable"
  | "revision-manifest-file-durable"
  | "revision-directory-durable"
  | "revision-manifest-durable"
  | "revision-renamed"
  | "versions-directory-durable"
  | "revision-published"
  | "current-temp-durable"
  | "current-renamed"
  | "current-directory-durable"
  | "current-advanced"
  | "model-temp-durable"
  | "model-renamed"
  | "model-directory-durable"
  | "model-materialized";

export interface ProjectWorkflowOptions {
  renderer: CadRenderer;
  acceptRendererProvenance: (value: RendererProvenance) => boolean;
  clock?: () => Date;
  createId?: () => string;
  validationPolicyVersion?: string;
}
