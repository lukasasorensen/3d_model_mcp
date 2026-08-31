"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function ConnectedApps({ grants }: { grants: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const revoke = async (id: string) => {
    setPending(true); setError("");
    try {
      const response = await fetch(`/v1/oauth/grants/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("revocation failed");
      router.refresh();
    } catch { setError("Access could not be revoked. Please retry."); }
    finally { setPending(false); }
  };
  return <section><h1>Connected Apps</h1><p>Revoking access blocks new requests and token refreshes. An operation already in progress may finish.</p>
    {grants.length === 0 ? <p>No connected apps.</p> : grants.map((grant) => <p key={grant.id}>{grant.name}{" "}<button disabled={pending} onClick={() => void revoke(grant.id)}>Revoke access</button></p>)}
    {error && <p role="alert">{error}</p>}<a href="/projects">Back to projects</a></section>;
}
