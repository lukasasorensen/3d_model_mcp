import { corrections } from "./sourceConventions.policy.mjs";

export function validateBaseline(baseline) {
  if (
    !baseline ||
    baseline.version !== 1 ||
    !/^[a-f0-9]{40}$/.test(baseline.sourceCommit) ||
    !baseline.files ||
    Array.isArray(baseline.files)
  ) {
    throw new Error(
      "Legacy baseline: expected version 1, sourceCommit and a files object; restore the checked-in structure.",
    );
  }
  for (const [file, record] of Object.entries(baseline.files)) {
    if (
      !record ||
      !Object.keys(record).length ||
      Object.keys(record).some(
        (key) => !["formatHash", "rules", "maxLines"].includes(key),
      ) ||
      (record.formatHash !== undefined &&
        !/^[a-f0-9]{64}$/.test(record.formatHash)) ||
      (record.maxLines !== undefined &&
        (!Number.isInteger(record.maxLines) || record.maxLines <= 500)) ||
      (record.rules !== undefined &&
        (!Array.isArray(record.rules) ||
          !record.rules.length ||
          record.rules.some((rule) => !Object.hasOwn(corrections, rule))))
    ) {
      throw new Error(
        `${file}: invalid legacy record; remove empty records and use only documented exceptions.`,
      );
    }
  }
}

export function compareBaselines(current, previous) {
  validateBaseline(current);
  validateBaseline(previous);
  const findings = [];
  if (current.sourceCommit !== previous.sourceCommit)
    findings.push(
      "legacy baseline: sourceCommit cannot change; preserve bootstrap provenance",
    );
  for (const [file, record] of Object.entries(current.files)) {
    const allowed = previous.files[file] ?? {};
    if (record.formatHash && record.formatHash !== allowed.formatHash)
      findings.push(
        `${file}: format exemption added or changed; format the file and remove the exemption`,
      );
    if (record.maxLines && record.maxLines > (allowed.maxLines ?? 500))
      findings.push(
        `${file}: line allowance increased; split by responsibility and reduce the baseline`,
      );
    for (const rule of record.rules ?? []) {
      if (!allowed.rules?.includes(rule))
        findings.push(`${file}: ${rule} exemption added; ${corrections[rule]}`);
    }
  }
  return findings;
}

export function evaluateRecords(actual, baseline, mode = "all") {
  const findings = [];
  for (const file of new Set([
    ...Object.keys(actual),
    ...Object.keys(baseline.files),
  ])) {
    const record = actual[file] ?? {};
    const allowed = baseline.files[file] ?? {};
    if (mode !== "conventions") {
      if (record.formatHash && record.formatHash !== allowed.formatHash)
        findings.push(
          `${file}: formatting differs; run pnpm exec prettier --write '${file}' and remove any formatHash exemption`,
        );
      if (allowed.formatHash && !record.formatHash)
        findings.push(
          `${file}: stale formatHash; remove the resolved exemption`,
        );
    }
    if (mode !== "format") {
      for (const rule of record.rules ?? []) {
        if (!allowed.rules?.includes(rule))
          findings.push(`${file}: ${rule}; ${corrections[rule]}`);
      }
      for (const rule of allowed.rules ?? []) {
        if (!record.rules?.includes(rule))
          findings.push(`${file}: stale ${rule} exemption; remove it`);
      }
      if ((record.maxLines ?? 0) > (allowed.maxLines ?? 500))
        findings.push(
          `${file}: ${record.maxLines} physical lines exceeds ${allowed.maxLines ?? 500}; split by responsibility`,
        );
      if (allowed.maxLines && (record.maxLines ?? 0) < allowed.maxLines)
        findings.push(
          `${file}: shrink maxLines to ${record.maxLines ?? "no exemption (at most 500)"}`,
        );
    }
  }
  return findings;
}
