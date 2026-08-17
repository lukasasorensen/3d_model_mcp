import { CAD_LIMITS, type Diagnostic } from "@rjls/contracts";

export type RendererErrorCode =
  | "ISOLATION_UNAVAILABLE"
  | "INTEGRITY_FAILURE"
  | "TIMEOUT"
  | "CANCELLED"
  | "RESOURCE_LIMIT"
  | "INVALID_SOURCE"
  | "INVALID_ARTIFACT"
  | "RUNTIME_FAILURE";

export class RendererError extends Error {
  constructor(
    public readonly code: RendererErrorCode,
    message: string,
    public readonly details: Readonly<Record<string, string | number | boolean | null>> = {},
  ) {
    super(message);
    this.name = "RendererError";
  }
}

const hostPath = /(?:\/[A-Za-z0-9._-]+){2,}|[A-Za-z]:\\[^\s]+/g;
const secret = /\b(?:token|secret|password|authorization|cookie)\s*[=:]\s*\S+/gi;

export function boundedRedactedText(value: string, limit = 1_048_576): string {
  const clean = value.replace(secret, "[REDACTED]").replace(hostPath, "[PATH]");
  const encoded = Buffer.from(clean, "utf8");
  if (encoded.byteLength <= limit) return clean;
  const marker = Buffer.from("\n[TRUNCATED]", "utf8");
  let end = Math.max(0, limit - marker.byteLength);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  while (end > 0) {
    try { return `${decoder.decode(encoded.subarray(0, end))}${marker.toString("utf8")}`; } catch { end -= 1; }
  }
  return marker.subarray(0, limit).toString("utf8");
}

export function parseDiagnostics(stderr: string, exitCode: number | null): Diagnostic[] {
  const text = boundedRedactedText(stderr);
  const lines = text.split(/\r?\n/).filter(Boolean).slice(0, CAD_LIMITS.diagnosticCount);
  const diagnostics = lines.map((line): Diagnostic => {
    const location = line.match(/line\s+(\d+)(?:[^\d]+column\s+(\d+))?/i);
    const hard = /ERROR|Parser error|syntax error|assertion failed/i.test(line);
    const warning = /WARNING/i.test(line);
    let code = "OPENSCAD_MESSAGE";
    if (hard) code = "OPENSCAD_ERROR";
    else if (warning) code = "OPENSCAD_WARNING";
    return {
      code,
      severity: hard || warning ? "error" : "info",
      message: line.slice(0, CAD_LIMITS.diagnosticMessageCharacters),
      ...(location?.[1] ? { line: Number(location[1]) } : {}),
      ...(location?.[2] ? { column: Number(location[2]) } : {}),
    };
  });
  if (exitCode !== 0 && diagnostics.length === 0) {
    diagnostics.push({ code: "OPENSCAD_FAILED", severity: "error", message: "OpenSCAD exited without producing a usable artifact." });
  }
  return diagnostics;
}
