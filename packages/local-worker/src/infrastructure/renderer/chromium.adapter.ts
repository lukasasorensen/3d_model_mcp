import { existsSync } from "node:fs";
import { chromium, type Browser, type Page } from "playwright";
import {
  CAD_LIMITS,
  HEADLESS_RENDER_LIMITS,
  headlessRenderInputSchema,
  headlessRenderResultSchema,
  rendererProvenanceSchema,
  type RendererProvenance,
  type HeadlessRenderInput,
  type HeadlessRenderResult,
} from "@theoryfoundry/contracts";
import type { WorkerRenderer } from "../../domains/compute/index.js";
import { LocalWorkerError } from "../../shared/utils/workerError.util.js";
type AssetHost = { origin: string; close(): Promise<void> };
interface Instance {
  browser: Browser;
  page: Page;
  close(): Promise<void>;
}
interface Bridge {
  render(input: HeadlessRenderInput): Promise<HeadlessRenderResult>;
  provenance: unknown;
}
async function start(
  startAssets: () => Promise<AssetHost>,
  provenanceExpected: RendererProvenance,
  signal: AbortSignal,
): Promise<Instance> {
  const assets = await startAssets();
  let browser: Browser | undefined;
  let closing: Promise<void> | undefined;
  const close = (): Promise<void> =>
    (closing ??= (async (): Promise<void> => {
      try {
        await browser?.close();
      } finally {
        await assets.close();
      }
    })());
  const cancel = (): void => {
    if (browser) void close().catch(() => undefined);
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    signal.throwIfAborted();
    browser = await chromium.launch({
      headless: true,
      chromiumSandbox: true,
      timeout: HEADLESS_RENDER_LIMITS.startupMs,
      args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    });
    signal.throwIfAborted();
    const context = await browser.newContext({
      serviceWorkers: "block",
      acceptDownloads: false,
    });
    await context.route("**/*", (route) =>
      new URL(route.request().url()).origin === assets.origin
        ? route.continue()
        : route.abort(),
    );
    const page = await context.newPage();
    await page.goto(assets.origin, {
      timeout: HEADLESS_RENDER_LIMITS.startupMs,
    });
    await page.waitForFunction("Boolean(globalThis.cadProof)", undefined, {
      timeout: HEADLESS_RENDER_LIMITS.startupMs,
    });
    const provenance = rendererProvenanceSchema.parse(
      await page.evaluate(
        () =>
          (globalThis as unknown as { cadProof: Bridge }).cadProof.provenance,
      ),
    );
    if (JSON.stringify(provenance) !== JSON.stringify(provenanceExpected))
      throw new LocalWorkerError(
        "RENDERER_INCOMPATIBLE",
        "Worker bridge and renderer versions differ. Rebuild worker assets.",
      );
    signal.throwIfAborted();
    return { browser, page, close };
  } catch (error) {
    await close();
    throw error;
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}
export function createChromiumRenderer(
  directory: URL,
  provenance: RendererProvenance,
  startAssets: () => Promise<AssetHost>,
): WorkerRenderer {
  let instance: Instance | undefined;
  let starting: Promise<Instance> | undefined;
  const stopping = new AbortController();
  let rendering = false;
  return {
    provenance,
    available: () =>
      !stopping.signal.aborted &&
      existsSync(chromium.executablePath()) &&
      existsSync(new URL("proof.js", directory)),
    async render(raw, signal): Promise<HeadlessRenderResult> {
      if (rendering)
        throw new LocalWorkerError(
          "WORKER_BUSY",
          "A local render is already running.",
        );
      const active = AbortSignal.any([
        signal,
        stopping.signal,
        AbortSignal.timeout(HEADLESS_RENDER_LIMITS.operationMs),
      ]);
      active.throwIfAborted();
      const input = headlessRenderInputSchema.parse(raw);
      if (Buffer.byteLength(input.source) > CAD_LIMITS.sourceBytes)
        throw new LocalWorkerError(
          "SOURCE_TOO_LARGE",
          "Source exceeds the UTF-8 byte limit.",
        );
      rendering = true;
      let current: Instance | undefined;
      const cancel = (): void => {
        if (current) void current.close().catch(() => undefined);
      };
      try {
        if (!instance) {
          if (
            !existsSync(chromium.executablePath()) ||
            !existsSync(new URL("proof.js", directory))
          )
            throw new LocalWorkerError(
              "WORKER_SETUP_REQUIRED",
              "Run setup for this worker version. If packaged assets are missing, reinstall the package; repository users must also build worker assets.",
            );
          starting = start(startAssets, provenance, active);
          instance = await starting;
        }
        current = instance;
        active.addEventListener("abort", cancel, { once: true });
        active.throwIfAborted();
        const value = await current.page.evaluate(
          (value) =>
            (globalThis as unknown as { cadProof: Bridge }).cadProof.render(
              value,
            ),
          input,
        );
        active.throwIfAborted();
        return headlessRenderResultSchema.parse(value);
      } catch (error) {
        await (current ?? instance)?.close().catch(() => undefined);
        instance = undefined;
        active.throwIfAborted();
        if (error instanceof LocalWorkerError) throw error;
        throw new LocalWorkerError(
          "RENDER_FAILED",
          "Local Chromium failed. Check worker prerequisites and retry.",
        );
      } finally {
        active.removeEventListener("abort", cancel);
        starting = undefined;
        rendering = false;
      }
    },
    async close(): Promise<void> {
      stopping.abort();
      const current = instance ?? (await starting?.catch(() => undefined));
      await current?.close();
      instance = undefined;
    },
  };
}
