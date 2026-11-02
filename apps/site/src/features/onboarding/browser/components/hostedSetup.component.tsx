import { useId, type JSX } from "react";
import type {
  HostedClient,
  HostedInstallations,
} from "../../installation.types";
import {
  codexConnectCommand,
  type CodexConnectionScope,
} from "../utils/codexConnectCommand.util";
import {
  nativeClaudeCommand,
  nativeMcpConfiguration,
} from "../utils/nativeMcpConfiguration.util";
import { SetupCommand } from "./setupCommand.component";
export function HostedSetup({
  origin,
  scope,
  client,
  installations = {},
  onScopeChange,
}: {
  origin: string;
  scope: CodexConnectionScope;
  client: HostedClient;
  installations?: HostedInstallations | undefined;
  onScopeChange: (scope: CodexConnectionScope) => void;
}): JSX.Element {
  const scopeId = useId();
  const name = client === "codex" ? "Codex" : "Claude Code";
  const listing =
    installations.origin === origin ? installations[client] : undefined;
  const file =
    client === "codex"
      ? scope === "global"
        ? "~/.codex/config.toml (or $CODEX_HOME/config.toml)"
        : ".codex/config.toml in your repository"
      : scope === "global"
        ? "your user MCP configuration"
        : ".mcp.json in your repository";
  return (
    <section className="setup-instructions" aria-label="Hosted plugin setup">
      <h3>Install the TheoryFoundry plugin for {name}</h3>
      {listing ? (
        <p>
          <a
            className="button-primary setup-plugin-link"
            href={listing}
            target="_blank"
            rel="noopener noreferrer"
          >
            Install for {name}
          </a>
        </p>
      ) : (
        <p>
          A plugin is not available for this site yet. Use manual setup below to
          connect.
        </p>
      )}
      <p>
        After installation, connect your TheoryFoundry account in {name} and
        approve CAD access. Start a fresh session and keep the matching project
        tab visible while rendering.
      </p>
      <details open={!listing}>
        <summary>Advanced setup</summary>
        <label htmlFor={scopeId}>Manual installation scope</label>
        <select
          id={scopeId}
          value={scope}
          onChange={(event) =>
            onScopeChange(event.target.value as CodexConnectionScope)
          }
        >
          <option value="global">All projects for this user</option>
          <option value="project">This repository</option>
        </select>
        <p>
          {client === "claude" && scope === "global"
            ? "Run this command to add the connection to your user MCP configuration."
            : `Add this server entry to ${file}, preserving your other settings.`}{" "}
          Authorize the server in your client’s MCP settings.
        </p>
        {scope === "project" && (
          <p>
            Trust this repository in your client. Installation scope does not
            limit access to one CAD project.
          </p>
        )}
        <SetupCommand
          key={`${origin}-${client}-${scope}`}
          label="Connection settings"
          value={
            client === "claude" && scope === "global"
              ? nativeClaudeCommand(origin)
              : nativeMcpConfiguration(origin, client)
          }
          rows={9}
        />
        <p>
          If a callback is rejected, ask the operator to register the exact
          callback URL displayed by your client.
        </p>
        {client === "codex" && installations.npmAvailable && (
          <section aria-label="Optional npm installer">
            <h4>Optional npm installer for Codex</h4>
            <p>
              With Node.js 24 and the Codex CLI installed, run this command and
              approve access in your browser.
            </p>
            <SetupCommand
              key={`${origin}-${scope}`}
              label="Setup command"
              value={codexConnectCommand(origin, scope)}
            />
          </section>
        )}
      </details>
    </section>
  );
}
