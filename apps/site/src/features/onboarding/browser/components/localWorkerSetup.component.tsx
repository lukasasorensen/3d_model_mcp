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
        Validation, previews and exports run on your Mac; projects stay on
        TheoryFoundry. You can close the project tab after setup.
      </p>
      <p>
        Requires an Apple Silicon Mac, Node 24, pnpm and your selected client.
        Confirm the release is available with your operator before setup.
      </p>
      {scope === "project" ? (
        <p>
          Run in your Git repository root and trust the project in your client.
          Review generated configuration before sharing; each user needs an
          account.
        </p>
      ) : (
        <p>
          Setup uses your client’s user configuration, backs up existing
          settings and flags conflicts for review.
        </p>
      )}
      <p>
        Setup downloads Chromium, checks rendering and opens TheoryFoundry
        authorization. The public worker needs no npm account.
      </p>
      <SetupCommand
        key={`${client}-${scope}`}
        label="Setup command"
        value={localWorkerCommand(origin, client, scope)}
      />
      <p>
        After authorization, restart your client or start a new session.
        Credentials stay in macOS Keychain, not client configuration.
      </p>
    </section>
  );
}
