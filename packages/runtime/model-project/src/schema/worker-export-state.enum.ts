import { pgEnum } from "drizzle-orm/pg-core";

export const workerExportState = pgEnum("worker_export_state", ["PENDING", "COMPLETED", "CANCELLED", "FAILED", "EXPIRED"]);
