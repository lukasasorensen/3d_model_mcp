"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";

export function SignInForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const result = await authClient.signIn.email({ email: String(data.get("email") ?? ""), password: String(data.get("password") ?? "") });
      if (result.error) { setError("The email or password was not accepted."); return; }
      router.replace("/projects");
      router.refresh();
    } catch {
      setError("Sign-in is temporarily unavailable. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }
  return (
    <form className="auth-form" onSubmit={submit}>
      <label>Email<input name="email" type="email" autoComplete="email" required /></label>
      <label>Password<input name="password" type="password" autoComplete="current-password" required minLength={8} /></label>
      {error ? <p role="alert" className="auth-error">{error}</p> : null}
      <button type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
      <p>Accounts are invite-only. Ask an administrator to provision access.</p>
    </form>
  );
}
