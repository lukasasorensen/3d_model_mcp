"use client";
import {
  useEffect,
  useId,
  useState,
  type JSX,
  type ReactNode,
  type RefObject,
} from "react";

import { PanelActions } from "./panelActions.component";

export type PanelProps = {
  title: string;
  children: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  busy?: boolean;
  dirty?: boolean;
  error?: object | string | null | undefined;
  errorFocusRef?: RefObject<HTMLDivElement | null>;
};

export function Panel({
  title,
  children,
  description,
  actions,
  busy = false,
  dirty = false,
  error,
  errorFocusRef,
}: PanelProps): JSX.Element {
  const id = useId();
  const titleId = `${id}-title`;
  const bodyId = `${id}-body`;
  const statusId = `${id}-status`;
  const [disclosure, setDisclosure] = useState<{
    collapsed: boolean;
    observedError: PanelProps["error"];
  }>({ collapsed: false, observedError: undefined });
  // Record clears as well as failures, so an identical retry error opens before focus.
  if (error !== disclosure.observedError) {
    setDisclosure({
      collapsed: error ? false : disclosure.collapsed,
      observedError: error,
    });
  }
  const expanded = !disclosure.collapsed;
  useEffect(() => {
    if (error) errorFocusRef?.current?.focus();
  }, [error, errorFocusRef]);
  const hasStatus = busy || dirty || Boolean(error);
  return (
    <section className="panel" aria-labelledby={titleId}>
      <h2 className="panel-heading">
        <button
          type="button"
          className="panel-toggle"
          aria-labelledby={titleId}
          aria-describedby={hasStatus ? statusId : undefined}
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={() =>
            setDisclosure({ collapsed: expanded, observedError: error })
          }
        >
          <span id={titleId}>{title}</span>
          <span aria-hidden="true">{expanded ? "−" : "+"}</span>
        </button>
      </h2>
      {hasStatus && (
        <div id={statusId} className="panel-indicators">
          {dirty && <span>Unsaved changes</span>}
          {busy && <span>Working</span>}
          {Boolean(error) && <span>Error</span>}
        </div>
      )}
      <div
        id={bodyId}
        className="panel-body"
        hidden={!expanded}
        inert={!expanded}
        aria-busy={busy}
      >
        {description && <div className="panel-description">{description}</div>}
        {children}
        {actions && <PanelActions>{actions}</PanelActions>}
      </div>
    </section>
  );
}
