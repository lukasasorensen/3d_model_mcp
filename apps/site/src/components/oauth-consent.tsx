"use client";
import { useState } from "react";
import { submitOAuthAction } from "@/lib/oauth-navigation";

export function OAuthConsent() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const submit = async (accept: boolean) => {
    setPending(true);
    try { await submitOAuthAction("oauth2/consent", { accept }); }
    catch { setError("Authorization failed. Restart the login from Codex."); setPending(false); }
  };
  return <section><h1>Allow Codex to access your CAD projects?</h1>
    <p>Codex can read source, propose and validate models, promote or restore revisions, and request export metadata for all projects you own. It cannot access another account’s projects.</p>
    <p>Validation requires the project to be open in a visible browser tab. Access can be revoked in Connected Apps.</p>
    <button disabled={pending} onClick={() => void submit(true)}>Allow access</button>{" "}
    <button disabled={pending} onClick={() => void submit(false)}>Deny</button>
    {error && <p role="alert">{error}</p>}</section>;
}
