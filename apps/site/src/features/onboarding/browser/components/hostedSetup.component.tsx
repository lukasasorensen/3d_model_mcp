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
        Use a macOS or Linux terminal with Node.js 24 and the Codex CLI
        installed. Sign in and approve CAD access in your browser when prompted.
      </p>
      {scope === "project" ? (
        <p>
          Run from the root of your local Git repository. Trust the repository
          in Codex to load its settings. This controls where the connection is
          available; it does not restrict access to one CAD project.
        </p>
      ) : (
        <p>
          Uses your Codex home configuration, including a custom CODEX_HOME if
          set.
        </p>
      )}
      <p>
        The command downloads the installer from this site, backs up changed
        configuration, and adds the connection. Existing conflicting settings
        require manual review.
      </p>
      <SetupCommand
        label="Setup command"
        value={codexConnectCommand(origin, scope)}
      />
      <h3>After authorization</h3>
      <p>
        Restart Codex or start a fresh session. Keep your CAD project tab
        visible during rendering.
      </p>
    </section>
  );
}
