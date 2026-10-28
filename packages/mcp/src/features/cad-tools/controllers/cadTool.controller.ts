import { CadDomainError } from "@theoryfoundry/model-project";
import type {
  CadToolContext,
  CadToolName,
  CadToolRegistry,
} from "../cadTool.types.js";
export async function invokeCadTool(
  registry: CadToolRegistry,
  name: CadToolName,
  rawInput: unknown,
  context: CadToolContext = {},
): Promise<
  | { ok: true; value: Record<string, unknown> }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        details?: Record<string, unknown>;
      };
    }
> {
  const definition = registry[name];
  const parsed = definition.inputSchema.safeParse(rawInput);
  if (!parsed.success)
    return {
      ok: false,
      error: {
        code: "INVALID_TOOL_INPUT",
        message: "Tool input failed strict schema validation.",
      },
    };
  try {
    const value = await definition.execute(parsed.data, context);
    return {
      ok: true,
      value: definition.outputSchema.parse(value) as Record<string, unknown>,
    };
  } catch (error) {
    if (error instanceof CadDomainError) {
      return {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          details: { ...error.details },
        },
      };
    }
    return {
      ok: false,
      error: { code: "INTERNAL_ERROR", message: "The CAD tool failed safely." },
    };
  }
}
