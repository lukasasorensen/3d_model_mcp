/** WebGL materials read the same color tokens as the surrounding editor. */
export function readCadViewportColors(element: HTMLElement): {
  model: string;
  selectedModel: string;
  gridAxis: string;
  gridLine: string;
} {
  const style = getComputedStyle(element);
  return {
    model: style.getPropertyValue("--model").trim(),
    selectedModel: style.getPropertyValue("--accent-contrast").trim(),
    gridAxis: style.getPropertyValue("--line-strong").trim(),
    gridLine: style.getPropertyValue("--surface-3").trim(),
  };
}
