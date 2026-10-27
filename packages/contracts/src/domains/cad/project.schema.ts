import * as z from "zod/v4";
import { projectIdSchema } from "./identity.schema.js";

export const projectDetailsSchema = z
  .object({
    name: z.string().trim().min(1).max(200).default("Untitled project"),
    description: z.string().max(4000).default(""),
  })
  .strict();

export const projectSummarySchema = projectDetailsSchema
  .extend({
    projectId: projectIdSchema,
    projectUrl: z.string().url().optional(),
  })
  .strict();

export const createProjectInputSchema = z
  .object({
    name: projectDetailsSchema.shape.name.removeDefault(),
    description: projectDetailsSchema.shape.description
      .removeDefault()
      .trim()
      .min(1),
  })
  .strict();

export const updateProjectInputSchema = z
  .object({
    projectId: projectIdSchema,
    name: projectDetailsSchema.shape.name.removeDefault().optional(),
    description: projectDetailsSchema.shape.description
      .removeDefault()
      .trim()
      .min(1)
      .optional(),
  })
  .strict()
  .refine(
    (input) => input.name !== undefined || input.description !== undefined,
    "Provide at least one project detail.",
  );

export const createProjectOutputSchema = z
  .object({ project: projectSummarySchema })
  .strict();

export const updateProjectOutputSchema = createProjectOutputSchema;

export const projectListSchema = z
  .object({ projects: z.array(projectSummarySchema) })
  .strict();
