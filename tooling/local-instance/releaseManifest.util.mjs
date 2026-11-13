const digestReference = /^[a-z0-9][a-z0-9./:_-]*@sha256:[a-f0-9]{64}$/;
export function publishedRelease(value, applicationVersion, workerVersion) {
  const keys = [
    "version",
    "workerVersion",
    "postgresMajor",
    "appImage",
    "toolingImage",
    "postgresImage",
  ];
  if (
    !value ||
    typeof value !== "object" ||
    Object.keys(value).some((key) => !keys.includes(key)) ||
    value.version !== applicationVersion ||
    value.workerVersion !== workerVersion ||
    value.postgresMajor !== 18 ||
    ![value.appImage, value.toolingImage, value.postgresImage].every(
      (image) => typeof image === "string" && digestReference.test(image),
    )
  )
    throw new Error(
      "Release manifest must match the application/worker versions and pin all three images by SHA-256 digest.",
    );
  if (
    !value.appImage.startsWith(
      "ghcr.io/lukasasorensen/theoryfoundry-local-app@",
    ) ||
    !value.toolingImage.startsWith(
      "ghcr.io/lukasasorensen/theoryfoundry-local-tooling@",
    ) ||
    !value.postgresImage.startsWith("postgres@")
  )
    throw new Error("Unexpected local release image repository.");
  return value;
}
