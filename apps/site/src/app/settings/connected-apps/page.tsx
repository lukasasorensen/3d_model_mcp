import { getAuthenticatedUser, getProjectDatabase, listOAuthGrants, remoteMcpEnabled } from "@rjls/runtime";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ConnectedApps } from "@/components/connected-apps";
export const dynamic = "force-dynamic";

export default async function ConnectedAppsPage() {
  if (!remoteMcpEnabled()) notFound();
  const user = await getAuthenticatedUser(await headers());
  if (!user) redirect("/sign-in");
  return <main className="auth-shell"><ConnectedApps grants={await listOAuthGrants(getProjectDatabase().pool, user.id)} /></main>;
}
