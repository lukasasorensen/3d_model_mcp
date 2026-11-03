import { chromium } from "playwright";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// Run only against a disposable local site with public signup disabled.
const origin = new URL(process.env.INVITATION_TEST_ORIGIN);
if (!["localhost", "127.0.0.1"].includes(origin.hostname))
  throw new Error("A local test site is required.");
const base = origin.origin;
const { INVITATION_TEST_ADMIN_EMAIL, INVITATION_TEST_ADMIN_PASSWORD } =
  process.env;
if (!INVITATION_TEST_ADMIN_EMAIL || !INVITATION_TEST_ADMIN_PASSWORD)
  throw new Error("Supply the test administrator email and password.");
const email = `invited-${randomUUID()}@example.test`;
const password = randomUUID();
const browser = await chromium.launch();
async function signIn(page, email, password) {
  await page.goto(base + "/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("heading", { name: "Your projects" }).waitFor();
}
try {
  const admin = await browser.newContext({
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const recipient = await browser.newContext();
  admin.setDefaultTimeout(30000);
  recipient.setDefaultTimeout(30000);
  const adminPage = await admin.newPage();
  const memberPage = await recipient.newPage();
  const manage = base + "/v1/admin/invitations";
  const redeem = base + "/v1/invitations/accept";
  const headers = { origin: base };
  assert.equal((await recipient.request.get(manage)).status(), 401);
  await memberPage.goto(base + "/admin/invitations");
  await memberPage.waitForURL(base + "/sign-in");
  const signup = await recipient.request.post(
    base + "/api/auth/sign-up/email",
    { headers, data: { email, password, name: "Recipient" } },
  );
  assert.equal(signup.status(), 400);
  assert.equal((await signup.json()).code, "EMAIL_PASSWORD_SIGN_UP_DISABLED");
  await signIn(
    adminPage,
    INVITATION_TEST_ADMIN_EMAIL,
    INVITATION_TEST_ADMIN_PASSWORD,
  );
  await adminPage.getByRole("link", { name: "Invitations" }).click();
  assert.equal(
    (
      await admin.request.post(manage, {
        headers: { origin: "https://elsewhere.invalid" },
        data: { email },
      })
    ).status(),
    403,
  );
  await adminPage.getByLabel("Recipient email").fill(email);
  const [issueResponse] = await Promise.all([
    adminPage.waitForResponse(
      (response) =>
        response.url() === manage && response.request().method() === "POST",
    ),
    adminPage.getByRole("button", { name: "Create invitation" }).click(),
  ]);
  assert.equal(issueResponse.status(), 200);
  await adminPage.getByRole("button", { name: "Copy link" }).click();
  await adminPage.getByText("Link copied.", { exact: true }).waitFor();
  const link = await adminPage.evaluate(() => navigator.clipboard.readText());
  assert.ok(link.startsWith(base + "/invite#"));
  await memberPage.goto(link);
  const list = await admin.request.get(manage);
  assert.match(list.headers()["cache-control"], /no-store/);
  assert.equal(
    (await list.json()).find((i) => i.email === email).status,
    "pending",
  );
  await memberPage.getByLabel("Name", { exact: true }).fill("Invited user");
  await memberPage.getByLabel("Password").fill(password);
  await memberPage.getByRole("button", { name: "Create account" }).click();
  await memberPage.getByRole("link", { name: "Sign in" }).waitFor();
  assert.equal(new URL(memberPage.url()).hash, "");
  await signIn(memberPage, email, password);
  assert.equal(
    await memberPage.getByRole("link", { name: "Invitations" }).count(),
    0,
  );
  const pageResponse = await memberPage.goto(base + "/admin/invitations");
  assert.equal(pageResponse.status(), 404);
  for (const method of ["GET", "POST", "DELETE"]) {
    assert.equal(
      (await recipient.request.fetch(manage, { method, headers })).status(),
      403,
    );
  }
  const replay = {
    token: new URL(link).hash.slice(1),
    name: "Replay",
    password,
  };
  assert.equal(
    (await recipient.request.post(redeem, { headers, data: replay })).status(),
    410,
  );
  const issued = await admin.request.post(manage, {
    headers,
    data: { email: `race-${randomUUID()}@example.test` },
  });
  const concurrent = {
    ...replay,
    token: new URL((await issued.json()).link).hash.slice(1),
  };
  assert.equal(
    (
      await recipient.request.post(redeem, {
        headers: { origin: "https://elsewhere.invalid" },
        data: concurrent,
      })
    ).status(),
    403,
  );
  const attempts = await Promise.all(
    [1, 2].map(() =>
      recipient.request.post(redeem, { headers, data: concurrent }),
    ),
  );
  assert.deepEqual(attempts.map((r) => r.status()).sort(), [200, 410]);
  console.log(
    "Passed invitation browser journey, access controls, disabled signup and simultaneous PostgreSQL redemption.",
  );
} finally {
  await browser.close();
}
