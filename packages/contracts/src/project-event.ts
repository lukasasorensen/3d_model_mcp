import { z } from "zod";

export const projectEventSchema = z.object({
  type: z.enum(["ready", "project-updated", "render-jobs-available", "preview-jobs-available"]),
});
export type ProjectEvent = z.infer<typeof projectEventSchema>;
