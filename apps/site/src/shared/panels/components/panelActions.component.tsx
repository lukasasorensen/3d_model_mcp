import type { JSX, ReactNode } from "react";
export function PanelActions({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  return <div className="panel-actions">{children}</div>;
}
