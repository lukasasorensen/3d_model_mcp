import type { JSX } from "react";
import { remoteMcpEnabled } from "@theoryfoundry/runtime";
import { notFound } from "next/navigation";
import { OAuthConsent } from "../../features/authentication/browser/index";

export const dynamic = "force-dynamic";

export default function ConsentPage(): JSX.Element {
  if (!remoteMcpEnabled()) notFound();
  return (
    <main className="auth-shell">
      <OAuthConsent />
    </main>
  );
}
