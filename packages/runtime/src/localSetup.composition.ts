import { createConfiguredAuth } from "./configuredAuth.composition.js";
import { getProjectDatabase } from "./database.composition.js";
import {
  localSetupHandler,
  LocalSetupService,
} from "./features/local-setup/index.js";
import { localEditionOrigin } from "./shared/utils/localEditionPolicy.util.js";
export async function handleLocalSetup(request: Request): Promise<Response> {
  const origin = localEditionOrigin();
  if (!origin)
    return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  const database = getProjectDatabase();
  const service = new LocalSetupService(database.pool, (body) =>
    createConfiguredAuth(database, { bootstrap: true }).api.signUpEmail({
      body,
      asResponse: true,
    }),
  );
  return localSetupHandler(
    origin,
    process.env.THEORYFOUNDRY_LOCAL_SETUP_TOKEN,
    service,
  )(request);
}
export { localEditionOrigin } from "./shared/utils/localEditionPolicy.util.js";
