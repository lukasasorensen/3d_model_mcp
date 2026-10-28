import type { BrowserPresence } from "@theoryfoundry/contracts";
import {
  type AuthenticatedUser,
  type BrowserPreviewStore,
} from "@theoryfoundry/runtime";
export interface PreviewRouteDependencies {
  authenticate(request: Request): Promise<AuthenticatedUser | Response>;
  authorize(ownerId: string, projectId: string): Promise<unknown>;
  presence(
    ownerId: string,
    projectId: string,
    presence: BrowserPresence,
  ): Promise<void>;
  claim(
    ownerId: string,
    ...args: Parameters<BrowserPreviewStore["claim"]>
  ): ReturnType<BrowserPreviewStore["claim"]>;
  status(
    ownerId: string,
    ...args: Parameters<BrowserPreviewStore["browserStatus"]>
  ): ReturnType<BrowserPreviewStore["browserStatus"]>;
  complete(ownerId: string, raw: unknown): Promise<void>;
}
