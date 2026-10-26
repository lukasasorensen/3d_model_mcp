import path from "node:path";
import { existsSync, realpathSync } from "node:fs";
import { cruise } from "dependency-cruiser";
import configuration from "./dependency-cruiser.config.mjs";
import { relativeTo } from "./workspaceSource.repository.mjs";

export async function checkDependencyGraph(workspace) {
  const findings = [];
  const resolveReported = (file) => {
    for (const candidate of [
      path.resolve(workspace.root, file),
      path.resolve(process.cwd(), file),
    ]) {
      if (existsSync(candidate)) {
        const canonical = realpathSync(candidate);
        if (canonical.startsWith(workspace.root + path.sep)) return canonical;
      }
    }
    return undefined;
  };
  for (const project of workspace.projects) {
    const ownFiles = workspace.files.filter(
      (file) => workspace.owner(file) === project,
    );
    if (!ownFiles.length) continue;
    const alias = Object.fromEntries(
      [...workspace.publicEntries].map(([name, file]) => [name + "$", file]),
    );
    for (const [pattern, targets] of Object.entries(
      project.options.paths ?? {},
    )) {
      if (
        (pattern.includes("*") && !pattern.endsWith("/*")) ||
        targets.some((target) => target.includes("*") && !target.endsWith("/*"))
      ) {
        throw new Error(
          `${project.directory}/tsconfig.json: architecture aliases require literal or trailing /* patterns; normalize the alias.`,
        );
      }
      const wildcard = pattern.endsWith("/*");
      const name = wildcard ? pattern.slice(0, -2) : pattern + "$";
      alias[name] = targets.map((target) =>
        path.resolve(
          project.options.baseUrl ??
            project.options.pathsBasePath ??
            project.absolute,
          wildcard ? target.replace(/\/\*$/, "") : target,
        ),
      );
    }
    const result = await cruise(
      [relativeTo(workspace.root, project.src)],
      {
        ...configuration.options,
        baseDir: workspace.root,
        exclude: {
          path: "(?:^|/)(?:node_modules|dist|tests|test-support|fixtures)/|\\.(?:test|spec)\\.",
        },
        ruleSet: configuration,
        validate: true,
        outputType: "json",
      },
      {
        alias,
        exportsFields: ["exports"],
        conditionNames: ["import", "node", "default"],
        extensions: [".ts", ".tsx", ".mts", ".cts", ".mjs", ".js", ".json"],
        extensionAlias: {
          ".js": [".ts", ".tsx", ".js"],
          ".mjs": [".mts", ".mjs"],
        },
        tsConfig: path.join(project.absolute, "tsconfig.json"),
        bustTheCache: true,
      },
      { tsConfig: project.options },
    );
    const graph =
      typeof result.output === "string"
        ? JSON.parse(result.output)
        : result.output;
    for (const violation of graph.summary.violations ?? []) {
      const absolute = resolveReported(violation.from);
      // Other projects are analyzed using their own alias/resolution context.
      if (!absolute || workspace.owner(absolute) !== project) continue;
      const resolvedTarget = violation.to
        ? resolveReported(violation.to)
        : undefined;
      const target = resolvedTarget
        ? relativeTo(workspace.root, resolvedTarget)
        : (violation.to ?? "");
      findings.push({
        file: relativeTo(workspace.root, absolute),
        rule: `graph-${violation.rule.name}`,
        target,
        message:
          "Fix the unresolved dependency or break the cycle reported by dependency-cruiser.",
      });
    }
  }
  return findings;
}
