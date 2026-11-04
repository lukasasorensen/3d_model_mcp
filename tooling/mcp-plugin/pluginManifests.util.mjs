export function pluginManifests(metadata, publication, client) {
  const { name, version, description, author, origin, license } = metadata;
  const url = new URL(origin);
  if (
    url.origin !== origin ||
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  )
    throw new Error("Plugin origin must be canonical public HTTPS.");
  if (!/^[a-z][a-z0-9-]+$/.test(name) || !/^\d+\.\d+\.\d+$/.test(version))
    throw new Error("Invalid plugin identity or release version.");
  for (const key of [
    "supportURL",
    "privacyPolicyURL",
    "termsOfServiceURL",
    "demoRecordingURL",
  ]) {
    if (!publication[key]) continue;
    const link = new URL(publication[key]);
    if (
      link.protocol !== "https:" ||
      link.username ||
      link.password ||
      ["localhost", "127.0.0.1", "[::1]"].includes(link.hostname)
    )
      throw new Error(
        "Publication links must use public HTTPS without credentials.",
      );
  }
  const common = {
    name,
    version,
    description,
    author,
    homepage: origin,
    license,
    skills: "./skills/",
    mcpServers: "./.mcp.json",
  };
  const scopes = ["cad:tools", "offline_access"];
  const clientId =
    client === "codex"
      ? "theoryfoundry-openai-plugin"
      : "theoryfoundry-claude-code";
  if (!["codex", "claude"].includes(client))
    throw new Error("Unsupported plugin target.");
  const server = {
    type: "http",
    url: `${origin}/mcp`,
    oauth: {
      clientId,
      ...(client === "codex"
        ? { callbackUrl: "http://127.0.0.1/callback" }
        : { scopes: scopes.join(" ") }),
    },
  };
  if (client === "codex") {
    Object.assign(server, {
      scopes,
      tool_timeout_sec: 120,
      extensions: {
        "com.openai": {
          auth: {
            type: "oauth",
            client: {
              mode: "provided",
              clientId,
              tokenEndpointAuthMethod: "none",
            },
            baseScopes: scopes,
          },
        },
      },
    });
    const links = Object.fromEntries(
      ["supportURL", "privacyPolicyURL", "termsOfServiceURL"]
        .filter((key) => publication[key])
        .map((key) => {
          const value = new URL(publication[key]);
          if (value.protocol !== "https:" || value.username || value.password)
            throw new Error(
              "Publication links must use HTTPS without credentials.",
            );
          return [key, value.href];
        }),
    );
    Object.assign(common, {
      interface: {
        displayName: "TheoryFoundry CAD",
        shortDescription: "Hosted CAD tools",
        longDescription: description,
        developerName: author.name,
        category: "Productivity",
        capabilities: ["Read", "Write"],
        websiteURL: origin,
        composerIcon: "./assets/logo.svg",
        logo: "./assets/logo.svg",
        ...links,
      },
    });
  }
  if (client === "claude") {
    for (const [source, target] of [
      ["supportURL", "supportUrl"],
      ["privacyPolicyURL", "privacyPolicyUrl"],
      ["termsOfServiceURL", "termsOfServiceUrl"],
    ]) {
      if (publication[source]) {
        const link = new URL(publication[source]);
        if (link.protocol !== "https:" || link.username || link.password)
          throw new Error(
            "Publication links must use HTTPS without credentials.",
          );
        common[target] = link.href;
      }
    }
  }
  return { manifest: common, mcp: { mcpServers: { [name]: server } } };
}
