# Inviting platform users

Apply the database migrations with `pnpm db:migrate`. Set
`THEORYFOUNDRY_SYSTEM_ADMIN_USER_IDS` to a comma-separated list of existing Better
Auth user IDs in the site environment (Coolify or local `apps/site/.env.local`).
Restart the site after changing the list. An empty list disables panel access.
The operator account provisioning command prints the new account’s ID. For an
existing account, look up its ID by email in the auth database. Set
`THEORYFOUNDRY_ALLOWED_ORIGIN` to the public site origin so links point to the
correct host. Keep public sign-up disabled.

Sign in as a listed admin, open **Invitations** on **Your projects**, enter the
recipient’s email and select **Create invitation**. Copy the link while it is
visible and share it privately. Anyone who obtains it can create that account.
The link expires after seven days. Use **Replace** to invalidate the old link
and copy a fresh one, or **Revoke** to cancel a pending invitation.

The recipient opens the link, chooses their name and password, then signs in
using the invited email. Opening the link alone leaves it usable. Acceptance
creates a regular account and leaves its email verification status unset.

## Local acceptance

Against a disposable localhost site with migrations applied, public signup
disabled and a test admin configured, set `INVITATION_TEST_ORIGIN`,
`INVITATION_TEST_ADMIN_EMAIL`, and `INVITATION_TEST_ADMIN_PASSWORD` in the
test process. Run `node tooling/testing/invitationsAcceptance.script.mjs`
with the pinned Node version. The journey creates disposable accounts and checks
real sign-in, authorization, replay and simultaneous redemption.
