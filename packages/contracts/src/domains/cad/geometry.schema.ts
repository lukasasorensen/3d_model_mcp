import * as z from "zod/v4";

export const geometrySummarySchema = z
  .object({
    units: z.literal("mm"),
    triangleCount: z.number().int().positive().max(250000),
    bounds: z
      .object({
        min: z.tuple([
          z.number().finite(),
          z.number().finite(),
          z.number().finite(),
        ]),
        max: z.tuple([
          z.number().finite(),
          z.number().finite(),
          z.number().finite(),
        ]),
      })
      .strict(),
    dimensions: z.tuple([
      z.number().finite().nonnegative(),
      z.number().finite().nonnegative(),
      z.number().finite().nonnegative(),
    ]),
    checks: z.array(
      z.enum(["binary-stl-length", "finite-coordinates", "nonempty-mesh"]),
    ),
    scope: z.literal("geometry-only"),
  })
  .strict();
