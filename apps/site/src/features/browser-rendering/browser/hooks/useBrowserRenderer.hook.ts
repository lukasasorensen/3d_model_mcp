"use client";
import { createContext, useContext } from "react";
import type { BrowserRenderer } from "../browserRenderer.port";
export const BrowserRendererContext = createContext<
  BrowserRenderer | undefined
>(undefined);
export function useBrowserRenderer(): BrowserRenderer {
  const renderer = useContext(BrowserRendererContext);
  if (!renderer) throw new Error("Browser renderer composition is missing.");
  return renderer;
}
