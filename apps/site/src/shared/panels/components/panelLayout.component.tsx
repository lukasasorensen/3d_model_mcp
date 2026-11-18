import type { JSX, ReactNode } from "react";
export function PanelLayout({
  main,
  panels,
}: {
  main: ReactNode;
  panels: ReactNode;
}): JSX.Element {
  return (
    <div className="panel-layout">
      <div className="panel-layout-grid">
        <div className="panel-layout-main">{main}</div>
        <div className="panel-layout-panels">{panels}</div>
      </div>
    </div>
  );
}
