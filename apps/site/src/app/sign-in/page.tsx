import type { JSX } from "react";
import { getAuthenticatedUser } from "@theoryfoundry/runtime";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignInForm } from "../../features/authentication/browser/index";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  const user = await getAuthenticatedUser(await headers());
  if (user && !(await searchParams).sig) redirect("/projects");
  return (
    <main className="auth-shell">
      <section>
        <p className="eyebrow">TheoryFoundry Conversational CAD</p>
        <h1>Sign in</h1>
        <p>Access your authoritative CAD projects and revision history.</p>
        <SignInForm />
      </section>
    </main>
  );
}
