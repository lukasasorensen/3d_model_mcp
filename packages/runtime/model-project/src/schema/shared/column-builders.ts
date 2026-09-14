import { sql } from "drizzle-orm";
import { check, integer, jsonb, text, timestamp, type AnyPgColumn } from "drizzle-orm/pg-core";

const MAX_SOURCE_BYTES = 262_144;

interface SourceIntegrityColumns {
  sourceHash: AnyPgColumn;
  sourceBytes: AnyPgColumn;
}

export function primaryTextId() {
  return text("id").primaryKey();
}

export function creationTimestamp() {
  return timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
}

export function updateTimestamp() {
  return timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
}

export function auditTimestamps() {
  return {
    createdAt: creationTimestamp(),
    updatedAt: updateTimestamp(),
  };
}

export function sourceDocumentColumns() {
  return {
    source: text("source").notNull(),
    sourceHash: text("source_hash").notNull(),
    sourceBytes: integer("source_bytes").notNull(),
  };
}

export function requestTraceColumns() {
  return {
    requestId: text("request_id").notNull(),
    toolCallId: text("tool_call_id").notNull(),
  };
}

export function diagnosticsColumn() {
  return jsonb("diagnostics").notNull().default([]);
}

export function optionalRendererMetadataColumn() {
  return jsonb("renderer");
}

export function requiredRendererMetadataColumn() {
  return jsonb("renderer").notNull();
}

export function artifactColumns() {
  return {
    format: text("format").notNull(),
    metadata: jsonb("metadata").notNull(),
    objectKey: text("object_key"),
  };
}

export function sourceIntegrityChecks(constraintPrefix: string, table: SourceIntegrityColumns) {
  return [
    check(`${constraintPrefix}_source_hash_check`, sql`${table.sourceHash} ~ '^[a-f0-9]{64}$'`),
    check(`${constraintPrefix}_source_bytes_check`, sql`${table.sourceBytes} > 0 AND ${table.sourceBytes} <= ${sql.raw(String(MAX_SOURCE_BYTES))}`),
  ];
}

export function artifactFormatCheck(constraintPrefix: string, formatColumn: AnyPgColumn) {
  return check(`${constraintPrefix}_format_check`, sql`${formatColumn} IN ('stl', '3mf')`);
}
