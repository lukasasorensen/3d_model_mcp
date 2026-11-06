"use client";
import { useId, type JSX } from "react";
import type { AiChatSelection } from "../aiSelection.types";

export function ChatModelPicker({
  ai,
  disabled,
}: {
  ai: AiChatSelection;
  disabled: boolean;
}): JSX.Element | null {
  const id = useId();
  if (!ai.real) return null;
  return (
    <fieldset className="ai-picker" disabled={disabled}>
      <legend>AI connection</legend>
      <label htmlFor={`${id}-connection`}>Connection</label>
      <select
        id={`${id}-connection`}
        value={ai.selection.connectionId ?? ""}
        onChange={(event) => ai.select(event.target.value)}
      >
        <option value="">Choose a connection</option>
        {ai.connections.map((connection) => (
          <option key={connection.id} value={connection.id}>
            {connection.name} · {connection.status}
            {connection.location === "local" ? " · local inference" : ""}
          </option>
        ))}
      </select>
      <label htmlFor={`${id}-model`}>Model ID</label>
      <input
        id={`${id}-model`}
        list={`${id}-models`}
        value={ai.selection.model ?? ""}
        maxLength={200}
        onChange={(event) => ai.setModel(event.target.value)}
        placeholder="Enter a model ID"
      />
      <datalist id={`${id}-models`}>
        {ai.models.map((model) => (
          <option key={model} value={model} />
        ))}
      </datalist>
      <button
        type="button"
        disabled={!ai.selected}
        onClick={() => void ai.discover()}
      >
        Find models
      </button>
      <a href="/settings/ai-connections">Manage AI connections</a>
      {ai.error && <p role="status">{ai.error}</p>}
      {!ai.selected && (
        <p role="status">
          Choose a saved connection or add one in AI connection settings.
        </p>
      )}
      {ai.selected?.status === "credential-unavailable" && (
        <p role="status">Update this connection in AI connection settings.</p>
      )}
      {ai.selected?.status === "offline" && (
        <p role="status">
          Start the AI companion on your computer, then retry.
        </p>
      )}
      {ai.selected?.location === "local" && (
        <p>
          Inference runs locally. Project context passes through TheoryFoundry.
        </p>
      )}
    </fieldset>
  );
}
