"use client";

import { useEffect, useState } from "react";
import { fetchRevisionSource } from "@/lib/browser-renderer";

type SourceState =
  | { status: "idle" | "loading"; source?: undefined }
  | { status: "ready"; source: string }
  | { status: "error"; source?: undefined };

export function ModelSourcePanel({ projectId, revisionId, sourceHash, revisionLabel }: {
  projectId: string;
  revisionId?: string;
  sourceHash?: string;
  revisionLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [sourceState, setSourceState] = useState<SourceState>({ status: "idle" });

  useEffect(() => {
    if (!open || !revisionId || !sourceHash) {
      setSourceState({ status: "idle" });
      return;
    }

    const controller = new AbortController();
    let active = true;
    setSourceState({ status: "loading" });
    void fetchRevisionSource(projectId, revisionId, sourceHash, controller.signal)
      .then((source) => { if (active) setSourceState({ status: "ready", source }); })
      .catch((error: unknown) => {
        if (active && !controller.signal.aborted) setSourceState({ status: "error" });
        void error;
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [open, projectId, revisionId, sourceHash]);

  return (
    <details className="model-source-panel" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>Advanced</summary>
      <div className="model-source-content">
        <div className="model-source-heading">
          <h2>Model code</h2>
          <small>{revisionId ? revisionLabel : "No revision"}</small>
        </div>
        {!revisionId || !sourceHash ? <p>No model code is available until a revision has been created.</p> : null}
        {sourceState.status === "loading" ? <p role="status">Loading verified OpenSCAD source…</p> : null}
        {sourceState.status === "error" ? <p role="alert" className="notice notice-error">The source could not be verified for this revision.</p> : null}
        {sourceState.status === "ready" ? (
          <>
            <div className="model-source-meta"><span>OpenSCAD</span><code title={sourceHash}>{sourceHash?.slice(0, 12)}…</code></div>
            <pre tabIndex={0} aria-label={`OpenSCAD source for ${revisionLabel}`}><code>{sourceState.source}</code></pre>
          </>
        ) : null}
      </div>
    </details>
  );
}
