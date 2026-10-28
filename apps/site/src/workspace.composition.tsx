"use client";
import type { ComponentProps } from "react";
import { browserRenderer } from "./browserRenderer.composition";
import { BrowserRendererContext } from "./features/browser-rendering/browser/index";
import { ModelWorkspace } from "./features/workspace/browser/index";
export function BrowserWorkspace(props: ComponentProps<typeof ModelWorkspace>) {
  return (
    <BrowserRendererContext.Provider value={browserRenderer}>
      <ModelWorkspace {...props} />
    </BrowserRendererContext.Provider>
  );
}
