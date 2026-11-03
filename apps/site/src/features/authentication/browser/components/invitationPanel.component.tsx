"use client";
import { useEffect, useState, type JSX } from "react";
import { useRouter } from "next/navigation";
interface InvitationRow {
  id: string;
  email: string;
  creator: string;
  expiresAt: string;
  status: string;
}

interface IssuedInvitation {
  id: string;
  email: string;
  link: string;
}

export function InvitationPanel({
  invitations,
}: {
  invitations: InvitationRow[];
}): JSX.Element {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [issued, setIssued] = useState<IssuedInvitation>();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  async function copyLink(): Promise<void> {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.link);
      setMessage("Link copied.");
    } catch {
      setMessage("Select the invitation link and copy it manually.");
    }
  }
  async function change(
    method: "POST" | "DELETE",
    body: Record<string, string>,
  ): Promise<void> {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/v1/admin/invitations", {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await res.json()) as {
        id?: string;
        email?: string;
        link?: string;
        error?: { message?: string };
      };
      if (!res.ok) {
        setMessage(result.error?.message ?? "Unable to update invitations.");
        return;
      }
      if (result.link && result.id && result.email) {
        setIssued({ id: result.id, email: result.email, link: result.link });
        setEmail("");
      } else if (method === "DELETE" && body.id === issued?.id) {
        setIssued(undefined);
      }
      setMessage(
        result.link
          ? "Invitation ready. Copy the link now to share it."
          : "Invitation revoked.",
      );
      router.refresh();
    } catch {
      setMessage(
        "Unable to update invitations. Refresh to check the current status.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <form
        className="auth-form"
        method="post"
        onSubmit={(e) => {
          e.preventDefault();
          void change("POST", { email });
        }}
      >
        <label>
          Recipient email
          <input
            disabled={!ready}
            type="email"
            required
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <button className="button-primary" disabled={!ready || busy}>
          Create invitation
        </button>
      </form>
      <p role="status" className="connected-apps-status">
        {message}
      </p>
      {issued && (
        <div className="auth-form">
          <label>
            Invitation link for {issued.email}
            <input
              readOnly
              value={issued.link}
              onFocus={(e) => e.target.select()}
            />
          </label>
          <button
            type="button"
            onClick={() => {
              void copyLink();
            }}
          >
            Copy link
          </button>
        </div>
      )}
      <h2>Invitation history</h2>
      {!invitations.length ? (
        <p>No invitations yet.</p>
      ) : (
        <ul className="connected-apps-list">
          {invitations.map((row) => (
            <li key={row.id}>
              <div>
                <strong>{row.email}</strong>
                <p>
                  {row.status} · Created by {row.creator}
                </p>
                <p>
                  Expires{" "}
                  <time dateTime={row.expiresAt}>
                    {row.expiresAt.slice(0, 16).replace("T", " ")} UTC
                  </time>
                </p>
              </div>
              {row.status === "pending" && (
                <>
                  <button
                    disabled={!ready || busy}
                    onClick={() => {
                      void change("POST", {
                        email: row.email,
                        replaceId: row.id,
                      });
                    }}
                  >
                    Replace
                  </button>
                  <button
                    disabled={!ready || busy}
                    onClick={() => {
                      void change("DELETE", { id: row.id });
                    }}
                  >
                    Revoke
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
