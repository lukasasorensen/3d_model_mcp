"use client";
import type { JSX } from "react";
import type { TransformControlsMode } from "three/addons/controls/TransformControls.js";
import type { ObjectTransform } from "@theoryfoundry/contracts";
import {
  IconButton,
  TranslateIcon,
  RotateIcon,
  ScaleIcon,
} from "../../../../shared/icons/index";
import { TransformNumericFields } from "./transformNumericFields.component";

export function ObjectTransformEditor({
  objectName,
  transform,
  mode,
  setMode,
  onChange,
  disabled,
  onValidityChange,
}: {
  objectName: string;
  transform: ObjectTransform;
  mode: TransformControlsMode;
  setMode(mode: TransformControlsMode): void;
  onChange(transform: ObjectTransform): void;
  disabled: boolean;
  onValidityChange(valid: boolean): void;
}): JSX.Element {
  return (
    <div
      className="object-transform-editor"
      role="group"
      aria-label={`Transform ${objectName}`}
    >
      <div
        className="object-transform-modes"
        role="group"
        aria-label="Object transform tool"
      >
        {(
          [
            ["translate", "Move", TranslateIcon],
            ["rotate", "Rotate", RotateIcon],
            ["scale", "Scale", ScaleIcon],
          ] as const
        ).map(([value, label, Icon]) => (
          <IconButton
            icon={Icon}
            label={`${label} selected object`}
            revealLabel={label}
            key={value}
            aria-pressed={mode === value}
            disabled={disabled}
            onClick={() => setMode(value)}
          />
        ))}
      </div>
      <TransformNumericFields
        transform={transform}
        mode={mode}
        disabled={disabled}
        onChange={onChange}
        onValidityChange={onValidityChange}
      />
    </div>
  );
}
