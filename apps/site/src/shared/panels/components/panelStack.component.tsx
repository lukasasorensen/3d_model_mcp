import type { JSX, ReactNode } from "react";
export function PanelStack({ children }: { children: ReactNode }): JSX.Element {
  return <div className="panel-stack">{children}</div>;
}
