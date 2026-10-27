import * as z from "zod/v4";

export const observabilityLevelSchema = z.enum([
  "debug",
  "info",
  "warning",
  "error",
]);

export const observabilityOutcomeSchema = z.enum([
  "started",
  "success",
  "failure",
  "cancelled",
  "unavailable",
]);
