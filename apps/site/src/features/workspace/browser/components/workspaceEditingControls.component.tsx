"use client";
import {
  useEffect,
  useState,
  type ComponentProps,
  type JSX,
  type ReactNode,
} from "react";
import { ParameterPanel } from "../../../parameter-controls/browser/index";
import { ObjectEditingPanel } from "../../../object-editing/browser/index";
import { LayersPanel } from "../../../object-layers/browser/index";

type WorkspaceEditingControlsProps = ComponentProps<typeof ParameterPanel> & {
  renderViewport: ComponentProps<typeof ObjectEditingPanel>["renderViewport"];
  previewReady: boolean;
  children?: ReactNode;
};

export function WorkspaceEditingControls({
  hydrated = true,
  ...options
}: WorkspaceEditingControlsProps & { hydrated?: boolean }): JSX.Element {
  if (!hydrated)
    return (
      <>
        {options.renderViewport({ showAccepted: true })}
        {options.children}
      </>
    );
  return <HydratedEditingControls {...options} />;
}

function HydratedEditingControls({
  renderViewport,
  previewReady,
  children,
  ...options
}: WorkspaceEditingControlsProps): JSX.Element {
  const [parametersPending, setParametersPending] = useState(false);
  const [objectsPending, setObjectsPending] = useState(false);
  const [layersPending, setLayersPending] = useState(false);
  const { onPending } = options;
  useEffect(() => {
    onPending(parametersPending || objectsPending || layersPending);
  }, [onPending, parametersPending, objectsPending, layersPending]);
  useEffect(() => (): void => onPending(false), [onPending]);
  return (
    <>
      <div className="workspace-editor">
        <ObjectEditingPanel
          {...options}
          previewReady={previewReady}
          renderViewport={renderViewport}
          disabled={options.disabled || parametersPending || layersPending}
          onPending={setObjectsPending}
          parameters={
            <ParameterPanel
              {...options}
              floating
              disabled={options.disabled || objectsPending || layersPending}
              onPending={setParametersPending}
            />
          }
        />
      </div>
      {children}
      <LayersPanel
        {...options}
        disabled={options.disabled || parametersPending || objectsPending}
        onPending={setLayersPending}
      />
    </>
  );
}
