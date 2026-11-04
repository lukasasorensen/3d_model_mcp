import { build } from "esbuild";
import { root } from "../../../../browser.fixture.mjs";

export async function mountInvitation(page, component, props) {
  const stem = component[0].toLowerCase() + component.slice(1);
  const bundle = await build({
    stdin: {
      contents: `import React from 'react';import {createRoot} from 'react-dom/client';
        import {${component}} from './src/features/authentication/browser/components/${stem}.component';
        createRoot(document.querySelector('main')).render(React.createElement(${component},${JSON.stringify(props)}));`,
      resolveDir: root + "/apps/site",
      loader: "tsx",
    },
    bundle: true,
    write: false,
    jsx: "automatic",
    plugins: [
      {
        name: "router",
        setup(b) {
          b.onResolve({ filter: /^next\/navigation$/ }, () => ({
            path: "router",
            namespace: "fixture",
          }));
          b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            contents: "export function useRouter(){return {refresh(){}}}",
          }));
        },
      },
    ],
  });
  await page.route("https://example.test/invite", (route) =>
    route.fulfill({ contentType: "text/html", body: "<main></main>" }),
  );
  await page.goto("https://example.test/invite#fixture-token");
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
}
