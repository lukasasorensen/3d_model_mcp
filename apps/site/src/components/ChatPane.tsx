"use client";

import type { FormEvent, KeyboardEvent, RefObject } from "react";
import { useState } from "react";
import type { ChatTurn } from "@/lib/workspace-state";

const TOOL_LABELS: Record<string, string> = {
  get_project_state: "Checking project",
  read_model_source: "Reading current model",
  propose_model_source: "Drafting a revision",
  validate_and_render: "Validating and rendering",
  promote_candidate: "Making revision current",
  export_model: "Preparing 3MF",
  list_revisions: "Loading history",
  restore_revision: "Restoring as a new revision",
};

export const BLANK_STARTERS = ["Create an 80 × 40 mm mounting bracket with a 6 mm base and two 5 mm mounting holes."] as const;
export const CURRENT_STARTERS = [
  "Widen the current bracket to 100 mm and move the holes to 70 mm spacing.",
  "Widen the current bracket to 100 mm, move the holes to 70 mm spacing, and add two 6 mm gussets with 20 mm legs.",
] as const;

export function starterPrompts(hasCurrentRevision: boolean): readonly string[] {
  return hasCurrentRevision ? CURRENT_STARTERS : BLANK_STARTERS;
}

export function isSubmitShortcut(event: Pick<KeyboardEvent<HTMLTextAreaElement>, "key" | "ctrlKey" | "metaKey">): boolean {
  return event.key === "Enter" && (event.ctrlKey || event.metaKey);
}

export function chatStatusLabel(active: boolean, available: boolean): "Working" | "Ready" | "Unavailable" {
  if (active) return "Working";
  if (available) return "Ready";
  return "Unavailable";
}

export function ChatPane({
  turns,
  hasCurrentRevision,
  active,
  available,
  onSubmit,
  onCancel,
  onRetry,
  composerRef,
}: {
  turns: ChatTurn[];
  hasCurrentRevision: boolean;
  active: boolean;
  available: boolean;
  onSubmit: (message: string) => void;
  onCancel: () => void;
  onRetry: () => void;
  composerRef: RefObject<HTMLTextAreaElement>;
}) {
  const [message, setMessage] = useState("");
  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || active || !available) return;
    setMessage("");
    onSubmit(trimmed);
  };
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (isSubmitShortcut(event)) { event.preventDefault(); submit(); }
  };
  let statusClass = "";
  if (active) statusClass = "status-working";
  else if (!available) statusClass = "status-unavailable";
  const starters = starterPrompts(hasCurrentRevision);

  return (
    <section className="chat-pane" aria-labelledby="conversation-heading" data-testid="chat-pane">
      <div className="pane-heading">
        <div><p className="eyebrow">Conversation</p><h2 id="conversation-heading">Build by describing the change</h2></div>
        <span className={`status-chip ${statusClass}`}>{chatStatusLabel(active, available)}</span>
      </div>
      <div className="transcript" role="feed" aria-label="CAD conversation" aria-busy={active}>
        {turns.length === 0 ? (
          <div className="chat-empty">
            <h3>Start with a dimensioned part</h3>
            <p>The assistant changes the canonical model through validated tools. The viewer is for inspection only.</p>
          </div>
        ) : turns.map((turn) => (
          <article className={`chat-turn turn-${turn.role}`} key={turn.id} aria-label={`${turn.role} message`} data-testid={`turn-${turn.role}`}>
            <span className="turn-label">{turn.role === "user" ? "You" : "RJLS CAD"}</span>
            {turn.text && <p>{turn.text}</p>}
            {turn.activity.length > 0 && (
              <details className="tool-activity" open={active && !turn.outcome}>
                <summary>Tool activity · {turn.activity.filter((item) => item.state === "success").length}/{turn.activity.length} complete</summary>
                <ol>
                  {turn.activity.map((item) => <li key={item.toolCallId}><span>{TOOL_LABELS[item.tool] ?? "Running CAD tool"}</span><strong>{item.state}{item.code ? ` · ${item.code}` : ""}</strong></li>)}
                </ol>
              </details>
            )}
            {turn.outcome && <span className={`turn-outcome outcome-${turn.outcome}`}>{turn.outcome}</span>}
          </article>
        ))}
      </div>
      <form className="composer" onSubmit={submit} aria-label="CAD request composer">
        {turns.length === 0 && <div className="starter-list" aria-label="Example prompts">{starters.map((starter, index) => <button key={starter} type="button" onClick={() => setMessage(starter)} className={index === 0 ? "starter-primary" : ""}>{starter}</button>)}</div>}
        <label htmlFor="cad-message">Describe a part or revise the current model</label>
        <textarea id="cad-message" ref={composerRef} value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={keyDown} rows={3} maxLength={12_000} disabled={active || !available} placeholder={available ? "Include dimensions and units…" : "Local CAD runtime unavailable"} />
        <div className="composer-actions">
          <span>Ctrl/⌘ + Enter to send</span>
          {active ? <button type="button" className="button-danger" onClick={onCancel}>Stop request</button> : <button type="submit" className="button-primary" disabled={!message.trim() || !available}>Send request</button>}
        </div>
        {!active && turns.at(-1)?.outcome === "failed" && <button type="button" className="retry-button" onClick={onRetry} disabled={!available}>Retry last request</button>}
      </form>
    </section>
  );
}
