import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("workspace preserves accessible landmarks, live region, restore copy, and inspection-only controls", async () => {
  const stylesheet = new URL("../src/app/styles.css", import.meta.url);
  const cssImports = [
    ...(await readFile(stylesheet, "utf8")).matchAll(/@import "([^"]+)";/g),
  ];
  const styles = Promise.all(
    cssImports.map(([, file]) => {
      assert.ok(file);
      return readFile(new URL(file, stylesheet), "utf8");
    }),
  ).then((parts) => parts.join("\n"));
  const [workspace, chat, history, viewer, sourcePanel, css] =
    await Promise.all([
      readFile(
        new URL(
          "../src/features/workspace/browser/components/modelWorkspace.component.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../src/features/chat/browser/components/chatPane.component.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../src/features/workspace/browser/components/revisionHistory.component.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../src/features/model-preview/browser/components/modelViewer.component.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../src/features/model-preview/browser/components/modelSourcePanel.component.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
      styles,
    ]);
  assert.match(workspace, /<header className="app-header"/);
  assert.match(workspace, /aria-live="polite"/);
  assert.match(workspace, /className="project-selector"/);
  assert.match(
    workspace,
    /<option value="stl">STL<\/option>\s*<option value="glb">GLB<\/option>/,
  );
  assert.match(chat, /role="feed"/);
  assert.match(chat, /Ctrl\/⌘ \+ Enter/);
  assert.match(chat, /aria-expanded={!collapsed}/);
  assert.match(chat, /aria-controls="conversation-content"/);
  assert.match(chat, /Minimize chat panel/);
  assert.match(history, /Restore as a new revision/);
  assert.match(viewer, /3D model inspection/);
  assert.doesNotMatch(
    viewer,
    /TransformControls|DragControls|selection handle|edit geometry/i,
  );
  assert.match(sourcePanel, /<details\s+className="model-source-panel"/);
  assert.match(sourcePanel, /OpenSCAD source for/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /forced-colors: active/);
  assert.match(css, /workspace-grid\.chat-collapsed/);
});
