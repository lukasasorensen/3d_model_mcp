import * as z from "zod/v4";

export const candidateStateSchema = z.enum([
  "CREATED",
  "RUNNING",
  "VALID",
  "REJECTED",
  "PROMOTED",
  "SUPERSEDED",
]);
