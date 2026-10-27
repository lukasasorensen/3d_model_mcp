import type * as z from "zod/v4";
import { type projectEventSchema } from "./projectEvent.schema.js";

export type ProjectEvent = z.infer<typeof projectEventSchema>;
