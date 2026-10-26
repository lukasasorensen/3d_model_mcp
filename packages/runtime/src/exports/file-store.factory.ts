import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DirectoryExportFileStore } from "../export-file-store.js";

export function createExportFileStore() {
  const directory = process.env.THEORYFOUNDRY_EXPORT_DIRECTORY
    ? resolve(process.env.THEORYFOUNDRY_EXPORT_DIRECTORY)
    : join(tmpdir(), "theoryfoundry-cad-exports", createHash("sha256").update(process.env.DATABASE_URL ?? "local").digest("hex").slice(0, 16));
  return new DirectoryExportFileStore(directory);
}
