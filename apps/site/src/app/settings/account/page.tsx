import type { JSX } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@theoryfoundry/runtime";
import { AccountDeletion } from "../../../features/authentication/browser/index";

export default async function AccountPage(): Promise<JSX.Element> {
  const user = await getAuthenticatedUser(await headers());
  if (!user) redirect("/sign-in");
  return (
    <main className="auth-shell">
      <AccountDeletion email={user.email} />
    </main>
  );
}
