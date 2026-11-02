"use client";
import type { JSX } from "react";

import { useState } from "react";
import { submitOAuthAction } from "../services/oauthNavigation.service";

export function OAuthConsent(): JSX.Element {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const submit = async (accept: boolean): Promise<void> => {
    if (pending) return;
    setError("");
    setPending(true);
    try {
      await submitOAuthAction("oauth2/consent", { accept });
    } catch {
      setError("Authorization failed. Restart the login from Codex.");
      setPending(false);
    }
  };
  return (
    <section className="oauth-consent">
      <h1>Allow Codex to access your CAD projects?</h1>
      <p>
        Codex can read source, propose and validate models, promote or restore
        revisions, and request export metadata for all projects you own. It
        cannot access another account’s projects.
      </p>
      <p>
        Validation requires the project to be open in a visible browser tab.
        Access can be revoked in Connected Apps.
      </p>
      <div className="consent-actions">
        <button
          type="button"
          className="button-primary"
          disabled={pending}
          onClick={() => void submit(true)}
        >
          Allow access
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => void submit(false)}
        >
          Deny
        </button>
      </div>
      <p role="status">{pending ? "Submitting your choice…" : ""}</p>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
