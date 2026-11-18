"use client";
import { PanelStack } from "../../../../shared/panels/index";
import { useEffect, useState, type ComponentProps, type JSX } from "react";
import { ParameterPanel } from "../../../parameter-controls/browser/index";
import { ObjectEditingPanel } from "../../../object-editing/browser/index";
import { LayersPanel } from "../../../object-layers/browser/index";

export function WorkspaceEditingControls(
  options: ComponentProps<typeof ParameterPanel>,
): JSX.Element {
  const [parametersPending, setParametersPending] = useState(false);
  const [objectsPending, setObjectsPending] = useState(false);
  const [layersPending, setLayersPending] = useState(false);
  const { onPending } = options;
  useEffect(() => {
    onPending(parametersPending || objectsPending || layersPending);
  }, [onPending, parametersPending, objectsPending, layersPending]);
  useEffect(() => (): void => onPending(false), [onPending]);
  return (
    <PanelStack>
      <LayersPanel
        {...options}
        disabled={options.disabled || parametersPending || objectsPending}
        onPending={setLayersPending}
      />
      <ObjectEditingPanel
        key={options.projectId}
        {...options}
        disabled={options.disabled || parametersPending || layersPending}
        onPending={setObjectsPending}
      />
      <ParameterPanel
        {...options}
        disabled={options.disabled || objectsPending || layersPending}
        onPending={setParametersPending}
      />
    </PanelStack>
  );
}
