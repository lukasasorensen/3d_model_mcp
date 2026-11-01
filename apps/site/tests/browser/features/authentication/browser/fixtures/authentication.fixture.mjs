import { build } from "esbuild";
import { root, applicationStyles } from "../../../../browser.fixture.mjs";

export async function mountAuthentication(page, component, width) {
  const controls = { mode: "failure", gate: null, requests: [] };
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const consent = component === "OAuthConsent";
  await page.route("**/*", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.isNavigationRequest())
      return route.fulfill({
        contentType: "text/html",
        body:
          path === "/authorized"
            ? "<h1>Authorization complete</h1>"
            : '<main id="root" class="auth-shell"></main>',
      });
    const expected = consent
      ? "/api/auth/oauth2/consent"
      : "/api/auth/sign-in/email";
    if (path !== expected) throw new Error(`Unexpected request: ${path}`);
    controls.requests.push({
      path,
      method: request.method(),
      body: request.postDataJSON(),
    });
    await controls.gate;
    if (controls.mode === "failure")
      return route.fulfill({
        status: 401,
        json: { message: "Fixture failure" },
      });
    if (controls.mode === "network") return route.abort("failed");
    return route.fulfill({
      json: consent ? { url: "/authorized" } : { redirect: false },
    });
  });
  const stem = consent ? "oauthConsent" : "signInForm";
  const result = await build({
    stdin: {
      contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {${component}} from './src/features/authentication/browser/components/${stem}.component';window.navigation=[];createRoot(document.getElementById('root')).render(${consent ? "<OAuthConsent/>" : "<section><h1>Sign in</h1><SignInForm/></section>"});`,
      resolveDir: root + "/apps/site",
      loader: "tsx",
    },
    bundle: true,
    write: false,
    jsx: "automatic",
    plugins: [
      {
        name: "navigation-boundary",
        setup(b) {
          b.onResolve({ filter: /^next\/navigation$/ }, () => ({
            path: "navigation",
            namespace: "fixture",
          }));
          b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            contents: `export function useRouter(){return {replace(path){window.navigation.push({type:'replace',path})},refresh(){window.navigation.push({type:'refresh'})}}}`,
          }));
        },
      },
    ],
  });
  await page.setViewportSize({ width, height: 900 });
  await page.goto(
    "https://example.test/" +
      (consent
        ? "consent?sig=fixture-signature&redirect_uri=https%3A%2F%2Funtrusted.invalid"
        : "sign-in"),
  );
  await page.addStyleTag({ content: await applicationStyles() });
  await page.addScriptTag({ content: result.outputFiles[0].text });
  return { controls, errors };
}
