import type * as z from "zod/v4";
import {
  type beginWorkerExportSchema,
  type workerExportCapabilitySchema,
  type completeWorkerExportSchema,
} from "./export.schema.js";
import { type exportMetadataSchema } from "../cad/index.js";
import {
  type workerPreviewSourceInputSchema,
  type workerPreviewSourceSchema,
} from "./previewSource.schema.js";
import {
  type beginWorkerValidationSchema,
  type workerValidationCapabilitySchema,
  type completeWorkerValidationSchema,
} from "./validation.schema.js";

export type BeginWorkerExport = z.infer<typeof beginWorkerExportSchema>;

export type WorkerExportCapability = z.infer<
  typeof workerExportCapabilitySchema
>;

export type CompleteWorkerExport = z.infer<typeof completeWorkerExportSchema>;

export type WorkerExportMetadata = z.infer<typeof exportMetadataSchema>;

export type WorkerPreviewSourceInput = z.infer<
  typeof workerPreviewSourceInputSchema
>;

export type WorkerPreviewSource = z.infer<typeof workerPreviewSourceSchema>;

export type BeginWorkerValidation = z.infer<typeof beginWorkerValidationSchema>;

export type WorkerValidationCapability = z.infer<
  typeof workerValidationCapabilitySchema
>;

export type CompleteWorkerValidation = z.infer<
  typeof completeWorkerValidationSchema
>;
