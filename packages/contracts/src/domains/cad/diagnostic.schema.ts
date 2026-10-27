import * as z from "zod/v4";
import { CAD_LIMITS } from "./cad.constants.js";

export const diagnosticSchema = z
  .object({
    code: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[A-Z][A-Z0-9_]*$/),
    severity: z.enum(["info", "warning", "error"]),
    message: z.string().max(CAD_LIMITS.diagnosticMessageCharacters),
    line: z.number().int().positive().optional(),
    column: z.number().int().positive().optional(),
  })
  .strict();
