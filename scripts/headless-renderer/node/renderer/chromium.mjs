/* global document */
import { chromium } from "playwright";
import { startAssetServer } from "../services/asset-server.mjs";

export async function startChromiumRenderer(directory) {
  const server = await startAssetServer(directory);
  let browser;
  try {
    browser = await chromium.launch({ headless: true, chromiumSandbox: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
    const context = await browser.newContext({ serviceWorkers: "block" });
    const blockedRequests = [];
    await context.route("**/*", route => {
      if (new URL(route.request().url()).origin === server.origin) return route.continue();
      blockedRequests.push(route.request().url()); return route.abort();
    });
    const page = await context.newPage();
    await page.goto(server.origin);
    await page.waitForFunction(() => Boolean(globalThis.cadProof));
    const info = await page.evaluate(() => {
      const gl = document.createElement("canvas").getContext("webgl2");
      if (!gl) throw new Error("Headless WebGL2 is unavailable.");
      const debug = gl.getExtension("WEBGL_debug_renderer_info");
      const renderer = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      return { renderer, provenance: globalThis.cadProof.provenance };
    });
    return { info: { ...info, browserVersion: browser.version(), sandbox: true }, requests: server.requests, blockedRequests,
      render(input) { return page.evaluate(input => globalThis.cadProof.render(input), input); },
      async close() { try { await browser.close(); } finally { await server.close(); } },
    };
  } catch (error) {
    try { await browser?.close(); } finally { await server.close(); }
    throw error;
  }
}
