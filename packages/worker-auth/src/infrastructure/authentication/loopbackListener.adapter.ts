import { WorkerAuthError } from "../../shared/utils/authenticationError.util.js";
import { createServer } from "node:http";
import { WORKER_OAUTH_CALLBACK } from "@theoryfoundry/contracts";
import { type AuthorizationListener } from "../../domains/authentication/index.js";
export async function createLoopbackListener(
  state: string,
  issuer: string,
): Promise<AuthorizationListener> {
  const callback = new URL(WORKER_OAUTH_CALLBACK);
  let resolveCode!: (code: string) => void;
  let rejectCode!: (error: Error) => void;
  const promise = new Promise<string>((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });
  const result = { promise, resolve: resolveCode, reject: rejectCode };
  // A browser can complete before wait() attaches, including a denial.
  void result.promise.catch(() => undefined);
  let completed = false;
  const server = createServer(
    { maxHeaderSize: 8192, requestTimeout: 5000, headersTimeout: 5000 },
    (request, response) => {
      response.setHeader("cache-control", "no-store");
      response.setHeader("connection", "close");
      response.setHeader("content-type", "text/plain; charset=utf-8");
      response.setHeader(
        "content-security-policy",
        "default-src 'none'; frame-ancestors 'none'",
      );
      response.setHeader("referrer-policy", "no-referrer");
      let url: URL;
      try {
        url = new URL(request.url ?? "/", callback.origin);
      } catch {
        response.writeHead(400).end("Invalid authorization callback.");
        return;
      }
      const params = url.searchParams;
      if (
        completed ||
        request.method !== "GET" ||
        request.headers.host !== callback.host ||
        url.origin !== callback.origin ||
        url.pathname !== callback.pathname ||
        params.getAll("state").length !== 1 ||
        params.get("state") !== state ||
        params.getAll("iss").length !== 1 ||
        params.get("iss") !== issuer ||
        request.headers.origin
      ) {
        response.writeHead(400).end("Invalid authorization callback.");
        return;
      }
      if (
        params.has("error") ||
        params.getAll("code").length !== 1 ||
        !params.get("code") ||
        params.get("code")!.length > 2048
      ) {
        completed = true;
        result.reject(
          new WorkerAuthError(
            "AUTHORIZATION_DENIED",
            "Authorization was denied or invalid. Run worker login again.",
          ),
        );
        response.writeHead(400).end("Authorization was not completed.");
        return;
      }
      completed = true;
      result.resolve(params.get("code")!);
      response.end(
        "Authorization received. Return to the worker to finish signing in.",
      );
    },
  );
  server.maxConnections = 8;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(Number(callback.port), "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  }).catch(() => {
    throw new WorkerAuthError(
      "CALLBACK_UNAVAILABLE",
      "Worker login callback port 43827 is unavailable. Close the other login and retry.",
    );
  });
  return {
    async wait(signal): Promise<string> {
      const deadline = AbortSignal.any([
        AbortSignal.timeout(180_000),
        ...(signal ? [signal] : []),
      ]);
      const abort = (): void =>
        result.reject(
          new WorkerAuthError(
            "LOGIN_CANCELLED",
            "Worker login was cancelled or timed out.",
          ),
        );
      deadline.addEventListener("abort", abort, { once: true });
      if (deadline.aborted) abort();
      try {
        return await result.promise;
      } finally {
        deadline.removeEventListener("abort", abort);
      }
    },
    async close(): Promise<void> {
      completed = true;
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
