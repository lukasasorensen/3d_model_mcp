import type * as z from "zod/v4";
export type CadToolName =
  | "create_project"
  | "update_project"
  | "get_project_state"
  | "read_model_source"
  | "propose_model_source"
  | "validate_and_render"
  | "promote_candidate"
  | "export_model"
  | "list_revisions"
  | "restore_revision";

export interface CadToolContext {
  signal?: AbortSignal;
}

export interface CadToolDefinition<TSchema extends z.ZodType = z.ZodType> {
  title: string;
  description: string;
  inputSchema: TSchema;
  outputSchema: z.ZodType;
  readOnly: boolean;
  execute(
    input: z.infer<TSchema>,
    context: CadToolContext,
  ): Promise<Record<string, unknown>>;
}

export type CadToolRegistry = Record<CadToolName, CadToolDefinition>;
