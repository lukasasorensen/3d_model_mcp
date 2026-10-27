import * as z from "zod/v4";
import { cadErrorCodeSchema } from "./cadError.enum.js";

export const cadErrorSchema = z
  .object({
    code: cadErrorCodeSchema,
    message: z.string().min(1).max(500),
    details: z
      .record(
        z.string().max(80),
        z.union([
          z.string().max(200),
          z.number().finite(),
          z.boolean(),
          z.null(),
        ]),
      )
      .refine(
        (value) => Object.keys(value).length <= 16,
        "too many error details",
      )
      .optional(),
  })
  .strict();
