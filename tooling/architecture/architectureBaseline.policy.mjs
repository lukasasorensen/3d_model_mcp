import { findingKey } from "./sourceGraph.adapter.mjs";

export const architectureBaselinePath =
  "tooling/architecture/legacyArchitecture.generated.json";
export const architectureBootstrapCommit =
  "3f1df4f3e745e84e35f5b0198c7e53e5fc136fcb";
export function validateArchitectureBaseline(baseline) {
  if (
    !baseline ||
    baseline.version !== 1 ||
    !/^[a-f0-9]{40}$/.test(baseline.sourceCommit) ||
    !Array.isArray(baseline.violations)
  )
    throw new Error(
      "Architecture baseline: restore version 1, sourceCommit and explicit violations array.",
    );
  const keys = new Set();
  for (const violation of baseline.violations) {
    if (
      !["file", "rule", "target", "owner", "reason"].every(
        (field) => typeof violation?.[field] === "string",
      ) ||
      !violation.file ||
      !violation.rule ||
      !violation.owner ||
      !violation.reason
    )
      throw new Error(
        "Architecture baseline: every exception needs file, rule, target, owner and reason.",
      );
    const key = findingKey(violation);
    if (keys.has(key))
      throw new Error(
        `${violation.file}: duplicate architecture exemption ${violation.rule}; remove it.`,
      );
    keys.add(key);
  }
}
export function compareArchitectureBaselines(current, previous) {
  validateArchitectureBaseline(current);
  validateArchitectureBaseline(previous);
  const previousKeys = new Set(previous.violations.map(findingKey));
  const findings = [];
  if (current.sourceCommit !== previous.sourceCommit)
    findings.push(
      "Architecture baseline provenance cannot change; restore sourceCommit.",
    );
  for (const violation of current.violations)
    if (!previousKeys.has(findingKey(violation)))
      findings.push(
        `${violation.file}: [${violation.rule}] ${violation.target}; exemption added or retargeted. Fix the dependency instead.`,
      );
  return findings;
}
export function evaluateArchitectureBaseline(findings, baseline) {
  validateArchitectureBaseline(baseline);
  const currentKeys = new Set(findings.map(findingKey));
  const allowed = new Set(baseline.violations.map(findingKey));
  const errors = findings
    .filter((finding) => !allowed.has(findingKey(finding)))
    .map(
      (finding) =>
        `${finding.file}: [${finding.rule}] ${finding.target}; ${finding.message}`,
    );
  for (const violation of baseline.violations)
    if (!currentKeys.has(findingKey(violation)))
      errors.push(
        `${violation.file}: [${violation.rule}] ${violation.target}; resolved/stale exception, remove it from the architecture baseline.`,
      );
  return errors;
}
