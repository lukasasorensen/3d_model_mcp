"use client";
import { useId, useRef, useState, type JSX } from "react";
import { LocalWorkerSetup } from "./localWorkerSetup.component";
import { HostedSetup } from "./hostedSetup.component";
import { SetupCommand } from "./setupCommand.component";
import {
  codexStarterPrompt,
  type CodexConnectionScope,
} from "../utils/codexConnectCommand.util";

export function ConnectToCodex({
  origin,
  projectId,
  localWorkerAvailable = false,
}: {
  origin: string;
  projectId?: string;
  localWorkerAvailable?: boolean;
}): JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const modeName = useId();
  const clientId = useId();
  const scopeId = useId();
  const [mode, setMode] = useState<"hosted" | "local">("hosted");
  const effectiveMode = localWorkerAvailable ? mode : "hosted";
  const [client, setClient] = useState<"codex" | "claude">("codex");
  const [scope, setScope] = useState<CodexConnectionScope>("global");
  return (
    <>
      <button
        type="button"
        onClick={() => {
          dialog.current?.showModal();
          title.current?.focus();
        }}
      >
        Connect CAD tools
      </button>
      <dialog
        ref={dialog}
        className="codex-connect-dialog"
        aria-labelledby={titleId}
      >
        <header className="setup-heading">
          <div>
            <h2 ref={title} id={titleId} tabIndex={-1}>
              {localWorkerAvailable
                ? "Connect CAD tools"
                : "Set up browser rendering"}
            </h2>
          </div>
          <form method="dialog">
            <button type="submit" aria-label="Close connection setup">
              Close
            </button>
          </form>
        </header>
        <div className="setup-content">
          <div className="setup-choices">
            {localWorkerAvailable ? (
              <fieldset>
                <legend>Where should rendering run?</legend>
                <label className="setup-choice">
                  <input
                    type="radio"
                    name={modeName}
                    value="hosted"
                    checked={effectiveMode === "hosted"}
                    onChange={() => setMode("hosted")}
                  />
                  <span>
                    <strong>In this browser</strong>
                    <small>Connect Codex to TheoryFoundry.</small>
                  </span>
                </label>
                <label className="setup-choice">
                  <input
                    type="radio"
                    name={modeName}
                    value="local"
                    checked={effectiveMode === "local"}
                    onChange={() => setMode("local")}
                  />
                  <span>
                    <strong>On your Mac</strong>
                    <small>
                      Use a local worker with Codex or Claude Code. You can
                      close the project tab after setup.
                    </small>
                  </span>
                </label>
              </fieldset>
            ) : (
              <p>Connect Codex to TheoryFoundry.</p>
            )}
            {effectiveMode === "local" && (
              <div className="setup-field">
                <label htmlFor={clientId}>Client</label>
                <select
                  id={clientId}
                  value={client}
                  onChange={(event) =>
                    setClient(event.target.value as "codex" | "claude")
                  }
                >
                  <option value="codex">Codex</option>
                  <option value="claude">Claude Code</option>
                </select>
              </div>
            )}
            <div className="setup-field">
              <label htmlFor={scopeId}>Install for</label>
              <select
                id={scopeId}
                value={scope}
                onChange={(event) =>
                  setScope(event.target.value as CodexConnectionScope)
                }
              >
                <option value="global">All projects for this user</option>
                <option value="project">This repository</option>
              </select>
            </div>
            <p className="setup-hint">
              This sets where your client loads the connection. It does not
              limit authorization to a single CAD project.
            </p>
          </div>
          <div className="setup-install">
            {effectiveMode === "local" ? (
              <LocalWorkerSetup origin={origin} client={client} scope={scope} />
            ) : (
              <HostedSetup origin={origin} scope={scope} />
            )}
            {projectId && (
              <section
                className="setup-starter"
                aria-label="Start with this project"
              >
                <h3>Start with this project</h3>
                <p>Once connected, paste this into your client:</p>
                <SetupCommand
                  label="Starter prompt"
                  value={codexStarterPrompt(projectId)}
                  rows={4}
                />
              </section>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
