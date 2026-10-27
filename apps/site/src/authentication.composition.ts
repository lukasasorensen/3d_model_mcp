import { getAuthenticatedUser } from "@theoryfoundry/runtime";
import { authenticateRequest as authenticate } from "./lib/route-policy";
export function authenticateRequest(request: Request) {
  return authenticate(request, getAuthenticatedUser);
}
