import { readBoundedJson } from "../../../shared/http/index";
export { RequestBodyTooLargeError as ProjectBodyTooLargeError } from "../../../shared/http/index";
export const PROJECT_CREATE_BODY_BYTES = 24 * 1024;
export function readProjectRequestBody(request: Request): Promise<unknown> {
  return readBoundedJson(request, PROJECT_CREATE_BODY_BYTES);
}
