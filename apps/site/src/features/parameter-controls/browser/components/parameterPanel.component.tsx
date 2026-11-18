"use client";
import { useEffect, useId, useRef, useState, type JSX } from "react";
import { ParameterField } from "./parameterField.component";
import {
  useParameterControls,
  type ParameterControlsOptions,
} from "../hooks/useParameterControls.hook";

export function ParameterPanel({
  floating = false,
  ...options
}: ParameterControlsOptions & { floating?: boolean }): JSX.Element {
  const state = useParameterControls(options);
  const [open, setOpen] = useState(!floating);
  const heading = useId();
  const panel = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  const close = (): void => {
    setOpen(false);
    toggle.current?.focus();
  };
  const summary = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.error) setOpen(true);
  }, [state.error]);
  useEffect(() => {
    if (open && state.error) summary.current?.focus();
  }, [open, state.error]);
  const parameters = state.historical
    ? (state.view?.parameters ?? [])
    : (state.base?.parameters ?? []);
  const disabled =
    options.disabled ||
    state.pending ||
    state.loading ||
    state.historical ||
    !state.base?.editable ||
    state.stale;
  const serverId =
    state.error?.details?.parameterId ??
    state.error?.details?.path?.match(
      /^parameters\.([A-Za-z0-9_-]+)\.value$/,
    )?.[1];
  const canApply =
    !disabled &&
    !state.reviewConflicts.length &&
    state.validation.operations.length > 0 &&
    !Object.keys(state.validation.errors).length;
  return (
    <>
      {floating && (
        <button
          type="button"
          className="editor-parameters-toggle"
          ref={toggle}
          aria-label="Parameters"
          aria-expanded={open}
          aria-controls={panel}
          onClick={() => (open ? close() : setOpen(true))}
        >
          Parameters
          {state.pending && (
            <span className="sr-only"> · update in progress</span>
          )}
          {!state.pending && state.validation.dirty && (
            <span className="sr-only"> · unapplied changes</span>
          )}
        </button>
      )}
      <section
        className={
          floating
            ? "parameter-panel editor-parameter-panel"
            : "parameter-panel"
        }
        id={panel}
        hidden={!open}
        aria-labelledby={heading}
        onKeyDown={(event) => {
          if (floating && event.key === "Escape" && !event.defaultPrevented) {
            event.stopPropagation();
            close();
          }
        }}
        aria-busy={state.pending}
      >
        <div className={floating ? "editor-parameter-heading" : undefined}>
          <h2 id={heading}>Parameters</h2>
          {floating && (
            <button type="button" aria-label="Close parameters" onClick={close}>
              ×
            </button>
          )}
        </div>
        <p className="action-help">
          Adjust values, then apply to validate and save a new revision.
          Downloads use saved values.
        </p>
        {state.loading && <p role="status">Loading parameters…</p>}
        {state.error && (
          <div
            ref={summary}
            tabIndex={-1}
            role="alert"
            className="notice notice-error"
          >
            <p>{state.error.message}</p>
            {state.retryOutcome && (
              <button
                type="button"
                disabled={state.pending || options.disabled || state.loading}
                onClick={() => void state.apply(true)}
              >
                Retry interrupted update
              </button>
            )}
            <button
              type="button"
              disabled={state.pending}
              onClick={state.reload}
            >
              Refresh saved values
            </button>
          </div>
        )}
        {state.historical && (
          <p>
            Historical values are read-only. Return to the current revision to
            edit, or restore this revision from Details.
          </p>
        )}
        {state.stale && !state.historical && (
          <div role="status" className="notice">
            <p>
              The current revision changed. Your draft is retained against its
              original revision.
            </p>
            <button
              type="button"
              disabled={state.pending || state.loading}
              onClick={state.reapply}
            >
              Review draft on latest revision
            </button>
            <button
              type="button"
              disabled={state.pending || state.loading}
              onClick={() => state.reset()}
            >
              Discard draft
            </button>
          </div>
        )}
        {state.reviewConflicts.length > 0 && (
          <div role="alert" className="notice">
            <p>
              These definitions changed or were removed:{" "}
              {state.reviewConflicts.join(", ")}. Their old draft values were
              not copied. Review the current fields before continuing.
            </p>
            <button type="button" onClick={state.acknowledgeConflicts}>
              I reviewed the changed definitions
            </button>
          </div>
        )}
        {!state.loading && parameters.length === 0 && (
          <p>
            No interactive parameters are defined. Ask AI to register parameters
            explicitly to customize this model.
          </p>
        )}
        {!state.loading && parameters.length > 0 && !state.view?.editable && (
          <p>
            This legacy model requires explicit parameter adoption before its
            values can be edited.
          </p>
        )}
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void state.apply();
          }}
        >
          {parameters.map((parameter) => (
            <ParameterField
              key={parameter.id}
              parameter={parameter}
              value={
                state.historical
                  ? typeof parameter.value === "boolean"
                    ? parameter.value
                    : String(parameter.value)
                  : (state.draft[parameter.id] ?? "")
              }
              accepted={
                (state.historical
                  ? parameter
                  : state.current?.parameters.find((p) => p.id === parameter.id)
                )?.value ?? parameter.value
              }
              error={
                state.historical
                  ? undefined
                  : (state.validation.errors[parameter.id] ??
                    (serverId === parameter.id
                      ? (state.error?.details?.reason ?? state.error?.message)
                      : undefined))
              }
              disabled={disabled}
              change={(value) => state.change(parameter.id, value)}
            />
          ))}
          {!state.historical && parameters.length > 0 && (
            <div className="parameter-actions">
              <button
                type="button"
                disabled={disabled}
                onClick={() => state.reset(true)}
              >
                Reset to defaults
              </button>
              <button
                type="button"
                disabled={
                  state.pending || state.loading || !state.validation.dirty
                }
                onClick={() => state.reset()}
              >
                Discard changes
              </button>
              <button
                className={floating ? "editor-apply" : undefined}
                type="submit"
                disabled={!canApply}
              >
                {state.pending ? "Applying…" : "Apply changes"}
              </button>
              {state.pending && (
                <button type="button" onClick={state.cancel}>
                  Cancel update
                </button>
              )}
            </div>
          )}
        </form>
        {!state.historical && state.validation.dirty && !state.pending && (
          <p>Unapplied changes</p>
        )}
        <p role="status" aria-live="polite">
          {state.message}
        </p>
      </section>
    </>
  );
}
