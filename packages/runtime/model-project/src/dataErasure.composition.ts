import type { Pool } from "pg";
import {
  DataErasureWorkflow,
  ErasureJournal,
  exportDirectory,
  erasureDirectory,
} from "./infrastructure/index.js";

export function createDataErasure(
  pool: Pool,
  {
    requireManagedJournal = process.env.NODE_ENV === "production",
  }: { requireManagedJournal?: boolean } = {},
): DataErasureWorkflow {
  return new DataErasureWorkflow(
    pool,
    new ErasureJournal(
      erasureDirectory(requireManagedJournal),
      requireManagedJournal,
    ),
    exportDirectory(),
  );
}
