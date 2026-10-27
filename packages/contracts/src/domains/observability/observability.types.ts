import type * as z from "zod/v4";
import {
  type observabilityEnvelopeSchema,
  type metricSampleSchema,
} from "./observability.schema.js";

export type ObservabilityEnvelope = z.infer<typeof observabilityEnvelopeSchema>;

export type MetricSample = z.infer<typeof metricSampleSchema>;
