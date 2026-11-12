"use client";
import { useEffect, useState, type FormEvent, type JSX } from "react";
export function LocalSetup(): JSX.Element {
  const [token, setToken] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setToken(new URLSearchParams(location.hash.slice(1)).get("token") ?? "");
    history.replaceState(null, "", location.pathname);
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/v1/local-setup", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-theoryfoundry-setup": token,
        },
        body: JSON.stringify({
          name: data.get("name"),
          email: data.get("email"),
          password: data.get("password"),
        }),
      });
      if (response.ok) {
        location.assign("/projects");
        return;
      }
      setError(
        response.status === 409
          ? "Setup is complete. Sign in with your existing local account."
          : "Setup could not complete. Reopen setup from the local CLI and try again.",
      );
    } catch {
      setError("The local application could not be reached.");
    } finally {
      setPending(false);
    }
  }
  return (
    <form
      className="auth-form"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <label>
        Name
        <input name="name" autoComplete="name" required maxLength={200} />
      </label>
      <label>
        Email
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        Password
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={256}
        />
      </label>
      {error ? (
        <p role="alert" className="auth-error">
          {error}
        </p>
      ) : null}
      <button disabled={!token || pending} type="submit">
        {pending ? "Creating account…" : "Create local account"}
      </button>
      <a href="/sign-in">Sign in to an existing account</a>
    </form>
  );
}
