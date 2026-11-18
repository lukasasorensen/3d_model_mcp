"use client";
import { useId, type JSX } from "react";
import type { ProjectParameter } from "@theoryfoundry/contracts";

export function ParameterField({
  parameter: p,
  value,
  accepted,
  error,
  disabled,
  change,
  onCancel,
}: {
  parameter: ProjectParameter;
  value: string | boolean;
  accepted: ProjectParameter["value"];
  error?: string | undefined;
  disabled: boolean;
  change(value: string | boolean): void;
  onCancel?(): void;
}): JSX.Element {
  const id = useId();
  const numeric = p.type === "number" || p.type === "integer";
  const help = `${id}-help`;
  const errorId = `${id}-error`;
  const props = {
    id,
    disabled,
    "aria-describedby": `${help}${error ? ` ${errorId}` : ""}`,
    "aria-invalid": Boolean(error),
  } as const;
  return (
    <div
      className="parameter-field"
      data-slider={numeric && p.control === "slider" ? "" : undefined}
      onKeyDown={(event) => {
        if (event.key === "Escape" && onCancel && !disabled) {
          event.stopPropagation();
          onCancel();
        }
      }}
    >
      <label htmlFor={id}>
        {p.label}
        {numeric && p.unit ? ` · ${p.unit}` : ""}
      </label>
      {p.type === "boolean" ? (
        <input
          {...props}
          type="checkbox"
          checked={value === true}
          onChange={(e) => change(e.target.checked)}
        />
      ) : p.type === "enum" ? (
        <select
          {...props}
          value={String(value)}
          onChange={(e) => change(e.target.value)}
        >
          {p.options.map((option) => (
            <option key={String(option.value)} value={String(option.value)}>
              {option.label}
            </option>
          ))}
        </select>
      ) : p.type === "string" ? (
        <textarea
          {...props}
          rows={2}
          value={String(value)}
          maxLength={p.maxLength ?? 1024}
          onChange={(e) => change(e.target.value)}
        />
      ) : (
        <input
          {...props}
          type="text"
          inputMode={p.type === "integer" ? "numeric" : "decimal"}
          maxLength={128}
          value={String(value)}
          onChange={(e) => change(e.target.value)}
        />
      )}
      {numeric && p.control === "slider" && (
        <>
          <label className="sr-only" htmlFor={`${id}-slider`}>
            {p.label} slider
          </label>
          <input
            id={`${id}-slider`}
            type="range"
            min={p.min}
            max={p.max}
            step={p.step}
            value={
              Number.isFinite(Number(value)) && String(value).trim()
                ? Number(value)
                : Number(accepted)
            }
            disabled={disabled}
            aria-describedby={props["aria-describedby"]}
            aria-invalid={Boolean(error)}
            onChange={(e) => change(e.target.value)}
          />
        </>
      )}
      <div id={help} className="parameter-help">
        {p.description && <p>{p.description}</p>}
        {numeric && (
          <p>
            {[
              p.min !== undefined ? `Minimum ${p.min}` : "",
              p.max !== undefined ? `Maximum ${p.max}` : "",
              p.step !== undefined ? `Step ${p.step}` : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
        <p>
          Saved: <span className="parameter-value">{String(accepted)}</span> ·
          Default:{" "}
          <span className="parameter-value">{String(p.defaultValue)}</span>
        </p>
      </div>
      {error && (
        <p id={errorId} className="notice-error">
          {error}
        </p>
      )}
    </div>
  );
}
