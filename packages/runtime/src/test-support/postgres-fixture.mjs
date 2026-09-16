import { EventEmitter } from "node:events";
import { PostgresProjectNotifications } from "@rjls/model-project";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

/** Real PostgreSQL engine, in-process WASM; transaction clients are serialized like a one-connection pool. */
export async function createPostgresFixture() {
  const database = new PGlite();
  const journal = JSON.parse(await readFile(new URL("../../model-project/drizzle/meta/_journal.json", import.meta.url), "utf8"));
  for (const { tag } of journal.entries) {
    await database.exec(await readFile(new URL(`../../model-project/drizzle/${tag}.sql`, import.meta.url), "utf8"));
  }
  const pool = {
    query: (sql, parameters) => database.query(sql, parameters),
    connect: async () => {
      const client = new EventEmitter();
      let unlisten;
      client.query = async (sql, parameters) => {
        if (sql === "LISTEN rjls_changes") {
          unlisten = await database.listen("rjls_changes", (payload) => client.emit("notification", { channel: "rjls_changes", payload }));
          return { rows: [] };
        }
        return database.query(sql, parameters);
      };
      client.release = () => { void unlisten?.(); };
      return client;
    },
  };
  const notifications = new PostgresProjectNotifications(pool);
  return { database, pool, notifications, close: () => { notifications.close(); return database.close(); } };
}
