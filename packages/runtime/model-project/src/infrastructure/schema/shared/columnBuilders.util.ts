import type { IsPrimaryKey, NotNull, HasDefault } from "drizzle-orm";
import type {
  PgTextBuilderInitial,
  PgTimestampBuilderInitial,
  PgIntegerBuilderInitial,
  PgJsonbBuilderInitial,
  CheckBuilder,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  check,
  integer,
  jsonb,
  text,
  timestamp,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

const MAX_SOURCE_BYTES = 262_144;

interface SourceIntegrityColumns {
  sourceHash: AnyPgColumn;
  sourceBytes: AnyPgColumn;
}

export function primaryTextId(): IsPrimaryKey<
  NotNull<PgTextBuilderInitial<"id", [string, ...string[]]>>
> {
  return text("id").primaryKey();
}

export function creationTimestamp(): HasDefault<
  NotNull<PgTimestampBuilderInitial<"created_at">>
> {
  return timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
}

export function updateTimestamp(): HasDefault<
  NotNull<PgTimestampBuilderInitial<"updated_at">>
> {
  return timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
}

export function auditTimestamps(): {
  createdAt: ReturnType<typeof creationTimestamp>;
  updatedAt: ReturnType<typeof updateTimestamp>;
} {
  return {
    createdAt: creationTimestamp(),
    updatedAt: updateTimestamp(),
  };
}

export function sourceDocumentColumns(): {
  source: NotNull<PgTextBuilderInitial<"source", [string, ...string[]]>>;
  sourceHash: NotNull<
    PgTextBuilderInitial<"source_hash", [string, ...string[]]>
  >;
  sourceBytes: NotNull<PgIntegerBuilderInitial<"source_bytes">>;
} {
  return {
    source: text("source").notNull(),
    sourceHash: text("source_hash").notNull(),
    sourceBytes: integer("source_bytes").notNull(),
  };
}

export function requestTraceColumns(): {
  requestId: NotNull<PgTextBuilderInitial<"request_id", [string, ...string[]]>>;
  toolCallId: NotNull<
    PgTextBuilderInitial<"tool_call_id", [string, ...string[]]>
  >;
} {
  return {
    requestId: text("request_id").notNull(),
    toolCallId: text("tool_call_id").notNull(),
  };
}

export function diagnosticsColumn(): HasDefault<
  NotNull<PgJsonbBuilderInitial<"diagnostics">>
> {
  return jsonb("diagnostics").notNull().default([]);
}

export function optionalRendererMetadataColumn(): PgJsonbBuilderInitial<"renderer"> {
  return jsonb("renderer");
}

export function requiredRendererMetadataColumn(): NotNull<
  PgJsonbBuilderInitial<"renderer">
> {
  return jsonb("renderer").notNull();
}

export function artifactColumns(): {
  format: NotNull<PgTextBuilderInitial<"format", [string, ...string[]]>>;
  metadata: NotNull<PgJsonbBuilderInitial<"metadata">>;
  objectKey: PgTextBuilderInitial<"object_key", [string, ...string[]]>;
} {
  return {
    format: text("format").notNull(),
    metadata: jsonb("metadata").notNull(),
    objectKey: text("object_key"),
  };
}

export function sourceIntegrityChecks(
  constraintPrefix: string,
  table: SourceIntegrityColumns,
): CheckBuilder[] {
  return [
    check(
      `${constraintPrefix}_source_hash_check`,
      sql`${table.sourceHash} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      `${constraintPrefix}_source_bytes_check`,
      sql`${table.sourceBytes} > 0 AND ${table.sourceBytes} <= ${sql.raw(String(MAX_SOURCE_BYTES))}`,
    ),
  ];
}

export function artifactFormatCheck(
  constraintPrefix: string,
  formatColumn: AnyPgColumn,
): CheckBuilder {
  return check(
    `${constraintPrefix}_format_check`,
    sql`${formatColumn} IN ('stl', '3mf')`,
  );
}
