import type { JSX } from "react";
import { AcceptInvitation } from "@/features/authentication/browser/index";

export const dynamic = "force-dynamic";
export default function InvitePage(): JSX.Element {
  return (
    <main className="auth-shell">
      <section>
        <p className="eyebrow">TheoryFoundry</p>
        <h1>Accept invitation</h1>
        <AcceptInvitation />
      </section>
    </main>
  );
}
