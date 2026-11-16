import { parameterToolErrorSchema } from "@theoryfoundry/contracts";
import type { CadMcpToolResult } from "../cadClient.port.js";
import {
  safeAssistantText,
  safeCode,
  truncateUtf8,
} from "./assistantText.util.js";

export function toolErrorFeedback(
  toolName: string,
  error: CadMcpToolResult["error"],
  sensitiveValues: ReadonlySet<string>,
  redactText: (value: string) => string = (value) => value,
): {
  code: string;
  message: string;
  details?: Record<string, string | number>;
} {
  const fallback = {
    code: safeCode(error?.code),
    message: "The CAD tool rejected the request safely.",
  };
  if (toolName !== "edit_parameters" && toolName !== "propose_model_source")
    return fallback;
  const parsed = parameterToolErrorSchema.safeParse(error);
  if (!parsed.success) return fallback;
  const safe = (value: string): string =>
    safeAssistantText(redactText(value), sensitiveValues, 500);
  // Validated identifiers/field paths may legitimately be UUIDs or long stable IDs.
  const identifier = (value: string): string => {
    let redacted = redactText(value);
    for (const sensitive of sensitiveValues)
      if (sensitive.length >= 4)
        redacted = redacted.split(sensitive).join("[redacted]");
    return truncateUtf8(redacted, 500);
  };
  const details: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(parsed.data.details ?? {})) {
    if (typeof value === "string")
      details[key] = key === "reason" ? safe(value) : identifier(value);
    else if (typeof value === "number") details[key] = value;
  }
  return {
    code: parsed.data.code,
    message: safe(parsed.data.message),
    ...(Object.keys(details).length ? { details } : {}),
  };
}
