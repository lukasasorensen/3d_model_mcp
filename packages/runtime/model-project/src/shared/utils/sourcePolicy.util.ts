import { CAD_LIMITS } from "@theoryfoundry/contracts";
import { CadDomainError } from "./cadDomainError.util.js";

export function assertSourcePolicy(source: string): void {
  const byteSize = Buffer.byteLength(source);
  if (byteSize > CAD_LIMITS.sourceBytes) {
    throw new CadDomainError(
      "SOURCE_TOO_LARGE",
      "Model source exceeds the configured byte limit.",
      { byteSize, limit: CAD_LIMITS.sourceBytes },
    );
  }
  let offset = 0;
  const skipTrivia = (): void => {
    while (offset < source.length) {
      if (/\s/.test(source[offset]!)) offset++;
      else if (source.startsWith("//", offset)) {
        offset += 2;
        while (
          offset < source.length &&
          source[offset] !== "\n" &&
          source[offset] !== "\r"
        )
          offset++;
      } else if (source.startsWith("/*", offset)) {
        const end = source.indexOf("*/", offset + 2);
        offset = end < 0 ? source.length : end + 2;
      } else break;
    }
  };
  const forbidden = (): never => {
    throw new CadDomainError(
      "FORBIDDEN_SOURCE_REFERENCE",
      "Model source contains a forbidden external reference.",
    );
  };
  // Advance monotonically: malformed calls must never rescan the source suffix.
  while (offset < source.length) {
    skipTrivia();
    if (source[offset] === '"') {
      offset++;
      while (offset < source.length) {
        const character = source[offset++];
        if (character === "\\") offset++;
        else if (character === '"') break;
      }
      continue;
    }
    if (!/[A-Za-z_$]/.test(source[offset] ?? "")) {
      offset++;
      continue;
    }
    const start = offset++;
    while (/[A-Za-z0-9_$]/.test(source[offset] ?? "")) offset++;
    const identifier = source.slice(start, offset);
    skipTrivia();
    if (
      (identifier === "include" || identifier === "use") &&
      source[offset] === "<"
    ) {
      const end = source.indexOf(">", offset + 1);
      if (end < 0) forbidden();
      const reference = source.slice(offset + 1, end);
      if (
        !reference.startsWith("BOSL2/") ||
        reference.includes("..") ||
        reference.includes("\\")
      )
        forbidden();
      offset = end + 1;
    } else if (
      (identifier === "import" || identifier === "surface") &&
      source[offset] === "("
    ) {
      offset++;
      skipTrivia();
      if (source[offset] !== ")") forbidden();
      offset++;
    }
  }
}
