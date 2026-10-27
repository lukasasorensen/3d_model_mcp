import path from "node:path";
import { relativeTo, isTest } from "./workspaceSource.repository.mjs";

const roles = {
  controller: "controller",
  http: "controller",
  handler: "controller",
  workflow: "workflow",
  service: "service",
  repository: "service",
  adapter: "service",
  client: "service",
  renderer: "service",
  worker: "service",
  factory: "composition",
  util: "util",
  policy: "util",
  metadata: "util",
  constants: "util",
  schema: "util",
  enum: "util",
  contract: "util",
  types: "types",
  port: "port",
  component: "component",
  hook: "hook",
  composition: "composition",
};
const layers = {
  controllers: "controller",
  workflows: "workflow",
  services: "service",
  utils: "util",
  types: "types",
};
const lower = ["util", "types", "port"];
const allowed = {
  controller: new Set(["workflow", "service", ...lower]),
  workflow: new Set(["service", ...lower]),
  service: new Set(lower),
  util: new Set(lower),
  types: new Set(["types", "port"]),
  port: new Set(["types", "port"]),
  component: new Set([
    "component",
    "hook",
    "controller",
    "workflow",
    "service",
    ...lower,
  ]),
  hook: new Set(["hook", "service", ...lower]),
};

export function describeSource(workspace, absolute) {
  const project = workspace.owner(absolute);
  if (!project || !absolute.startsWith(project.src + path.sep))
    return undefined;
  const local = relativeTo(project.src, absolute);
  const file = relativeTo(workspace.root, absolute);
  const parts = local.split("/");
  const area = ["domains", "features", "infrastructure", "shared"].includes(
    parts[0],
  )
    ? parts[0]
    : "legacy";
  const module = ["domains", "features"].includes(area)
    ? `${project.directory}/src/${parts.slice(0, 2).join("/")}`
    : area === "legacy"
      ? `${project.directory}/src`
      : `${project.directory}/src/${area}`;
  const name = parts.at(-1);
  const role = name.match(/\.([a-z]+)\.[cm]?[jt]sx?$/)?.[1];
  const framework =
    project.directory.startsWith("apps/") &&
    /^app\//.test(local) &&
    /^(page|layout|route|loading|error|not-found|global-error|default|template)\.[jt]sx?$/.test(
      name,
    );
  // Existing host composition entries retain their operational paths until THE-29.
  const hostComposition = new Set([
    "apps/site/src/lib/cad-renderer.adapter.ts",
    "apps/site/src/lib/openscad.worker.ts",
  ]).has(file);
  let layer =
    framework || hostComposition
      ? "composition"
      : /^index\.[cm]?[jt]s$/.test(name)
        ? "barrel"
        : (roles[role] ??
          parts
            .slice(0, -1)
            .map((part) => layers[part])
            .findLast(Boolean));
  if (
    layer === "composition" &&
    !framework &&
    !hostComposition &&
    parts.length !== 1
  )
    layer = undefined;
  return { project, file, local, area, module, layer, test: isTest(file) };
}
export function boundaryRules(
  from,
  to,
  semantic = false,
  specifier = "",
  typeOnly = false,
) {
  const findings = [];
  // The contracts package owns shared runtime schemas and pure validation as well
  // as erased types. Its implementation layers are never foundational imports.
  const foundationContract =
    from.project !== to.project &&
    to.project.name === "@theoryfoundry/contracts" &&
    lower.includes(to.layer);
  const add = (rule, message) =>
    findings.push({ file: from.file, rule, target: to.file, message });
  if (to.test) {
    add(
      "source-to-tests",
      "Move shared production behavior out of test/fixture code.",
    );
    return findings;
  }
  if (
    from.area === "domains" &&
    ["features", "infrastructure"].includes(to.area)
  )
    add(
      "module-boundary",
      "Domains consume domain contracts and shared foundations; inject infrastructure ports.",
    );
  if (from.area === "features" && to.area === "infrastructure")
    add(
      "module-boundary",
      "Inject infrastructure through domain-owned ports at composition.",
    );
  if (
    from.area === "shared" &&
    !foundationContract &&
    to.area !== "shared" &&
    !(to.area === "legacy" && to.layer === "barrel")
  )
    add(
      "module-boundary",
      "Shared foundations must not import application modules.",
    );
  if (
    from.area === "infrastructure" &&
    !foundationContract &&
    (to.area === "features" ||
      (to.area === "domains" &&
        !["types", "port", "barrel"].includes(to.layer)))
  )
    add(
      "module-boundary",
      "Infrastructure may depend on domain contracts only.",
    );
  if (!semantic) {
    if (from.project !== to.project) {
      if (
        to.project.entries.get(specifier) !==
        path.join(to.project.src, to.local)
      )
        add(
          "public-api",
          `Use a declared public export of ${to.project.name}, not a cross-package path.`,
        );
    } else if (
      from.module !== to.module &&
      to.area !== "shared" &&
      to.layer !== "barrel"
    )
      add("public-api", `Use the public index of ${to.module}.`);
    else if (
      (from.module === to.module || to.local === "index.ts") &&
      !["composition", "barrel"].includes(from.layer) &&
      to.layer === "barrel"
    )
      add(
        "own-barrel",
        "Internal modules import specific files, not their own public barrel.",
      );
  }
  if (
    !["barrel", "composition"].includes(from.layer) &&
    to.layer !== "barrel" &&
    !allowed[from.layer]?.has(to.layer) &&
    !(!from.layer && lower.includes(to.layer)) &&
    !(
      typeOnly &&
      ["types", "port"].includes(from.layer) &&
      /\.(schema|enum|constants)\.[cm]?[jt]s$/.test(to.local)
    )
  )
    add(
      "layer-boundary",
      `${from.layer ?? "unclassified"} cannot consume ${to.layer ?? "unclassified"}; use lower-level contracts/utilities or move sequencing into a workflow.`,
    );
  return findings;
}
