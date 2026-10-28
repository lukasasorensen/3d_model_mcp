import type * as z from "zod/v4";
import type {
  headlessRenderInputSchema,
  headlessRenderResultSchema,
} from "./headlessRender.schema.js";
export type HeadlessRenderInput = z.infer<typeof headlessRenderInputSchema>;
export type HeadlessRenderResult = z.infer<typeof headlessRenderResultSchema>;
