import type { JSX } from "react";
import { localEditionOrigin } from "@theoryfoundry/runtime";
import { notFound } from "next/navigation";
import { LocalSetup } from "../../features/local-setup/browser/index";
export const dynamic = "force-dynamic";
export default function LocalSetupPage(): JSX.Element {
  if (!localEditionOrigin()) notFound();
  return (
    <main className="auth-shell">
      <section>
        <p className="eyebrow">TheoryFoundry on your computer</p>
        <h1>Set up your local account</h1>
        <p>Your projects and account are stored in this local instance.</p>
        <LocalSetup />
      </section>
    </main>
  );
}
