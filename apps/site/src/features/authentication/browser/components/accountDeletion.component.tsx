"use client";
import { useEffect, useState, type FormEvent, type JSX } from "react";
export function AccountDeletion({ email }: { email: string }): JSX.Element {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function erase(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      const response = await fetch("/v1/account", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          password: data.get("password"),
          confirmation: data.get("confirmation"),
        }),
      });
      if (response.ok || response.status === 401) {
        window.location.replace("/sign-in");
        return;
      }
      setError(
        response.status === 403
          ? "Check your password or sign in again, then retry."
          : "Deletion could not be confirmed. Please try again.",
      );
    } catch {
      setError("Deletion could not be confirmed. Please try again.");
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="auth-card">
      <a href="/projects">Back to projects</a>
      <h1>Account settings</h1>
      <h2>Delete your account</h2>
      <p>
        Deleting {email} permanently removes your projects, their history, and
        hosted exports. You will be signed out on every device and connected
        apps will lose access.
      </p>
      <form
        className="auth-form"
        method="post"
        onSubmit={(event) => {
          void erase(event);
        }}
      >
        <label>
          Current password
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            disabled={pending}
          />
        </label>
        <label>
          Type DELETE to confirm
          <input
            name="confirmation"
            pattern="DELETE"
            autoComplete="off"
            required
            disabled={pending}
          />
        </label>
        {error && (
          <p role="alert" className="auth-error">
            {error}
          </p>
        )}
        <button
          className="project-delete"
          disabled={!ready || pending}
          type="submit"
        >
          {pending ? "Deleting…" : "Permanently delete account"}
        </button>
      </form>
    </section>
  );
}
