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
  onPointerEnter,
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

  return (
    <Button
      {...props}
      className={["icon-button", revealLabel && "icon-button-reveal", className]
        .filter(Boolean)
        .join(" ")}
      accessibleLabel={label}
      icon={<Icon size="1.125em" focusable="false" />}
      onFocus={(event) => {
        setDismissed(false);
        onFocus?.(event);
      }}
      onPointerEnter={(event) => {
        setDismissed(false);
        onPointerEnter?.(event);
      }}
    >
      {revealLabel && (
        <span
          className="icon-button-label"
          aria-hidden="true"
          data-dismissed={dismissed || undefined}
        >
          {revealLabel}
        </span>
      )}
    </Button>
  );
}
