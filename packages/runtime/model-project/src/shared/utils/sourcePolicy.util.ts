import { CAD_LIMITS } from "@theoryfoundry/contracts";
import { CadDomainError } from "./cadDomainError.util.js";
const includeReferencePattern = /\b(?:include|use)\s*<([^>]+)>/g;
const fileFunctionPattern = /\b(import|surface)\s*\(([^;]*)\)/g;
export function assertSourcePolicy(source: string): void {
  const byteSize = Buffer.byteLength(source);
  if (byteSize > CAD_LIMITS.sourceBytes) {
    throw new CadDomainError(
      "SOURCE_TOO_LARGE",
      "Model source exceeds the configured byte limit.",
      {
        byteSize,
        limit: CAD_LIMITS.sourceBytes,
      },
    );
  }
  includeReferencePattern.lastIndex = 0;
  for (const match of source.matchAll(includeReferencePattern)) {
    const reference = match[1] ?? "";
    if (
      !reference.startsWith("BOSL2/") ||
      reference.includes("..") ||
      reference.includes("\\")
    ) {
      throw new CadDomainError(
        "FORBIDDEN_SOURCE_REFERENCE",
        "Model source contains a forbidden external reference.",
      );
    }
  }
  fileFunctionPattern.lastIndex = 0;
  for (const match of source.matchAll(fileFunctionPattern)) {
    const argumentsText = match[2] ?? "";
    const reference =
      argumentsText.match(/\bfile\s*=\s*["']([^"']+)["']/)?.[1] ??
      argumentsText.match(/^\s*["']([^"']+)["']/)?.[1];
    if (
      reference ||
      /\bfile\s*=/.test(argumentsText) ||
      /^\s*[^,)]/.test(argumentsText)
    ) {
      throw new CadDomainError(
        "FORBIDDEN_SOURCE_REFERENCE",
        "Model source contains a forbidden external file reference.",
      );
    }
  }
}
