"use client";
import { useEffect, useState, type JSX, type FormEvent } from "react";

export function AcceptInvitation(): JSX.Element {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  async function accept(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const token = window.location.hash.slice(1);
    if (!token) {
      setMessage("Open the complete invitation link from your administrator.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/v1/invitations/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token,
          name: data.get("name"),
          password: data.get("password"),
        }),
      });
      const result = (await res.json()) as {
        email?: string;
        error?: { message?: string };
      };
      if (!res.ok || !result.email) {
        setMessage(
          result.error?.message ?? "Unable to accept this invitation.",
        );
        return;
      }
      window.history.replaceState(null, "", "/invite");
      form.reset();
      setEmail(result.email);
    } catch {
      setMessage("Unable to reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  if (email)
    return (
      <>
        <p>
          Your account is ready. Sign in using {email} and the password you
          chose.
        </p>
        <a href="/sign-in">Sign in</a>
      </>
    );
  return (
    <form
      className="auth-form"
      method="post"
      onSubmit={(e) => {
        void accept(e);
      }}
    >
      <p>Choose a name and password for your invited account.</p>
      <label>
        Name
        <input autoComplete="name" name="name" maxLength={200} required />
      </label>
      <label>
        Password
        <input
          autoComplete="new-password"
          name="password"
          type="password"
          required
        />
      </label>
      {message && (
        <p role="alert" className="auth-error">
          {message}
        </p>
      )}
      <button className="button-primary" disabled={!ready || busy}>
        {busy ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
