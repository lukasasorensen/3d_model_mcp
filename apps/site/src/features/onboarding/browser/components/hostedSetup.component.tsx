import type { JSX } from "react";
import {
  codexConnectCommand,
  type CodexConnectionScope,
} from "../utils/codexConnectCommand.util";
import { SetupCommand } from "./setupCommand.component";

export function HostedSetup({
  origin,
  scope,
}: {
  origin: string;
  scope: CodexConnectionScope;
}): JSX.Element {
  return (
    <section className="setup-instructions" aria-label="Hosted Codex setup">
      <h3>Connect to Codex</h3>
      <p>
        On macOS or Linux, install Node.js 24 and the Codex CLI. Run the
        command, then sign in and approve CAD access in your browser.
      </p>
      {scope === "project" ? (
        <p>
          Run in your Git repository root and trust it in Codex. Repository
          scope does not limit access to one CAD project.
        </p>
      ) : (
        <p>Uses your Codex home configuration, including CODEX_HOME.</p>
      )}
      <p>Setup backs up changed settings; conflicts need manual review.</p>
      <SetupCommand
        label="Setup command"
        value={codexConnectCommand(origin, scope)}
      />
      <p>
        After authorization, restart Codex or start a new session. Keep this
        project tab visible during rendering.
      </p>
    </section>
  );
}
