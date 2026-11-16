import { AsyncEntry } from "@napi-rs/keyring";
import type { LocalSecrets } from "../../domains/local-instance/index.js";
export async function localSecrets(
  id: string,
  value?: LocalSecrets,
): Promise<LocalSecrets | undefined> {
  const entry = new AsyncEntry("TheoryFoundry Local Instance", id, {
    linux: { store: "secret-service" },
  });
  try {
    if (value) await entry.setPassword(JSON.stringify(value));
    const saved = await entry.getPassword();
    return saved === null ? undefined : (JSON.parse(saved) as LocalSecrets);
  } catch {
    throw new Error(
      "CREDENTIAL_STORE: Unlock the OS credential store. No plaintext secret fallback is supported.",
    );
  }
}
