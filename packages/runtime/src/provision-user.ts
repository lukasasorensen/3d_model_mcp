import { provisionAuthenticatedUser } from "./auth.js";

const [email, name = "RJLS User"] = process.argv.slice(2).filter((argument) => argument !== "--");
const password = process.env.RJLS_INITIAL_PASSWORD;
if (!email || !password) {
  process.stderr.write("Usage: RJLS_AUTH_ALLOW_SIGNUP=1 RJLS_INITIAL_PASSWORD=... pnpm auth:provision -- email@example.com [name]\n");
  process.exitCode = 1;
} else {
  try {
    const user = await provisionAuthenticatedUser({ email, password, name });
    process.stdout.write(`Provisioned account ${user.email} with user ID ${user.id}.\n`);
  } catch (error) {
    process.stderr.write(`Account provisioning failed: ${error instanceof Error ? error.message : "unknown error"}\n`);
    process.exitCode = 1;
  }
}
