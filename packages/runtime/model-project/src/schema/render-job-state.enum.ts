import { pgEnum } from "drizzle-orm/pg-core";

export const renderJobState = pgEnum("render_job_state", ["PENDING", "COMPLETED", "CANCELLED", "EXPIRED"]);
