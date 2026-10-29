import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server.js";
import { getDefineEnv } from "next/dist/build/define-env.js";
import { defaultConfig } from "next/dist/server/config-shared.js";
import { WORKER_OAUTH_CALLBACK } from "@theoryfoundry/contracts";
import siteConfig from "../next.config.mjs";

test("production Next requests preserve exact OAuth loopback callbacks", () => {
  // Apply the same compile-time setting Next derives from the site's config.
  const definitions = getDefineEnv({
    config: { ...defaultConfig, ...siteConfig },
    dev: false,
    distDir: ".next",
    projectPath: process.cwd(),
    isNodeServer: true,
    isClient: false,
    isEdgeServer: false,
    isTurbopack: false,
    rewrites: { beforeFiles: [], afterFiles: [], fallback: [] },
  });
  const key = "__NEXT_NO_MIDDLEWARE_URL_NORMALIZE";
  const previous = process.env[key];
  if (definitions[`process.env.${key}`] === "true") process.env[key] = "1";
  else delete process.env[key];
  try {
    for (const origin of [
      "https://cad.example.com",
      "http://0.0.0.0:3000",
      "http://127.0.0.1:3000",
    ]) {
      for (const callback of [
        WORKER_OAUTH_CALLBACK,
        WORKER_OAUTH_CALLBACK.replace(":43827", ":43828"),
        "http://127.0.0.1/callback",
      ]) {
        const url = new URL("/api/auth/oauth2/authorize", origin);
        url.search = new URLSearchParams({
          client_id: "theoryfoundry-local-worker",
          redirect_uri: callback,
          state: "opaque-127.0.0.1-value",
        }).toString();
        const request = new NextRequest(url);
        assert.equal(request.url, url.href);
        assert.equal(
          new URL(request.url).searchParams.get("redirect_uri"),
          callback,
        );
      }
    }
  } finally {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
});
