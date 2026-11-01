"use client";
import type { JSX } from "react";
import { localWorkerCommand } from "../utils/localWorkerCommand.util";
import { SetupCommand } from "./setupCommand.component";

export function LocalWorkerSetup({
  origin,
  client,
  scope,
}: {
  origin: string;
  client: "codex" | "claude";
  scope: "global" | "project";
}): JSX.Element {
  return (
    <section className="setup-instructions" aria-label="Local worker setup">
      <h3>Set up your local worker</h3>
      <p>
        Local validation, preview images and exports run on your Mac. Your
        account and projects stay on TheoryFoundry. The project browser tab can
        be closed after setup.
      </p>
      <p>
        First release targets Apple Silicon Macs. Use setup after your operator
        confirms the release is available. Requires Node 24, pnpm and the
        selected client.
      </p>
      {scope === "project" ? (
        <p>
          Run at your local Git repository root. Review the generated project
          configuration before sharing it; each user needs their own
          TheoryFoundry account. Approve or trust the project in your client.
        </p>
      ) : (
        <p>
          Codex uses your CODEX_HOME when set. Claude uses its user
          configuration. Existing settings are backed up; conflicts require
          review.
        </p>
      )}
      <p>
        Setup downloads Chromium, checks rendering, opens TheoryFoundry
        authorization and adds a version-pinned connection. Downloading the
        public worker requires no npm account; TheoryFoundry authorization
        protects your hosted projects.
      </p>
      <SetupCommand
        label="Setup command"
        value={localWorkerCommand(origin, client, scope)}
      />
      <h3>After authorization</h3>
      <p>
        Restart your client or start a fresh session after setup. Refresh
        credentials remain in macOS Keychain. No token belongs in the client
        configuration.
      </p>
    </section>
  );
}
