import type { HostedInstallations } from "../../installation.types";
function publicUrl(
  value: string | undefined,
  originOnly = false,
): string | undefined {
  if (!value) return undefined;
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    (originOnly && url.origin !== value)
  )
    throw new Error(
      "Plugin distribution requires public HTTPS URLs and a canonical deployment origin.",
    );
  return value;
}
export function pluginDistribution(
  environment: Record<string, string | undefined>,
): HostedInstallations {
  const origin = publicUrl(environment.THEORYFOUNDRY_PLUGIN_ORIGIN, true);
  const codex = publicUrl(environment.THEORYFOUNDRY_CODEX_PLUGIN_URL);
  const claude = publicUrl(environment.THEORYFOUNDRY_CLAUDE_PLUGIN_URL);
  if ((codex || claude) && !origin)
    throw new Error(
      "Set THEORYFOUNDRY_PLUGIN_ORIGIN before advertising plugin listings.",
    );
  return {
    ...(origin ? { origin } : {}),
    ...(codex ? { codex } : {}),
    ...(claude ? { claude } : {}),
    npmAvailable: environment.THEORYFOUNDRY_CODEX_NPM_AVAILABLE === "1",
  };
}
