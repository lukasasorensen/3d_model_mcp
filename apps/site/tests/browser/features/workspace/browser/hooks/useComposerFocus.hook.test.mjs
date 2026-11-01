/* global document, window */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { test, root } from "../../../../browser.fixture.mjs";

test("completion preserves keyboard ownership and revision action names", async ({
  page,
}) => {
  const result = await build({
    stdin: {
      contents: `import React,{useRef,useState} from 'react';import {createRoot} from 'react-dom/client';import {useComposerFocus} from './src/features/workspace/browser/hooks/useComposerFocus.hook';import {RevisionHistory} from './src/features/workspace/browser/components/revisionHistory.component';function Harness(){const [active,setActive]=useState(false);const [hidden,setHidden]=useState(false);const composer=useRef(null);window.setActive=setActive;window.setHidden=setHidden;useComposerFocus(active,true,composer);return <><textarea aria-label="Composer" ref={composer} disabled={active} hidden={hidden}/><button>Other action</button><RevisionHistory revisions={[{revisionId:'r2'},{revisionId:'r1'}]} currentRevision="r2" selectedRevision="r1" disabled={false} onSelect={()=>{}} onRestore={()=>{}}/></>};createRoot(document.getElementById('root')).render(<Harness/>);`,
      resolveDir: root + "/apps/site",
      loader: "tsx",
    },
    bundle: true,
    write: false,
    jsx: "automatic",
  });
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({ content: result.outputFiles[0].text });
  const composer = page.getByRole("textbox", { name: "Composer" });
  await composer.focus();
  await page.evaluate(() => window.setActive(true));
  await page.waitForFunction(() => document.querySelector("textarea").disabled);
  await page.evaluate(() => window.setActive(false));
  await page.waitForFunction(
    () => document.activeElement === document.querySelector("textarea"),
  );
  await page.evaluate(() => window.setActive(true));
  await page.waitForFunction(() => document.querySelector("textarea").disabled);
  const other = page.getByRole("button", { name: "Other action" });
  await other.focus();
  await page.evaluate(() => window.setActive(false));
  await page.waitForFunction(
    () => !document.querySelector("textarea").disabled,
  );
  assert.equal(
    await other.evaluate((el) => el === document.activeElement),
    true,
  );
  await page.evaluate(() => {
    window.setActive(true);
    window.setHidden(true);
  });
  await page.waitForFunction(() => document.querySelector("textarea").hidden);
  await page.evaluate(() => {
    document.activeElement.blur();
    window.setActive(false);
  });
  await page.waitForFunction(
    () => !document.querySelector("textarea").disabled,
  );
  assert.equal(
    await page.evaluate(() => document.activeElement.tagName),
    "BODY",
  );
  await page.locator("summary").click();
  assert.equal(
    await page
      .getByRole("button", {
        name: "Restore R1 as a new revision",
        exact: true,
      })
      .count(),
    1,
  );
  console.log(
    "PASS: completion restores unclaimed focus, preserves other controls, skips hidden composer, and names revision restore actions",
  );
});
