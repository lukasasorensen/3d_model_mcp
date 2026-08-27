import { getAuthenticatedUser } from "@rjls/runtime";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/SignInForm";

export default async function SignInPage() {
  const user = await getAuthenticatedUser(await headers()).catch(() => null);
  if (user) redirect("/projects");
  return <main className="auth-shell"><section><p className="eyebrow">RJLS Conversational CAD</p><h1>Sign in</h1><p>Access your authoritative CAD projects and revision history.</p><SignInForm /></section></main>;
}
