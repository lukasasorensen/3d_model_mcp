import { BROWSER_RENDERER, CAD_LIMITS, type Diagnostic } from "@theoryfoundry/contracts";

export interface BrowserCadRendererOptions {
  createWorker: () => Worker;
  assetsOrigin: () => string;
}

function diagnosticsFrom(lines: string[], failed: boolean): Diagnostic[] {
  const bounded = lines.slice(-CAD_LIMITS.diagnosticCount).map((message) => ({
    code: failed ? "OPENSCAD_ERROR" as const : "OPENSCAD_MESSAGE" as const,
    severity: failed ? "error" as const : "info" as const,
    message: message.slice(0, CAD_LIMITS.diagnosticMessageCharacters),
  }));
  return failed && bounded.length === 0 ? [{ code: "OPENSCAD_FAILED", severity: "error", message: "OpenSCAD did not produce a usable model." }] : bounded;
}

export function createOpenScadRenderer(options: BrowserCadRendererOptions) {
  return async function renderOpenScad(source: string, format: "stl" | "3mf", signal?: AbortSignal): Promise<{ bytes: Uint8Array; diagnostics: Diagnostic[] }> {
    signal?.throwIfAborted();
    const worker = options.createWorker();
    return new Promise((resolve, reject) => {
      const timeout = globalThis.setTimeout(() => finish(() => reject(new Error("Browser rendering timed out."))), BROWSER_RENDERER.timeoutMs);
      const abort = () => finish(() => reject(new DOMException("Rendering was cancelled.", "AbortError")));
      const finish = (complete: () => void) => {
        globalThis.clearTimeout(timeout);
        signal?.removeEventListener("abort", abort);
        worker.terminate();
        complete();
      };
      signal?.addEventListener("abort", abort, { once: true });
      worker.onerror = () => finish(() => reject(new Error("The browser OpenSCAD worker failed.")));
      worker.onmessage = (event: MessageEvent<{ ok: boolean; bytes?: Uint8Array; diagnostics?: string[]; message?: string; failureKind?: "operational" | "model" }>) => {
        const diagnostics = diagnosticsFrom(event.data.diagnostics ?? [], !event.data.ok);
        if (!event.data.ok || !event.data.bytes) finish(() => reject(Object.assign(new Error(event.data.message ?? "OpenSCAD rejected the model."), { diagnostics, failureKind: event.data.failureKind ?? "operational" })));
        else {
          const limit = format === "stl" ? CAD_LIMITS.previewBytes : CAD_LIMITS.exportBytes;
          if (event.data.bytes.byteLength > limit) finish(() => reject(new Error("Rendered output exceeds the browser artifact limit.")));
          else finish(() => resolve({ bytes: event.data.bytes!, diagnostics }));
        }
      };
      try { worker.postMessage({ source, format, origin: options.assetsOrigin() }); }
      catch (error) { finish(() => reject(error)); }
    });
  };
}
