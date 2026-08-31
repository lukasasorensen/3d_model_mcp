import { remoteMcpEnabled } from "@rjls/runtime";
import { notFound } from "next/navigation";
import { OAuthConsent } from "@/components/oauth-consent";

export const dynamic = "force-dynamic";

export default function ConsentPage() {
  if (!remoteMcpEnabled()) notFound();
  return <main className="auth-shell"><OAuthConsent /></main>;
}
