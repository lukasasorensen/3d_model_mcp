import { readFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import type {
  LocalCommand,
  LocalInstanceCapabilities,
} from "../../../domains/local-instance/index.js";
import {
  privateDirectory,
  readInstallation,
  saveInstallation,
  createInstallation,
  requireLocalSecrets,
} from "../services/localInstallation.service.js";
import {
  runCompose,
  prepareLocalImages,
  requireFreePort,
  localReadiness,
  initializeLocalJournal,
} from "../services/localCompose.service.js";
import {
  writeLocalBackup,
  readLocalBackup,
  snapshotArguments,
} from "../services/localBackup.service.js";
import {
  localOrigin,
  localProject,
  localReleaseSchema,
  requireCompatible,
} from "../utils/localConfiguration.util.js";
export async function runLocalInstance(
  command: LocalCommand,
  capabilities: LocalInstanceCapabilities,
  workerVersion: string,
): Promise<Record<string, unknown>> {
  await privateDirectory(capabilities.home);
  const lock = join(capabilities.home, "operation.lock");
  try {
    await mkdir(lock, { mode: 0o700 });
  } catch {
    throw new Error(
      "LOCAL_BUSY: Another lifecycle operation is running. After a crash, stop all local CLI operations before removing the operation.lock directory.",
    );
  }
  try {
    let state = await readInstallation(capabilities.home);
    if (command.command === "status")
      return state
        ? {
            installed: true,
            ready: await localReadiness(state, capabilities.signal),
            origin: localOrigin(state),
            release: state.release,
            upgradePending: state.upgradePending ?? false,
          }
        : { installed: false, ready: false };
    if (command.command === "restore") {
      if (state)
        throw new Error(
          "RESTORE_TARGET: Restore requires an empty local home. Use THEORYFOUNDRY_LOCAL_HOME for a separate installation; existing volumes are never overwritten.",
        );
      const password = await capabilities.prompt("Backup passphrase: ");
      const backup = await readLocalBackup(command.input!, password);
      state = {
        ...backup.state,
        id: randomBytes(8).toString("hex"),
        port: command.port ?? backup.state.port,
        upgradePending: true,
      };
      requireCompatible(state.release, workerVersion);
      await requireFreePort(state.port);
      await prepareLocalImages(capabilities, state);
      await capabilities.secrets(state.id, backup.secrets);
      await saveInstallation(capabilities.home, state);
      const restored = await capabilities.run(snapshotArguments(state, true), {
        input: backup.archive,
      });
      if (restored.code !== 0)
        throw new Error(
          "RESTORE_FAILED: New installation remains stopped. Source installation is unchanged.",
        );
      delete state.upgradePending;
      await saveInstallation(capabilities.home, state);
      return {
        restored: true,
        origin: localOrigin(state),
        next: "Run local start, then connect to authorize this origin.",
      };
    }
    if (!state && command.command !== "start")
      throw new Error("LOCAL_MISSING: Run local start first.");
    if (!state) {
      await requireFreePort(command.port ?? 43100);
      state = await createInstallation(capabilities, command.port);
    }
    if (command.port !== undefined && command.port !== state.port)
      throw new Error(
        "PORT_FIXED: Existing installations retain their origin. Restore to a new local home to change ports.",
      );
    if (command.command === "stop") {
      // Stopping existing containers must remain possible with a locked credential store.
      const placeholders = {
        database: "0".repeat(64),
        auth: "0".repeat(64),
        setup: "0".repeat(64),
        ai: Buffer.alloc(32).toString("base64"),
      };
      await runCompose(capabilities, state, placeholders, ["stop"]);
      return { stopped: true, dataPreserved: true };
    }
    const secrets = await requireLocalSecrets(capabilities, state);
    if (command.command === "logs") {
      const logs = (
        await runCompose(capabilities, state, secrets, [
          "logs",
          "--no-color",
          "--tail",
          "100",
          "app",
          "migrate",
        ])
      ).toString("utf8");
      // Never forward raw process/HTTP bodies or known credentials to agent output.
      return {
        logs: Object.values(secrets)
          .reduce((text, secret) => text.replaceAll(secret, "[redacted]"), logs)
          .replace(/([?&](?:token|code|sig)=)[^\s&]+/gi, "$1[redacted]"),
      };
    }
    if (command.command === "setup") {
      if (!(await localReadiness(state, capabilities.signal)))
        throw new Error("LOCAL_NOT_READY: Run local start before setup.");
      await capabilities.open(
        `${localOrigin(state)}/local-setup#token=${secrets.setup}`,
      );
      return {
        opened: true,
        origin: localOrigin(state),
        next: "Create your account in the browser; then run connect.",
      };
    }
    if (command.command !== "upgrade")
      requireCompatible(state.release, workerVersion);
    if (state.upgradePending)
      throw new Error(
        "UPGRADE_PENDING: A migration/restore failed. Keep this instance stopped and restore its backup to a new local home; do not start an older image against it.",
      );
    if (command.command === "backup" || command.command === "upgrade") {
      const password = await capabilities.prompt(
        "Encrypt backup with a passphrase (12+ characters): ",
      );
      if (
        password.length < 12 ||
        password !== (await capabilities.prompt("Repeat backup passphrase: "))
      )
        throw new Error(
          "BACKUP_PASSWORD: Passphrases must match and contain at least 12 characters.",
        );
      let release = state.release;
      if (command.command === "upgrade") {
        release = localReleaseSchema.parse(
          JSON.parse(await readFile(command.release!, "utf8")),
        );
        requireCompatible(release, workerVersion);
        const current = state.release.version.split(".").map(Number);
        const next = release.version.split(".").map(Number);
        const difference = next.findIndex(
          (part, index) => part !== current[index],
        );
        if (difference < 0 || next[difference]! < current[difference]!)
          throw new Error(
            "UPGRADE_VERSION: Select a newer immutable release; restore a backup to downgrade.",
          );
        await prepareLocalImages(
          capabilities,
          { ...state, release },
          command.source,
        );
      }
      // Cold physical snapshots keep database, exports and erasure journal consistent.
      await runCompose(capabilities, state, secrets, ["stop"]);
      await writeLocalBackup(
        capabilities,
        state,
        secrets,
        command.output!,
        password,
      );
      if (command.command === "backup")
        return {
          backup: command.output,
          stopped: true,
          next: "Run local start to resume.",
        };
      state = { ...state, release, upgradePending: true };
      await saveInstallation(capabilities.home, state);
    }
    await prepareLocalImages(capabilities, state, command.source);
    if (!state.journalInitialized) {
      await initializeLocalJournal(capabilities, state);
      state.journalInitialized = true;
      await saveInstallation(capabilities.home, state);
    }
    const ready = await localReadiness(state, capabilities.signal);
    if (!ready) {
      await requireFreePort(state.port);
      try {
        // A fresh one-shot migration container is required on every start/upgrade.
        await runCompose(capabilities, state, secrets, [
          "up",
          "-d",
          "--wait",
          "--wait-timeout",
          "90",
          "postgres",
        ]);
        await runCompose(capabilities, state, secrets, [
          "run",
          "--rm",
          "--no-deps",
          "migrate",
        ]);
        await runCompose(capabilities, state, secrets, [
          "up",
          "-d",
          "--no-deps",
          "--wait",
          "--wait-timeout",
          "120",
          "app",
        ]);
        await runCompose(capabilities, state, secrets, [
          "up",
          "-d",
          "--no-deps",
          "--wait",
          "--wait-timeout",
          "45",
          "proxy",
        ]);
        if (!(await localReadiness(state, capabilities.signal)))
          throw new Error(
            "READINESS_FAILED: Application did not become ready.",
          );
      } catch (error) {
        await runCompose(
          { ...capabilities, signal: AbortSignal.timeout(10000) },
          state,
          secrets,
          ["stop"],
        ).catch(() => undefined);
        throw error;
      }
    }
    delete state.upgradePending;
    await saveInstallation(capabilities.home, state);
    if (command.open) await capabilities.open(`${localOrigin(state)}/projects`);
    return {
      ready: true,
      origin: localOrigin(state),
      project: localProject(state),
      release: state.release,
      next: "Run local setup for your first account, then connect --server <origin> --allow-loopback-http.",
    };
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}
