import type { CadRenderer, RendererProvenance } from "@theoryfoundry/contracts";
import type { Pool } from "pg";
export interface PostgresModelProjectRepositoryOptions {
  pool: Pool;
  ownerId: string;
  renderer: CadRenderer;
  acceptRendererProvenance: (provenance: RendererProvenance) => boolean;
  clock?: () => Date;
  createId?: () => string;
  validationPolicyVersion?: string;
}
