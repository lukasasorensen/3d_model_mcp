"use client";
import type { JSX } from "react";
import { Panel, type PanelProps } from "../../../../shared/panels/index";
import { ParameterField } from "../../../parameter-controls/browser/index";
import type { WorkingModelView } from "../workingDraft.types";

export function WorkingParameters({
  draft,
  floating,
}: {
  draft: WorkingModelView;
  floating: PanelProps["floating"];
}): JSX.Element {
  const base = draft.base?.parameters;
  const parameters = base?.parameters ?? [];
  return (
    <Panel
      title="Parameters"
      className="parameter-panel editor-parameter-panel"
      floating={floating}
    >
      {draft.loading && <p role="status">Loading parameters…</p>}
      {draft.historical && <p>Saved parameter values are read-only.</p>}
      {!draft.loading && !parameters.length && (
        <p>No interactive parameters are defined.</p>
      )}
      <div onBlur={() => draft.finish()} onPointerUp={() => draft.finish()}>
        {parameters.map((parameter) => (
          <ParameterField
            key={parameter.id}
            parameter={parameter}
            value={draft.fields.parameters[parameter.id] ?? ""}
            accepted={parameter.value}
            error={
              draft.historical
                ? undefined
                : draft.validation.errors[parameter.id]
            }
            disabled={draft.blocked || !base?.editable}
            onCancel={() => draft.cancel("parameter:" + parameter.id)}
            change={(value) =>
              draft.change(
                (fields) => ({
                  ...fields,
                  parameters: { ...fields.parameters, [parameter.id]: value },
                }),
                "parameter:" + parameter.id,
              )
            }
          />
        ))}
      </div>
    </Panel>
  );
}
