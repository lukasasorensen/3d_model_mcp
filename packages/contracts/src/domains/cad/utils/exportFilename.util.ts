export function exportFilename(
  name: string,
  projectId: string,
  revision: string,
  hash: string,
  format: "stl" | "3mf" | "glb",
): string {
  const slug =
    name
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase()
      .slice(0, 60) || "model";
  return `${slug}-${projectId.slice(0, 8)}-${revision.slice(0, 8)}-${hash.slice(0, 12)}.${format}`;
}
