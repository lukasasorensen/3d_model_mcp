import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
const root = fileURLToPath(new URL("../../", import.meta.url));
const result = await build({
  stdin: {
    contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {ModelWorkspace} from './src/features/workspace/browser/components/modelWorkspace.component'; createRoot(document.getElementById('root')).render(<ModelWorkspace projectId="sample"/>);`,
    resolveDir: root + "/apps/site",
    loader: "tsx",
  },
  bundle: true,
  write: false,
  jsx: "automatic",
  plugins: [
    {
      name: "preview-fixtures",
      setup(b) {
        b.onLoad({ filter: /useModelWorkspace\.hook\.ts$/ }, () => ({
          loader: "ts",
          contents: `import {useState,useRef} from 'react'; export function useModelWorkspace(){const [chatCollapsed,setChatCollapsed]=useState(false);const [exportFormat,setExportFormat]=useState('stl');const [exportState,setExportState]=useState('idle');return {router:{push(){}},isSidebarChatEnabled:true,state:{revisions:[],turns:[],selectedRevision:null,currentRevision:null,active:false},dispatch(){},readiness:'ready',exportState,setExportState,exportFormat,setExportFormat,projects:[{projectId:'sample',name:'Long project name — adjustable mounting bracket for workshop equipment'}],chatCollapsed,setChatCollapsed,restorePending:false,previewLoadState:'error',setPreviewLoadState(){},abortRef:useRef(null),composerRef:useRef(null),lastMessage:useRef(''),sessionId:'sample',isMcpRendering:false,submit(){},restore(){},currentLabel:'No revision',selectedLabel:'No revision',promotionPending:false,dimensions:'—',readinessLabel:'Ready',currentBadgeLabel:'No current revision',exportCurrent(){}}}`,
        }));
        b.onResolve({ filter: /^next\/dynamic$/ }, () => ({
          path: "dynamic",
          namespace: "fixture",
        }));
        b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
          resolveDir: root + "/apps/site",
          loader: "tsx",
          contents: `import React from 'react'; export default function dynamic(){return function Viewer(){return <div className="viewer-shell"><div className="empty-model"><h2>No model yet</h2><p>Create a model to begin inspecting it.</p></div></div>}}`,
        }));
      },
    },
  ],
});
const css = await readFile(root + "/apps/site/src/app/styles.css", "utf8");
let styles = "";
for (const [, p] of css.matchAll(/@import "(.+)"/g))
  styles += await readFile(root + "/apps/site/src/app/" + p, "utf8");
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setContent(
    "<html><head><style>" +
      styles +
      '</style></head><body><div id="root"></div></body></html>',
  );
  await page.addScriptTag({ content: result.outputFiles[0].text });
  await page.setViewportSize({ width: 390, height: 844 });
  const nav = page.getByRole("navigation", { name: "Workspace sections" });
  await nav.getByRole("button", { name: "Details", exact: true }).click();
  await page.getByRole("button", { name: "View model", exact: true }).focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    () => document.activeElement.id === "workspace-model-button",
  );
  console.log(
    "Focus after error recovery:",
    await page.evaluate(() => ({
      tag: document.activeElement.tagName,
      text: document.activeElement.textContent?.slice(0, 50),
    })),
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("textbox").focus();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(
    () => document.activeElement.id === "workspace-model-button",
  );
  console.log(
    "Focus after resize:",
    await page.evaluate(() => ({
      tag: document.activeElement.tagName,
      id: document.activeElement.id,
      visible: document.activeElement.getClientRects().length > 0,
    })),
  );
} finally {
  await browser.close();
}
