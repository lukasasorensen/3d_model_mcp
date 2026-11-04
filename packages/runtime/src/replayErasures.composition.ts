import {
  createDataErasure,
  createProjectDatabase,
} from "@theoryfoundry/model-project";

import { createExportFileStore } from "./exportFileStore.composition.js";

const database = createProjectDatabase(process.env.DATABASE_URL ?? "");
try {
  await createDataErasure(database.pool, {
    requireManagedJournal: true,
  }).replay();
  if (process.argv.includes("--offline")) {
    const retained = await database.pool.query<{ id: string }>(
      "SELECT id FROM model_exports",
    );
    await createExportFileStore().reconcile(
      new Set(retained.rows.map((row) => row.id)),
      0,
    );
  }
} finally {
  await database.close();
}
