import { createHash } from "node:crypto";
import { basename } from "node:path";
import * as prettier from "prettier";
import configuration from "../../prettier.config.mjs";

export const baselinePath = "tooling/conventions/legacyBaseline.generated.json";
export const bootstrapCommit = "efd6b8fcf5b8d6a9b048a5830c8c53cd1e14271b";

// Generated artifacts have independent integrity checks; migrations are immutable history.
export function isExcluded(file) {
  return (
    file === "pnpm-lock.yaml" ||
    file === baselinePath ||
    file === "apps/site/public/installers/connect-codex-v1.mjs" ||
    file === "apps/site/next-env.d.ts" ||
    file.startsWith("packages/runtime/model-project/drizzle/") ||
    file
      .split("/")
      .some(
        (part) =>
          ["node_modules", "dist", "coverage", "vendor", ".git"].includes(
            part,
          ) || part.startsWith(".next"),
      )
  );
}

const sourceExtension = /\.(?:mjs|cjs|js|ts|tsx)$/;
const roleStem =
  /^[a-z][a-zA-Z0-9]*\.(?:controller|workflow|service|util|types|port|repository|adapter|schema|enum|component|hook|worker|client|renderer|metadata|contract|constants|policy|composition|factory|fixture|script|cli|config|http|integration)$/;
const frameworkName =
  /^(?:page|layout|route|loading|error|global-error|not-found|default|template|middleware|instrumentation|sitemap|robots|manifest|opengraph-image|twitter-image|icon|apple-icon)\.(?:ts|tsx)$/;

export function namingViolations(file) {
  if (!sourceExtension.test(file)) return [];
  const result = [];
  const name = basename(file);
  const framework =
    file.startsWith("apps/site/src/app/") && frameworkName.test(name);
  const conventional =
    name === "index.ts" ||
    name === "index.mjs" ||
    /^(?:\.?[a-z-]+\.config|\.eslintrc)\.(?:mjs|cjs|js|ts)$/.test(name) ||
    file === "apps/site/src/middleware.ts" ||
    file === "apps/site/src/instrumentation.ts";
  const stem = name
    .replace(sourceExtension, "")
    .replace(/\.(?:test|spec)$/, "");
  if (
    !framework &&
    !conventional &&
    !roleStem.test(stem) &&
    !/^(?:index|page|layout|route)\.(?:test|spec)\./.test(name)
  )
    result.push("filename");
  if (
    file
      .split("/")
      .slice(0, -1)
      .some(
        (part) =>
          !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(part) &&
          !(
            file.startsWith("apps/site/src/app/") &&
            /^(?:\[.*\]|\(.*\)|@.*)$/.test(part)
          ),
      )
  )
    result.push("folder");
  const layer = file
    .split("/")
    .findLast((part) =>
      ["controllers", "workflows", "services", "utils"].includes(part),
    );
  const suffix = {
    controllers: "controller",
    workflows: "workflow",
    services: "service",
    utils: "util",
  }[layer];
  if (suffix && !stem.endsWith(`.${suffix}`)) result.push("layer-suffix");
  if (/\.(?:test|spec)\./.test(name) && !file.split("/").includes("tests"))
    result.push("test-placement");
  return result;
}

export function physicalLines(source) {
  return source === ""
    ? 0
    : source.split("\n").length - Number(source.endsWith("\n"));
}

export async function inspectSource(file, source) {
  if (isExcluded(file)) return {};
  const information = await prettier.getFileInfo(file, {
    resolveConfig: false,
  });
  const record = {};
  if (
    information.inferredParser &&
    !(await prettier.check(source, { ...configuration, filepath: file }))
  ) {
    record.formatHash = createHash("sha256").update(source).digest("hex");
  }
  const rules = namingViolations(file);
  if (rules.length) record.rules = rules;
  // Count handwritten text, including Markdown, shell scripts, and configuration.
  if (!source.includes("\0") && physicalLines(source) > 500)
    record.maxLines = physicalLines(source);
  return record;
}

export const corrections = {
  filename:
    "use a camelCase stem and explicit role suffix (example.service.ts)",
  folder: "use kebab-case folders; preserve Next.js route segments",
  "layer-suffix":
    "match the containing layer with .controller/.workflow/.service/.util",
  "test-placement":
    "move the test to its project's tests/ tree, mirroring the source path and full stem",
};
