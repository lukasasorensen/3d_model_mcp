import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const site = fileURLToPath(new URL("../../", import.meta.url));
const policy = fileURLToPath(
  new URL("../../../../packages/runtime/src/shared/utils/", import.meta.url),
);

test("server pages pass availability only when both flags are on and preserve remote-off behavior", async () => {
  const directory = await mkdtemp(join(tmpdir(), "connection-pages-"));
  const keys = [
    "THEORYFOUNDRY_REMOTE_MCP_ENABLED",
    "THEORYFOUNDRY_LOCAL_WORKER_ENABLED",
  ];
  const previous = keys.map((key) => process.env[key]);
  try {
    const pages = [];
    for (const [index, path] of [
      "projects/[projectId]",
      "settings/connected-apps",
    ].entries()) {
      const result = await build({
        entryPoints: [join(site, "src/app", path, "page.tsx")],
        bundle: true,
        write: false,
        platform: "node",
        format: "esm",
        jsx: "automatic",
        packages: "external",
        plugins: [
          {
            name: "server-boundaries",
            setup(builder) {
              builder.onResolve(
                {
                  filter:
                    /^(?:@theoryfoundry\/runtime|next\/|@\/workspace)|connectedApps\.component|authentication\/browser\/index/,
                },
                (args) => ({ path: args.path, namespace: "fixture" }),
              );
              builder.onLoad(
                { filter: /.*/, namespace: "fixture" },
                ({ path: target }) => {
                  let contents;
                  if (target === "@theoryfoundry/runtime")
                    contents = `export {localWorkerEnabled} from ${JSON.stringify(join(policy, "localWorkerPolicy.util.ts"))};export {remoteMcpEnabled} from ${JSON.stringify(join(policy, "remoteMcpPolicy.util.ts"))};export function remoteMcpIdentity(){return {origin:'https://example.test'}};export async function getAuthenticatedUser(){return {id:'owner'}};export function getProjectDatabase(){return {pool:{}}};export async function listOAuthGrants(){return []};export async function withConfiguredCadRuntime(owner,operation){return operation({repository:{getProjectState:async()=>({})}})}`;
                  else if (target === "next/headers")
                    contents =
                      "export async function headers(){return new Headers()}";
                  else if (target === "next/navigation")
                    contents =
                      "export function notFound(){throw new Error('NOT_FOUND')};export function redirect(){throw new Error('REDIRECT')}";
                  else
                    contents =
                      "export function BrowserWorkspace(){};export function ConnectedApps(){}";
                  return { contents, loader: "ts", resolveDir: site };
                },
              );
            },
          },
        ],
      });
      const output = join(directory, `page-${index}.mjs`);
      // Resolve React and contracts from the real workspace, while keeping output disposable.
      const code = result.outputFiles[0].text
        .replaceAll(
          'from "react/jsx-runtime"',
          `from ${JSON.stringify(import.meta.resolve("react/jsx-runtime"))}`,
        )
        .replaceAll(
          'from "@theoryfoundry/contracts"',
          `from ${JSON.stringify(import.meta.resolve("@theoryfoundry/contracts"))}`,
        );
      await writeFile(output, code);
      pages.push((await import(pathToFileURL(output).href)).default);
    }
    for (const remote of ["0", "1"])
      for (const worker of ["0", "1"]) {
        process.env[keys[0]] = remote;
        process.env[keys[1]] = worker;
        const workspace = await pages[0]({
          params: Promise.resolve({
            projectId: "00000000-0000-4000-8000-000000000001",
          }),
        });
        assert.equal(
          workspace.props.localWorkerAvailable,
          remote === "1" && worker === "1",
        );
        assert.equal(workspace.props.remoteMcpEnabled, remote === "1");
        assert.equal(
          workspace.props.codexOrigin,
          remote === "1" ? "https://example.test" : undefined,
        );
        if (remote === "0") await assert.rejects(pages[1](), /NOT_FOUND/);
        else {
          const settings = await pages[1]();
          assert.equal(
            settings.props.children.props.localWorkerAvailable,
            worker === "1",
          );
          assert.equal(
            settings.props.children.props.codexOrigin,
            "https://example.test",
          );
        }
      }
  } finally {
    keys.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    });
    await rm(directory, { recursive: true, force: true });
  }
});
