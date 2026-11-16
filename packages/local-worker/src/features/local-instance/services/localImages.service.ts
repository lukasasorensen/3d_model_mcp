import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  LocalImages,
  LocalInstallation,
  LocalInstanceCapabilities,
} from "../../../domains/local-instance/index.js";
import { localImages } from "../utils/localConfiguration.util.js";

export async function prepareLocalImages(
  capabilities: LocalInstanceCapabilities,
  state: LocalInstallation,
  source?: string,
): Promise<LocalImages | undefined> {
  let overrides = state.localImages;
  if (source) {
    const application = JSON.parse(
      await readFile(join(source, "package.json"), "utf8"),
    ) as { version?: unknown };
    if (application.version !== state.release.version)
      throw new Error(
        "SOURCE_VERSION: The selected checkout does not match this release manifest.",
      );
    overrides = {
      appImage: `theoryfoundry/local-app:${state.release.version}`,
      toolingImage: `theoryfoundry/local-tooling:${state.release.version}`,
    };
  }
  const images = localImages({ ...state, localImages: overrides });
  for (const [target, image] of [
    ["runtime", images.appImage],
    ["tooling", images.toolingImage],
    [undefined, images.postgresImage],
  ] as const) {
    const options = { signal: capabilities.signal };
    const exists = await capabilities.run(["image", "inspect", image], options);
    if (exists.code === 0) continue;
    const build = Boolean(source && target);
    if (!build && !/@sha256:[a-f0-9]{64}$/.test(image) && target)
      throw new Error(
        "IMAGES_REQUIRED: This development image is not published. Load its offline archive or use local start --source /path/to/3d_model_mcp.",
      );
    const result = await capabilities.run(
      build
        ? ["build", "--target", target!, "--tag", image, source!]
        : ["pull", image],
      options,
    );
    if (result.code !== 0)
      throw new Error(
        build
          ? "IMAGE_BUILD_FAILED: Review the source build prerequisites. Existing data is preserved."
          : "IMAGE_PULL_FAILED: Could not download the pinned local release image. Check network access, release availability and Docker platform support, then retry local start. Existing data is preserved.",
      );
    if (
      (await capabilities.run(["image", "inspect", image], options)).code !== 0
    )
      throw new Error(
        "IMAGE_UNAVAILABLE: Docker did not retain the requested image. Retry local start; existing data is preserved.",
      );
  }
  return overrides;
}
