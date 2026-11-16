import test from "node:test";
import assert from "node:assert/strict";
import {
  encryptLocalBackup,
  decryptLocalBackup,
} from "../../../../src/features/local-instance/services/localBackup.service.js";
void test("encrypted snapshots authenticate secrets, content and the passphrase before restore", () => {
  const source = Buffer.from(
    "project source, account database and stable secrets",
  );
  const encrypted = encryptLocalBackup(
    source,
    "a sufficiently long passphrase",
  );
  assert.equal(encrypted.includes(source), false);
  assert.deepEqual(
    decryptLocalBackup(encrypted, "a sufficiently long passphrase"),
    source,
  );
  assert.throws(
    () => decryptLocalBackup(encrypted, "another long passphrase"),
    /BACKUP_INVALID/,
  );
  encrypted[encrypted.length - 1] = encrypted[encrypted.length - 1]! ^ 1;
  assert.throws(
    () => decryptLocalBackup(encrypted, "a sufficiently long passphrase"),
    /BACKUP_INVALID/,
  );
  assert.throws(() => encryptLocalBackup(source, "short"), /BACKUP_PASSWORD/);
});
