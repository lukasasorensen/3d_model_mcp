import { createDataErasure } from "@theoryfoundry/model-project";
import { getAuth, getAuthenticatedUser } from "./auth.composition.js";
import { getProjectDatabase } from "./database.composition.js";

export async function deleteOwnAccount(
  headers: Headers,
  password: string,
): Promise<"deleted" | "unauthenticated" | "unconfirmed"> {
  const actor = await getAuthenticatedUser(headers);
  if (!actor) return "unauthenticated";
  const verification = await getAuth().api.verifyPassword({
    headers,
    body: { password },
    asResponse: true,
  });
  if (!verification.ok) {
    if ([400, 401, 403].includes(verification.status)) return "unconfirmed";
    throw new Error("Account verification unavailable.");
  }
  await createDataErasure(getProjectDatabase().pool).erase({
    ownerId: actor.id,
    projectId: null,
  });
  return "deleted";
}
