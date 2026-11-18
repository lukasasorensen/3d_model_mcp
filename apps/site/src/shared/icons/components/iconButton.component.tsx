import type { ComponentPropsWithRef, JSX } from "react";
import type { LucideIcon } from "lucide-react";

type IconButtonProps = Omit<
  ComponentPropsWithRef<"button">,
  "children" | "title" | "aria-label" | "aria-labelledby"
> & {
  icon: LucideIcon;
  label: string;
};

export function IconButton({
  icon: Icon,
  label,
  className,
  type = "button",
  ...props
}: IconButtonProps): JSX.Element {
  return (
    <button
      {...props}
      type={type}
      className={className ? `icon-button ${className}` : "icon-button"}
      aria-label={label}
      title={label}
    >
      <Icon size="1.125em" aria-hidden="true" focusable="false" />
    </button>
  );
}
