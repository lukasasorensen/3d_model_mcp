import * as z from "zod/v4";

export const previewViewSchema = z.enum([
  "isometric",
  "front",
  "back",
  "left",
  "right",
  "top",
  "bottom",
]);
