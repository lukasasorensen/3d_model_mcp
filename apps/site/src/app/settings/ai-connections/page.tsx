import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { JSX } from "react";
import { getAuthenticatedUser } from "@theoryfoundry/runtime";
import { AiConnections } from "../../../features/chat/browser/index";
import { LOCAL_WORKER_PACKAGE_VERSION } from "@theoryfoundry/contracts";
export default async function AiConnectionsPage(): Promise<JSX.Element> {
  const user = await getAuthenticatedUser(await headers());
  if (!user) redirect("/sign-in");
  return (
    <main className="auth-shell">
      <AiConnections
        account={user.id}
        origin={
          process.env.THEORYFOUNDRY_ALLOWED_ORIGIN ?? "http://localhost:3000"
        }
        workerVersion={LOCAL_WORKER_PACKAGE_VERSION}
      />
    </main>
  );
}
