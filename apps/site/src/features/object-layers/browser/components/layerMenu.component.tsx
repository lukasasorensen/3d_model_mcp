"use client";
import { useId, useLayoutEffect, useRef, useState, type JSX } from "react";
import { createPortal } from "react-dom";
import { IconButton, MoreIcon } from "../../../../shared/icons/index";

interface LayerMenuProps {
  label: string;
  disabled: boolean;
  first: boolean;
  last: boolean;
  rename(): void;
  move(offset: number): void;
}
export function LayerMenu({
  label,
  disabled,
  first,
  last,
  rename,
  move,
}: LayerMenuProps): JSX.Element {
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  const [open, setOpen] = useState(false);
  function close(): void {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }
  useLayoutEffect(() => {
    if (!open || !menu.current || !trigger.current) return;
    const anchor = trigger.current;
    const popup = menu.current;
    function position(): void {
      if (!anchor.getClientRects().length) {
        close();
        return;
      }
      const rect = anchor.getBoundingClientRect();
      const gap = 4;
      const maxX =
        document.documentElement.clientWidth - popup.offsetWidth - gap;
      popup.style.left =
        Math.max(
          gap,
          rect.right + gap <= maxX
            ? rect.right + gap
            : Math.min(rect.right - popup.offsetWidth, maxX),
        ) + "px";
      const y = rect.right + gap <= maxX ? rect.top : rect.bottom + gap;
      popup.style.top =
        Math.max(
          gap,
          Math.min(y, window.innerHeight - popup.offsetHeight - gap),
        ) + "px";
    }
    function outside(event: Event): void {
      if (
        event.target instanceof Node &&
        !popup.contains(event.target) &&
        !anchor.contains(event.target)
      )
        close();
    }
    position();
    popup.querySelector("button")?.focus({ preventScroll: true });
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("scroll", position, true);
    window.addEventListener("resize", position);
    return (): void => {
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("scroll", position, true);
      window.removeEventListener("resize", position);
    };
  }, [open]);
  return (
    <>
      <IconButton
        ref={trigger}
        icon={MoreIcon}
        label={`Actions for ${label}`}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      />
      {open &&
        !disabled &&
        createPortal(
          <div
            ref={menu}
            id={id}
            className="layer-menu"
            role="menu"
            aria-label={`Actions for ${label}`}
            onKeyDown={(event) => {
              const items = Array.from(
                menu.current!.querySelectorAll<HTMLButtonElement>(
                  "button:enabled",
                ),
              );
              const index = items.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              switch (event.key) {
                case "Escape":
                  event.preventDefault();
                  event.stopPropagation();
                  close();
                  break;
                case "Tab":
                  close();
                  break;
                case "ArrowDown":
                case "ArrowUp":
                  event.preventDefault();
                  items[
                    (index +
                      (event.key === "ArrowUp" ? -1 : 1) +
                      items.length) %
                      items.length
                  ]?.focus();
                  break;
                case "Home":
                case "End":
                  event.preventDefault();
                  items[event.key === "Home" ? 0 : items.length - 1]?.focus();
                  break;
              }
            }}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                close();
                rename();
              }}
            >
              Rename
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={first}
              onClick={() => {
                close();
                move(-1);
              }}
            >
              Move up
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={last}
              onClick={() => {
                close();
                move(1);
              }}
            >
              Move down
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
