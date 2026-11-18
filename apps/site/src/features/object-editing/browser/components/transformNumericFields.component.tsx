"use client";
import { useLayoutEffect, useId, useRef, useState, type JSX } from "react";
import {
  objectTransformSchema,
  type ObjectTransform,
} from "@theoryfoundry/contracts";
import type { TransformControlsMode } from "three/addons/controls/TransformControls.js";

const AXES = ["X", "Y", "Z"] as const;
const FIELDS = {
  translate: { key: "position", label: "Position", unit: "mm" },
  rotate: { key: "rotation", label: "Rotation", unit: "degrees" },
  scale: { key: "scale", label: "Scale", unit: "factor" },
} as const;

export type TransformInput = {
  values: string[];
  uniform: string;
  error: string;
};

export function TransformNumericFields({
  transform,
  mode,
  disabled,
  onChange,
  onValidityChange,
  input,
  onInputChange,
  onInputFinish,
}: {
  transform: ObjectTransform;
  mode: TransformControlsMode;
  disabled: boolean;
  onChange(transform: ObjectTransform): void;
  onValidityChange?: ((valid: boolean) => void) | undefined;
  input?: TransformInput | undefined;
  onInputChange?(input: TransformInput | undefined): void;
  onInputFinish?(): void;
}): JSX.Element {
  const field = FIELDS[mode];
  const id = useId();
  const [values, setValues] = useState<string[]>(
    transform[field.key].map(String),
  );
  const [uniform, setUniform] = useState(
    transform.scale.every((value) => value === transform.scale[0])
      ? String(transform.scale[0])
      : "",
  );
  const validity = useRef(onValidityChange);
  validity.current = onValidityChange;
  const [x, y, z] = transform[field.key];
  const [error, setError] = useState<string>();
  useLayoutEffect(() => {
    setValues([x, y, z].map(String));
    setUniform(field.key === "scale" && x === y && y === z ? String(x) : "");
    setError(undefined);
    validity.current?.(true);
  }, [x, y, z, field.key]);

  const shownValues = input?.values ?? values;
  const shownUniform = input?.uniform ?? uniform;
  const shownError = onInputChange ? input?.error : error;
  const change = (raw: string, index: number | "uniform"): void => {
    if (index === "uniform") setUniform(raw);
    else
      setValues((current) =>
        current.map((value, axis) => (axis === index ? raw : value)),
      );
    const value = raw.trim() ? Number(raw) : Number.NaN;
    const vector =
      index === "uniform"
        ? [value, value, value]
        : shownValues.map((entry, axis) =>
            axis === index ? value : entry.trim() ? Number(entry) : Number.NaN,
          );
    const next = { ...transform, [field.key]: vector };
    const parsed = objectTransformSchema.safeParse(next);
    if (!parsed.success) {
      const message =
        mode === "scale"
          ? "Enter a finite, positive scale factor within the supported range. Zero and mirrored scales are unsupported."
          : `Enter a finite ${field.label.toLowerCase()} value within the supported range.`;
      setError(message);
      onInputChange?.({
        values: shownValues.map((value, axis) =>
          axis === index ? raw : value,
        ),
        uniform: index === "uniform" ? raw : shownUniform,
        error: message,
      });
      onValidityChange?.(false);
      return;
    }
    setError(undefined);
    onValidityChange?.(true);
    onChange(parsed.data);
    if (input) onInputChange?.(undefined);
  };
  return (
    <fieldset
      className="object-transform-fields"
      disabled={disabled}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          onInputFinish?.();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && input && !disabled) {
          event.stopPropagation();
          setValues(transform[field.key].map(String));
          setUniform(
            field.key === "scale" && x === y && y === z ? String(x) : "",
          );
          onInputChange?.(undefined);
          onInputFinish?.();
          validity.current?.(true);
        }
      }}
    >
      <legend>
        {field.label} · {field.unit}
      </legend>
      <div className="object-transform-axes">
        {AXES.map((axis, index) => (
          <label key={axis} htmlFor={`${id}-${axis}`}>
            {axis}
            <input
              id={`${id}-${axis}`}
              type="text"
              inputMode="decimal"
              aria-label={`${field.label} ${axis} · ${field.unit}`}
              aria-invalid={Boolean(shownError)}
              aria-describedby={shownError ? `${id}-error` : undefined}
              maxLength={128}
              value={shownValues[index] ?? ""}
              onChange={(event) => change(event.target.value, index)}
            />
          </label>
        ))}
      </div>
      {mode === "scale" && (
        <label htmlFor={`${id}-uniform`}>
          Uniform scale factor
          <input
            id={`${id}-uniform`}
            type="text"
            inputMode="decimal"
            maxLength={128}
            value={shownUniform}
            placeholder="Set all axes"
            aria-invalid={Boolean(shownError)}
            aria-describedby={shownError ? `${id}-error` : undefined}
            onChange={(event) => change(event.target.value, "uniform")}
          />
        </label>
      )}
      {shownError && (
        <p className="notice-error" id={`${id}-error`} role="alert">
          {shownError}
        </p>
      )}
    </fieldset>
  );
}
