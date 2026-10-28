export type WorkerIdentity = {
  origin: string;
  issuer: string;
  resource: string;
};
export type Credential = {
  version: 1;
  origin: string;
  account: string;
  generation: string;
  refreshToken: string;
};
export type AccessToken = { token: string; account: string; expiresAt: number };
export type TokenSet = AccessToken & { refreshToken: string };
