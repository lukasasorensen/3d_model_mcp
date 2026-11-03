import { getAuthenticatedUser } from "@theoryfoundry/runtime";
import { headers } from "next/headers";
import type { JSX } from "react";
import { AcceptInvitation } from "@/features/authentication/browser/index";

export const dynamic = "force-dynamic";
export default async function InvitePage(): Promise<JSX.Element> {
  const user = await getAuthenticatedUser(await headers());
  return (
    <main className="auth-shell">
      <section>
        <p className="eyebrow">TheoryFoundry</p>
        <h1>Accept invitation</h1>
        <AcceptInvitation signedInEmail={user?.email ?? null} />
      </section>
    </main>
  );
}
