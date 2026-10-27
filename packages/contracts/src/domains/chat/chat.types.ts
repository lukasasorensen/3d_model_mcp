import type * as z from "zod/v4";
import { type chatRequestSchema, type chatEventSchema } from "./chat.schema.js";

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export type ChatEvent = z.infer<typeof chatEventSchema>;
