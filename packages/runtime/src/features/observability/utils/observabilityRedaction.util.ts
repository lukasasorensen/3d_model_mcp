export const sensitivePattern =
  /(?:Bearer\s+\S+|(?:api|access|auth|secret|token|password)[_-]?[A-Za-z0-9]*\s*[:=]\s*\S+|(?:\/Users|\/home|\/private|\/tmp|\/var)\/[\w./-]+)/gi;

export function redact(value: string): string {
  return value.replace(sensitivePattern, "[redacted]");
}

export function serializedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}
