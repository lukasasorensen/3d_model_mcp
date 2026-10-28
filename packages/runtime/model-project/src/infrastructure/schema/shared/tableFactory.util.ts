import type { PgTable } from "drizzle-orm/pg-core";

/** Preserve concrete columns while checking deferred-reference schema factories. */
export function defineTableFactory<References, Table extends PgTable>(
  factory: (references: References) => Table,
): (references: References) => Table {
  return factory;
}
