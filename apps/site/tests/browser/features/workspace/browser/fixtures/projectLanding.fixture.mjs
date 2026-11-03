/* global window */
import { build } from "esbuild";
import { root, applicationStyles } from "../../../../browser.fixture.mjs";

export async function mountProjectLanding(page, width, initialProjects = []) {
  const controls = {
    createMode: "failure",
    signOutMode: "failure",
    signOutGate: null,
    requests: [],
    projects: initialProjects,
    mutationFails: false,
  };
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.isNavigationRequest())
      return route.fulfill({
        contentType: "text/html",
        body: '<div id="root"></div>',
      });
    if (path === "/v1/projects") {
      controls.requests.push({
        path,
        method: request.method(),
        body: request.postDataJSON(),
      });
      if (controls.createMode === "failure")
        return route.fulfill({ status: 500, json: {} });
      if (controls.createMode === "malformed")
        return route.fulfill({ status: 201, json: {} });
      return route.fulfill({
        status: 201,
        json: {
          project: {
            projectId: "new-project",
            name: "Bracket",
            description: "A fixture",
          },
        },
      });
    }
    if (path.startsWith("/v1/projects/")) {
      const id = decodeURIComponent(path.slice("/v1/projects/".length));
      const item = controls.projects.find(
        (project) => project.projectId === id,
      );
      if (!item || controls.mutationFails)
        return route.fulfill({ status: 500 });
      if (request.method() === "DELETE")
        controls.projects = controls.projects.filter(
          (project) => project !== item,
        );
      else if (request.method() === "PATCH")
        item.isArchived = request.postDataJSON().isArchived;
      else throw new Error("Unexpected project mutation.");
      return route.fulfill({ status: 204 });
    }
    if (path === "/api/auth/sign-out") {
      await controls.signOutGate;
      controls.requests.push({ path, method: request.method() });
      if (controls.signOutMode === "network") return route.abort("failed");
      if (controls.signOutMode === "failure")
        return route.fulfill({ status: 500, json: { message: "Unavailable" } });
      return route.fulfill({ json: { success: true } });
    }
    throw new Error(`Unexpected fixture request: ${request.method()} ${path}`);
  });
  const result = await build({
    stdin: {
      contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {ProjectLanding} from './src/features/workspace/browser/components/projectLanding.component';window.navigation=[];createRoot(document.getElementById('root')).render(<ProjectLanding projects={window.projects.filter(p => !p.isArchived)} archivedProjects={window.projects.filter(p => p.isArchived)} userName="Test user" remoteMcpEnabled/>);`,
      resolveDir: root + "/apps/site",
      loader: "tsx",
    },
    bundle: true,
    write: false,
    jsx: "automatic",
    plugins: [
      {
        name: "navigation-boundary",
        setup(b) {
          b.onResolve({ filter: /^next\/navigation$/ }, () => ({
            path: "navigation",
            namespace: "fixture",
          }));
          b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            contents: `export function useRouter(){return {push(path){window.navigation.push({type:'push',path})},replace(path){window.navigation.push({type:'replace',path})},refresh(){window.navigation.push({type:'refresh'})}}}`,
          }));
        },
      },
    ],
  });
  await page.setViewportSize({ width, height: 900 });
  async function render() {
    await page.addStyleTag({ content: await applicationStyles() });
    await page.evaluate((projects) => {
      window.projects = projects;
    }, controls.projects);
    await page.addScriptTag({ content: result.outputFiles[0].text });
  }
  await page.goto("https://example.test/projects");
  await render();
  return {
    controls,
    errors,
    reload: async () => {
      await page.reload();
      await render();
    },
  };
}
