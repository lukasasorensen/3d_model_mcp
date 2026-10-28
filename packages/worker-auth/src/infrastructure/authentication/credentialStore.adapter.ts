import { WorkerAuthError } from "../../shared/utils/authenticationError.util.js";
import { createHash } from "node:crypto";
import { AsyncEntry } from "@napi-rs/keyring";
import {
  type Credential,
  type CredentialStore,
} from "../../domains/authentication/index.js";
export function createCredentialStore(
  origin: string,
  createEntry: (
    service: string,
    account: string,
  ) => Pick<AsyncEntry, "getPassword" | "setPassword" | "deleteCredential"> = (
    service,
    account,
  ) => new AsyncEntry(service, account, { linux: { store: "secret-service" } }),
): CredentialStore {
  const entry = (
    account: string,
  ): Pick<AsyncEntry, "getPassword" | "setPassword" | "deleteCredential"> =>
    createEntry(
      "TheoryFoundry Worker",
      createHash("sha256")
        .update(JSON.stringify([origin, account]))
        .digest("hex"),
    );
  const unavailable = (): WorkerAuthError =>
    new WorkerAuthError(
      "CREDENTIAL_STORE_UNAVAILABLE",
      "Unlock the OS credential store (Linux requires Secret Service). Plaintext storage is not supported.",
    );
  return {
    async read(account): Promise<Credential | null> {
      let raw: string | null;
      try {
        raw = await entry(account).getPassword();
      } catch {
        throw unavailable();
      }
      if (raw === null) return null;
      try {
        const value: unknown = JSON.parse(raw);
        if (
          !value ||
          typeof value !== "object" ||
          !("version" in value) ||
          value.version !== 1 ||
          !("origin" in value) ||
          value.origin !== origin ||
          !("account" in value) ||
          value.account !== account ||
          !("generation" in value) ||
          typeof value.generation !== "string" ||
          !value.generation ||
          !("refreshToken" in value) ||
          typeof value.refreshToken !== "string" ||
          !value.refreshToken
        )
          throw new Error();
        return {
          version: 1,
          origin,
          account,
          generation: value.generation,
          refreshToken: value.refreshToken,
        };
      } catch {
        throw new WorkerAuthError(
          "INVALID_CREDENTIAL",
          "Stored credential is invalid. Log in again for this server and account.",
        );
      }
    },
    async write(value: Credential): Promise<void> {
      if (value.origin !== origin)
        throw new WorkerAuthError(
          "INVALID_CREDENTIAL",
          "Credential server mismatch.",
        );
      try {
        await entry(value.account).setPassword(JSON.stringify(value));
      } catch {
        throw unavailable();
      }
    },
    async remove(account): Promise<void> {
      try {
        await entry(account).deleteCredential();
      } catch {
        throw unavailable();
      }
    },
  };
}
