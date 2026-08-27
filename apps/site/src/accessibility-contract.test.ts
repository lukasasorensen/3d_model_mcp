import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("workspace preserves accessible landmarks, live region, restore copy, and inspection-only controls", async () => {
  const [workspace, chat, history, viewer, sourcePanel, css] = await Promise.all([
    readFile(new URL("./components/ModelWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("./components/ChatPane.tsx", import.meta.url), "utf8"),
    readFile(new URL("./components/RevisionHistory.tsx", import.meta.url), "utf8"),
    readFile(new URL("./components/ModelViewer.tsx", import.meta.url), "utf8"),
    readFile(new URL("./components/ModelSourcePanel.tsx", import.meta.url), "utf8"),
    readFile(new URL("./app/styles.css", import.meta.url), "utf8"),
  ]);
  assert.match(workspace, /<header className="app-header"/);
  assert.match(workspace, /aria-live="polite"/);
  assert.match(workspace, /className="project-selector"/);
  assert.match(workspace, /<option value="stl">STL<\/option><option value="glb">GLB<\/option>/);
  assert.match(chat, /role="feed"/);
  assert.match(chat, /Ctrl\/⌘ \+ Enter/);
  assert.match(chat, /aria-expanded={!collapsed}/);
  assert.match(chat, /aria-controls="conversation-content"/);
  assert.match(chat, /Minimize chat panel/);
  assert.match(history, /Restore as a new revision/);
  assert.match(viewer, /3D model inspection/);
  assert.doesNotMatch(viewer, /TransformControls|DragControls|selection handle|edit geometry/i);
  assert.match(sourcePanel, /<details className="model-source-panel"/);
  assert.match(sourcePanel, /OpenSCAD source for/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /forced-colors: active/);
  assert.match(css, /workspace-grid\.chat-collapsed/);
});
