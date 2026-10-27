import * as z from "zod/v4";

export const projectEventSchema = z.object({
  type: z.enum([
    "ready",
    "project-updated",
    "render-jobs-available",
    "preview-jobs-available",
  ]),
});
