import {
  type CandidateRenderRequest,
  type RenderValidationResult,
} from "./cad.types.js";

/** Implementations validate the exact source hash through the configured rendering boundary. */
export interface CadRenderer {
  validateAndRender(
    request: CandidateRenderRequest,
  ): Promise<RenderValidationResult>;
}
