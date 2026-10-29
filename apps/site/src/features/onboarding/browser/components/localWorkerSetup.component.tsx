"use client";
import { useId, useState, type JSX } from "react";
import { localWorkerCommand } from "../utils/localWorkerCommand.util";
export function LocalWorkerSetup({ origin }: { origin: string }): JSX.Element {
  const [client, setClient] = useState<"codex" | "claude">("codex");
  const [scope, setScope] = useState<"global" | "project">("global");
  const [notice, setNotice] = useState("");
  const id = useId();
  const command = localWorkerCommand(origin, client, scope);
  return (
    <section>
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
      <label>
        Client{" "}
        <select
          value={client}
          onChange={(event) => {
            setClient(event.target.value as "codex" | "claude");
            setNotice("");
          }}
        >
          <option value="codex">Codex</option>
          <option value="claude">Claude Code</option>
        </select>
      </label>
      <label>
        Install for{" "}
        <select
          value={scope}
          onChange={(event) => {
            setScope(event.target.value as "global" | "project");
            setNotice("");
          }}
        >
          <option value="global">All projects for this user</option>
          <option value="project">This repository</option>
        </select>
      </label>
      <p>
        Run setup. It downloads Chromium, checks rendering, opens TheoryFoundry
        authorization and adds a version-pinned connection. Downloading the
        public worker requires no npm account; TheoryFoundry authorization
        protects your hosted projects.
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
      <label htmlFor={id}>Setup command</label>
      <textarea id={id} value={command} readOnly rows={6} spellCheck={false} />
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(command).then(
            () => setNotice("Setup command copied."),
            () => setNotice("Select and copy the setup command below."),
          );
        }}
      >
        Copy command
      </button>
      <p>
        Restart your client or start a fresh session after setup. Refresh
        credentials remain in macOS Keychain. No token belongs in the client
        configuration.
      </p>
      <p role="status" aria-live="polite">
        {notice}
      </p>
    </section>
  );
}
