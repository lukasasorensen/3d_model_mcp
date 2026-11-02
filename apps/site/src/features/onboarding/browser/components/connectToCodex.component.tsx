"use client";
import { useEffect, useId, useRef, useState, type JSX } from "react";
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
  const [step, setStep] = useState<"choose" | "install">("choose");
  const [mode, setMode] = useState<"hosted" | "local">("hosted");
  const effectiveMode = localWorkerAvailable ? mode : "hosted";
  const [client, setClient] = useState<"codex" | "claude">("codex");
  const [scope, setScope] = useState<CodexConnectionScope>("global");
  useEffect(() => {
    if (dialog.current?.open) {
      dialog.current.scrollTop = 0;
      title.current?.focus();
    }
  }, [step]);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setStep("choose");
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
            <p className="setup-step">
              Step {step === "choose" ? "1" : "2"} of 2
            </p>
            <h2 ref={title} id={titleId} tabIndex={-1}>
              {step === "choose"
                ? localWorkerAvailable
                  ? "Choose your connection"
                  : "Set up browser rendering"
                : "Install and authorize"}
            </h2>
          </div>
          <form method="dialog">
            <button type="submit" aria-label="Close connection setup">
              Close
            </button>
          </form>
        </header>
        {step === "choose" ? (
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
                    <small>
                      Connect Codex to TheoryFoundry. Keep the project tab
                      visible during rendering.
                    </small>
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
              <p>
                Connect Codex to TheoryFoundry. Keep the project tab visible
                during rendering.
              </p>
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
            <button
              type="button"
              className="button-primary"
              onClick={() => setStep("install")}
            >
              Continue to setup
            </button>
          </div>
        ) : (
          <div className="setup-install">
            <div className="setup-selection">
              <p>
                {effectiveMode === "hosted"
                  ? "Browser rendering · Codex"
                  : `Local worker · ${client === "codex" ? "Codex" : "Claude Code"}`}{" "}
                · {scope === "global" ? "All projects" : "This repository"}
              </p>
              <button type="button" onClick={() => setStep("choose")}>
                Change choices
              </button>
            </div>
            {effectiveMode === "local" ? (
              <LocalWorkerSetup origin={origin} client={client} scope={scope} />
            ) : (
              <HostedSetup origin={origin} scope={scope} />
            )}
            {projectId && (
              <details className="setup-starter">
                <summary>Start with this project</summary>
                <p>Once connected, paste this into your client:</p>
                <SetupCommand
                  label="Starter prompt"
                  value={codexStarterPrompt(projectId)}
                  rows={4}
                />
              </details>
            )}
          </div>
        )}
      </dialog>
    </>
  );
}
