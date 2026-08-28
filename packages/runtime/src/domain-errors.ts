import { CadDomainError, type CadDomainErrorCode } from "@rjls/model-project";

export { CadDomainError, type CadDomainErrorCode } from "@rjls/model-project";

export function isCadDomainError(error: unknown, code: CadDomainErrorCode): error is CadDomainError {
  return error instanceof CadDomainError && error.code === code;
}
