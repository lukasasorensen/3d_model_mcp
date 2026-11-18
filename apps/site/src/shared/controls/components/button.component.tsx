import type { ComponentPropsWithRef, JSX, ReactNode } from "react";

export type ButtonProps = Omit<
  ComponentPropsWithRef<"button">,
  "aria-label" | "title"
> & {
  accessibleLabel?: string;
  icon?: ReactNode;
};

export function Button({
  accessibleLabel,
  icon,
  className,
  type = "button",
  children,
  ...props
}: ButtonProps): JSX.Element {
  return (
    <button
      {...props}
      type={type}
      className={
        [icon && "button-with-icon", className].filter(Boolean).join(" ") ||
        undefined
      }
      aria-label={accessibleLabel}
      title={accessibleLabel}
    >
      {icon && (
        <span className="button-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      {children}
    </button>
  );
}
