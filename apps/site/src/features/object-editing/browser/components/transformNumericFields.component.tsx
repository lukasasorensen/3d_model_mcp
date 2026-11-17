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

export function TransformNumericFields({
  transform,
  mode,
  disabled,
  onChange,
  onValidityChange,
}: {
  transform: ObjectTransform;
  mode: TransformControlsMode;
  disabled: boolean;
  onChange(transform: ObjectTransform): void;
  onValidityChange?: ((valid: boolean) => void) | undefined;
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
        : values.map((entry, axis) =>
            axis === index ? value : entry.trim() ? Number(entry) : Number.NaN,
          );
    const next = { ...transform, [field.key]: vector };
    const parsed = objectTransformSchema.safeParse(next);
    if (!parsed.success) {
      setError(
        mode === "scale"
          ? "Enter a finite, positive scale factor within the supported range. Zero and mirrored scales are unsupported."
          : `Enter a finite ${field.label.toLowerCase()} value within the supported range.`,
      );
      onValidityChange?.(false);
      return;
    }
    setError(undefined);
    onValidityChange?.(true);
    onChange(parsed.data);
  };
  return (
    <fieldset className="object-transform-fields" disabled={disabled}>
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
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `${id}-error` : undefined}
              value={values[index] ?? ""}
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
            value={uniform}
            placeholder="Set all axes"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${id}-error` : undefined}
            onChange={(event) => change(event.target.value, "uniform")}
          />
        </label>
      )}
      {error && (
        <p className="notice-error" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}
