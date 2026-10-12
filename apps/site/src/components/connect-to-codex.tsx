"use client";

import { useId, useRef, useState } from "react";
import { codexConnectCommand, codexStarterPrompt, type CodexConnectionScope } from "@/lib/codex-connect-command";

export function ConnectToCodex({ origin, projectId }: { origin: string; projectId?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const commandId = useId();
  const [scope, setScope] = useState<CodexConnectionScope>("global");
  const [notice, setNotice] = useState("");
  const command = codexConnectCommand(origin, scope);
  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); setNotice(`${label} copied.`); }
    catch { setNotice("Clipboard unavailable. Select and copy the text below."); }
  }
  return <>
    <button type="button" onClick={() => { setNotice(""); dialog.current?.showModal(); }}>Connect to Codex</button>
    <dialog ref={dialog} className="codex-connect-dialog" aria-labelledby={titleId}>
      <h2 id={titleId}>Connect to Codex</h2>
      <p>Run this command in a macOS or Linux terminal with Node.js 22+ and the Codex CLI installed. Then sign in and approve CAD access in your browser.</p>
      <label>Install for <select value={scope} onChange={(event) => { setScope(event.target.value as CodexConnectionScope); setNotice(""); }}>
        <option value="global">All Codex projects (global)</option>
        <option value="project">This repository</option>
      </select></label>
      {scope === "project" ? <p>Run from the root of your local Git repository. Trust the repository in Codex to load its settings. This controls where the connection is available; it does not restrict access to one CAD project.</p>
        : <p>Uses your Codex home configuration, including a custom CODEX_HOME if set.</p>}
      <label htmlFor={commandId}>Setup command</label>
      <textarea id={commandId} readOnly value={command} rows={6} spellCheck={false} />
      <button type="button" onClick={() => void copy(command, "Setup command")}>Copy command</button>
      <p>The command downloads the installer from this site, backs up changed configuration, and adds the connection. Existing conflicting settings require manual review.</p>
      <p>After authorization, restart Codex or start a fresh session. Keep your CAD project tab visible during rendering.</p>
      {projectId && <div><p>Once connected, paste this into Codex:</p><pre>{codexStarterPrompt(projectId)}</pre><button type="button" onClick={() => void copy(codexStarterPrompt(projectId), "Starter prompt")}>Copy starter prompt</button></div>}
      <p role="status" aria-live="polite">{notice}</p>
      <form method="dialog"><button type="submit">Close</button></form>
    </dialog>
  </>;
}
