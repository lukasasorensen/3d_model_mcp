import type { JSX } from "react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getAuthenticatedUser, isSystemAdmin } from "@theoryfoundry/runtime";
import { invitationStore } from "@/invitations.composition";
import { InvitationPanel } from "@/features/authentication/browser/index";

export default async function InvitationsPage(): Promise<JSX.Element> {
  const user = await getAuthenticatedUser(await headers());
  if (!user) redirect("/sign-in");
  if (!isSystemAdmin(user.id)) notFound();
  const invitations = await invitationStore().list(user.id);
  return (
    <main className="auth-shell">
      <section className="connected-apps">
        <header className="connected-apps-heading">
          <div>
            <p className="eyebrow">System administration</p>
            <h1>Invitations</h1>
          </div>
          <a href="/projects">Your projects</a>
        </header>
        <p>
          Create a seven-day invitation and share the link privately with its
          recipient.
        </p>
        <InvitationPanel
          invitations={invitations.map((invite) => ({
            ...invite,
            expiresAt: invite.expiresAt.toISOString(),
          }))}
        />
      </section>
    </main>
  );
}
