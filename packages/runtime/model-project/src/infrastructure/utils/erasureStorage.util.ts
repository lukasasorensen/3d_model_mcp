import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export function exportDirectory(): string {
  return process.env.THEORYFOUNDRY_EXPORT_DIRECTORY
    ? resolve(process.env.THEORYFOUNDRY_EXPORT_DIRECTORY)
    : join(
        tmpdir(),
        "theoryfoundry-cad-exports",
        createHash("sha256")
          .update(process.env.DATABASE_URL ?? "local")
          .digest("hex")
          .slice(0, 16),
      );
}

export function erasureDirectory(requireManagedJournal: boolean): string {
  const configured = process.env.THEORYFOUNDRY_ERASURE_DIRECTORY;
  if (configured) return resolve(configured);
  if (requireManagedJournal)
    throw new Error("A persistent erasure journal is required.");
  return exportDirectory() + "-erasure";
}
