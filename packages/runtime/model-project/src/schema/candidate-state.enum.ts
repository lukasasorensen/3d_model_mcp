import { pgEnum } from "drizzle-orm/pg-core";

export const candidateState = pgEnum("candidate_state", ["CREATED", "RUNNING", "VALID", "REJECTED", "PROMOTED", "SUPERSEDED"]);
