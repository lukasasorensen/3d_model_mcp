import { getAuthenticatedUser } from "@theoryfoundry/runtime";
import { authenticateRequest as authenticate } from "./features/authentication/index";
export function authenticateRequest(
  request: Request,
): ReturnType<typeof authenticate> {
  return authenticate(request, getAuthenticatedUser);
}
