import type {
  Credential,
  TokenSet,
  AccessToken,
} from "./authentication.types.js";
export interface CredentialStore {
  read(account: string): Promise<Credential | null>;
  write(credential: Credential): Promise<void>;
  remove(account: string): Promise<void>;
}
export interface CredentialLock {
  run<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T>;
}
export interface OAuthTransport {
  exchange(
    parameters: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<TokenSet>;
  revoke(refreshToken: string, signal?: AbortSignal): Promise<void>;
}
export interface AuthorizationListener {
  wait(signal?: AbortSignal): Promise<string>;
  close(): Promise<void>;
}
export interface WorkerAuthentication {
  login(
    openBrowser: (url: string) => Promise<void>,
    signal?: AbortSignal,
  ): Promise<string>;
  accessToken(account: string, signal?: AbortSignal): Promise<AccessToken>;
  logout(account: string, signal?: AbortSignal): Promise<void>;
}
