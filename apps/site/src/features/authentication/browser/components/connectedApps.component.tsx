"use client";
import { useId, useRef, useState, type JSX } from "react";
import { useRouter } from "next/navigation";
import { ConnectToCodex } from "../../../onboarding/browser/index";

type Grant = { id: string; name: string };

export function ConnectedApps({
  grants,
  codexOrigin,
}: {
  grants: Grant[];
  codexOrigin: string;
}): JSX.Element {
  const router = useRouter();
  const heading = useRef<HTMLHeadingElement>(null);
  const headingId = useId();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [revoked, setRevoked] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const visibleGrants = grants.filter((grant) => !revoked.includes(grant.id));
  const revoke = async (grant: Grant): Promise<void> => {
    if (pendingId !== null) return;
    setPendingId(grant.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/v1/oauth/grants/${encodeURIComponent(grant.id)}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error("revocation failed");
      setRevoked((previous) => [...previous, grant.id]);
      setNotice(`Access revoked for ${grant.name}.`);
      heading.current?.focus();
      router.refresh();
    } catch {
      setError("Access could not be revoked. Please retry.");
    } finally {
      setPendingId(null);
    }
  };
  return (
    <section className="connected-apps" aria-labelledby={headingId}>
      <header className="connected-apps-heading">
        <div>
          <a href="/projects">Back to projects</a>
          <h1 ref={heading} id={headingId} tabIndex={-1}>
            Connected apps
          </h1>
        </div>
        <ConnectToCodex origin={codexOrigin} />
      </header>
      <p className="connected-apps-help">
        Revoking access blocks new requests and token refreshes. An operation
        already in progress may finish.
      </p>
      <p role="status" className="connected-apps-status">
        {notice}
      </p>
      {error && (
        <p role="alert" className="auth-error">
          {error}
        </p>
      )}
      {visibleGrants.length === 0 ? (
        <p className="connected-apps-empty">No connected apps.</p>
      ) : (
        <ul className="connected-apps-list">
          {visibleGrants.map((grant) => (
            <li key={grant.id}>
              <strong>{grant.name}</strong>
              <button
                type="button"
                disabled={pendingId !== null}
                aria-label={`${pendingId === grant.id ? "Revoking" : "Revoke"} access for ${grant.name}`}
                onClick={() => void revoke(grant)}
              >
                {pendingId === grant.id ? "Revoking…" : "Revoke access"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
