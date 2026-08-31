import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

/** Real PostgreSQL engine, in-process WASM; transaction clients are serialized like a one-connection pool. */
export async function createPostgresFixture() {
  const database = new PGlite();
  const journal = JSON.parse(await readFile(new URL("../../../model-project/drizzle/meta/_journal.json", import.meta.url), "utf8"));
  for (const { tag } of journal.entries) {
    await database.exec(await readFile(new URL(`../../../model-project/drizzle/${tag}.sql`, import.meta.url), "utf8"));
  }
  const pool = {
    query: (sql, parameters) => database.query(sql, parameters),
    connect: async () => ({ query: (sql, parameters) => database.query(sql, parameters), release() {} }),
  };
  return { database, pool, close: () => database.close() };
}
