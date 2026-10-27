import { loadWorkspace } from "./workspaceSource.repository.mjs";
import { checkSourceGraph, findingKey } from "./sourceGraph.adapter.mjs";
import { checkDependencyGraph } from "./dependencyGraph.adapter.mjs";

export async function checkArchitecture(root, projectPaths) {
  const workspace = loadWorkspace(root, projectPaths);
  const findings = [
    ...checkSourceGraph(workspace).findings,
    ...(await checkDependencyGraph(workspace)),
  ];
  return [
    ...new Map(
      findings.map((finding) => [findingKey(finding), finding]),
    ).values(),
  ].sort((a, b) => findingKey(a).localeCompare(findingKey(b)));
}
