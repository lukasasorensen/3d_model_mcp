"use client";
import {
  useEffect,
  useId,
  useState,
  useRef,
  type JSX,
  type ReactNode,
  type RefObject,
} from "react";

import { createPortal } from "react-dom";
import { CloseIcon, MinusIcon, PlusIcon } from "../../icons/uiIcons.constants";
import { IconButton } from "../../icons/components/iconButton.component";
import { PanelActions } from "./panelActions.component";

export type PanelProps = {
  title: string;
  className?: string;
  floating?:
    | {
        toolbar: HTMLElement | null;
        icon: typeof PlusIcon;
        initiallyOpen?: boolean;
      }
    | undefined;
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
  className = "",
  floating,
  children,
  description,
  actions,
  busy = false,
  dirty = false,
  error,
  errorFocusRef,
}: PanelProps): JSX.Element {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const titleId = `${id}-title`;
  const bodyId = `${id}-body`;
  const statusId = `${id}-status`;
  const [disclosure, setDisclosure] = useState<{
    collapsed: boolean;
    observedError: PanelProps["error"];
  }>({
    collapsed: floating ? !floating.initiallyOpen : false,
    observedError: undefined,
  });
  // Record clears as well as failures, so an identical retry error opens before focus.
  if (error !== disclosure.observedError) {
    setDisclosure({
      collapsed: error ? false : disclosure.collapsed,
      observedError: error,
    });
  }
  const expanded = !disclosure.collapsed;
  const DisclosureIcon = expanded ? MinusIcon : PlusIcon;
  useEffect(() => {
    if (error) errorFocusRef?.current?.focus();
  }, [error, errorFocusRef]);
  const hasStatus = busy || dirty || Boolean(error);
  const close = (): void => {
    setDisclosure({ collapsed: true, observedError: error });
    trigger.current?.focus();
  };
  const toggle = (): void => {
    if (expanded) close();
    else setDisclosure({ collapsed: false, observedError: error });
  };
  const ToggleIcon = floating?.icon ?? DisclosureIcon;
  const button = (
    <button
      type="button"
      ref={trigger}
      className={floating ? "floating-panel-toggle" : "panel-toggle"}
      aria-label={title}
      aria-describedby={hasStatus ? statusId : undefined}
      aria-expanded={expanded}
      aria-controls={floating ? id : bodyId}
      onKeyDown={(event) => {
        if (floating && expanded && event.key === "Escape") {
          event.stopPropagation();
          close();
        }
      }}
      onClick={toggle}
    >
      {floating && (
        <ToggleIcon size="1em" aria-hidden="true" focusable="false" />
      )}
      <span>{title}</span>
      {!floating && (
        <DisclosureIcon size="1em" aria-hidden="true" focusable="false" />
      )}
    </button>
  );
  return (
    <>
      {floating?.toolbar && createPortal(button, floating.toolbar)}
      <section
        id={id}
        className={`panel ${floating ? "floating-panel" : ""} ${className}`}
        aria-labelledby={titleId}
        hidden={Boolean(floating && !expanded)}
        onKeyDown={(event) => {
          if (floating && event.key === "Escape" && !event.defaultPrevented) {
            event.stopPropagation();
            close();
          }
        }}
      >
        <div className="panel-heading-row">
          <h2 className="panel-heading" id={titleId}>
            {floating ? title : button}
          </h2>
          {floating && (
            <IconButton
              icon={CloseIcon}
              label={`Close ${title.toLowerCase()}`}
              onClick={close}
            />
          )}
        </div>
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
          {description && (
            <div className="panel-description">{description}</div>
          )}
          {children}
          {actions && <PanelActions>{actions}</PanelActions>}
        </div>
      </section>
    </>
  );
}
