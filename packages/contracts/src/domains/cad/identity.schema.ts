import * as z from "zod/v4";

/** IDs are opaque workspace keys, never filesystem paths. */
export const opaqueIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, "must be an opaque ID, not a path");

export const projectIdSchema = opaqueIdSchema;

export const revisionIdSchema = opaqueIdSchema;

export const candidateIdSchema = opaqueIdSchema;

export const artifactIdSchema = opaqueIdSchema;

export const sessionIdSchema = opaqueIdSchema;

export const requestIdSchema = opaqueIdSchema;

export const toolCallIdSchema = opaqueIdSchema;
