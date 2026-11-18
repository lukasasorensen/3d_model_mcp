import { useEffect, useId, useRef, useState, type JSX } from "react";
import { layerNameSchema } from "../../objectLayers.schema";

export function LayerNameField({
  initialName,
  disabled,
  onFinish,
  value,
  onChange,
}: {
  initialName: string;
  disabled: boolean;
  onFinish(name?: string): void;
  value?: string | undefined;
  onChange?(name: string): void;
}): JSX.Element {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const hint = useId();
  useEffect(() => {
    input.current?.select();
  }, []);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (disabled) return;
        const result = layerNameSchema.safeParse(value ?? name);
        if (result.success) onFinish(result.data);
        else
          setError(
            result.error.issues[0]?.message ?? "Enter a valid object name.",
          );
      }}
    >
      <input
        ref={input}
        disabled={disabled}
        aria-label={`Rename ${initialName}`}
        maxLength={100}
        value={value ?? name}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? hint : undefined}
        onChange={(event) => {
          if (onChange) onChange(event.target.value);
          else setName(event.target.value);
          setError("");
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onFinish();
          }
        }}
      />
      {error && (
        <small id={hint} role="alert">
          {error}
        </small>
      )}
    </form>
  );
}
