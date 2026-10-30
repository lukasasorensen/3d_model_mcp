export function releaseVersion(base, requested = base) {
  if (!/^\d+\.\d+\.\d+$/.test(base))
    throw new Error("Workspace worker version must be a stable version.");
  if (
    requested !== requested.trim() ||
    (requested !== base &&
      !new RegExp(`^${base.replaceAll(".", "\\.")}-rc\\.(?:0|[1-9]\\d*)$`).test(
        requested,
      ))
  )
    throw new Error(
      "Release version must match the workspace version or its explicit -rc.N candidate.",
    );
  return requested;
}
