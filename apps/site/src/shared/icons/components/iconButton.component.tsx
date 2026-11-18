"use client";
import { useEffect, useState, type JSX } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Button,
  type ButtonProps,
} from "../../controls/components/button.component";

type IconButtonProps = Omit<
  ButtonProps,
  "children" | "accessibleLabel" | "icon" | "aria-labelledby"
> & {
  icon: LucideIcon;
  label: string;
  revealLabel?: string;
};

export function IconButton({
  icon: Icon,
  label,
  revealLabel,
  className,
  onFocus,
  ...props
}: IconButtonProps): JSX.Element {
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (!revealLabel) return;
    function dismiss(event: KeyboardEvent): void {
      if (event.key === "Escape") setDismissed(true);
    }
    document.addEventListener("keydown", dismiss, true);
    return (): void => document.removeEventListener("keydown", dismiss, true);
  }, [revealLabel]);

  const button = (
    <Button
      {...props}
      className={className ? `icon-button ${className}` : "icon-button"}
      accessibleLabel={label}
      icon={<Icon size="1.125em" focusable="false" />}
      onFocus={(event) => {
        setDismissed(false);
        onFocus?.(event);
      }}
    >
      {revealLabel && (
        <span className="icon-button-touch-label" aria-hidden="true">
          {revealLabel}
        </span>
      )}
    </Button>
  );
  if (!revealLabel) return button;

  return (
    <span
      className="icon-button-reveal"
      onPointerEnter={() => setDismissed(false)}
      data-dismissed={dismissed || undefined}
    >
      {button}
      <span className="icon-button-label" aria-hidden="true">
        <span>{revealLabel}</span>
      </span>
    </span>
  );
}
