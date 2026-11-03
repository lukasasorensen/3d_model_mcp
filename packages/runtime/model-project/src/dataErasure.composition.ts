import type { Pool } from "pg";
import {
  DataErasureWorkflow,
  ErasureJournal,
  exportDirectory,
  erasureDirectory,
} from "./infrastructure/index.js";

export function createDataErasure(pool: Pool): DataErasureWorkflow {
  return new DataErasureWorkflow(
    pool,
    new ErasureJournal(
      erasureDirectory(),
      process.env.NODE_ENV === "production",
    ),
    exportDirectory(),
  );
}
