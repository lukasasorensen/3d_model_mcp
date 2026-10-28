export async function fetchRevisionSource(
  projectId: string,
  revisionId: string,
  expectedHash: string,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch(
    `/v1/projects/${encodeURIComponent(projectId)}/revisions/${encodeURIComponent(revisionId)}/source`,
    { cache: "no-store", ...(signal ? { signal } : {}) },
  );
  if (
    !response.ok ||
    response.headers.get("x-theoryfoundry-source-hash") !== expectedHash ||
    response.headers.get("x-theoryfoundry-source-revision") !== revisionId
  )
    throw new Error("Revision source failed validation.");
  const source = await response.text();
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(source),
  );
  const actual = [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  if (actual !== expectedHash)
    throw new Error("Revision source integrity check failed.");
  return source;
}
