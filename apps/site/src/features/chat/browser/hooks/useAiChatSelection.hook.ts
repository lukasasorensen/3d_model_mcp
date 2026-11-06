"use client";
import { useEffect, useState } from "react";
import type { AiConnectionSummary } from "@theoryfoundry/contracts";
import {
  aiRequest,
  readAiConnections,
} from "../services/aiConnections.service";
import type { AiChatSelection, ChatModelSelection } from "../aiSelection.types";

export function useAiChatSelection(enabled: boolean): AiChatSelection {
  const [real, setReal] = useState(false);
  const [connections, setConnections] = useState<AiConnectionSummary[]>([]);
  const [selection, setSelection] = useState<ChatModelSelection>({});
  const [models, setModels] = useState<string[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!enabled) return;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async (): Promise<void> => {
      try {
        const response = await fetch("/v1/features/sidebar-chat", {
          cache: "no-store",
          signal: abort.signal,
        });
        const flags = (await response.json()) as { isRealAiEnabled?: boolean };
        const isReal = response.ok && flags.isRealAiEnabled === true;
        if (abort.signal.aborted) return;
        setReal(isReal);
        if (!isReal) return;
        const data = await readAiConnections(abort.signal);
        if (abort.signal.aborted) return;
        setConnections(data.connections);
        setError("");
        setSelection((previous) => {
          if (previous.connectionId) return previous;
          const connection = data.connections.find((item) => item.isDefault);
          return connection
            ? { connectionId: connection.id, model: connection.model }
            : previous;
        });
      } catch {
        if (!abort.signal.aborted)
          setError(
            "AI connections are unavailable. Open settings or retry shortly.",
          );
      } finally {
        if (!abort.signal.aborted)
          timer = setTimeout(() => void refresh(), 15_000);
      }
    };
    void refresh();
    return (): void => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [enabled]);
  const selected = connections.find(
    (item) => item.id === selection.connectionId,
  );
  const select = (id: string): void => {
    const connection = connections.find((item) => item.id === id);
    setSelection(
      connection ? { connectionId: id, model: connection.model } : {},
    );
    setModels([]);
    setError("");
  };
  const discover = async (): Promise<void> => {
    if (!selection.connectionId) return;
    try {
      const data = (await aiRequest(
        `/${selection.connectionId}/models`,
        "POST",
        {},
      )) as { models: string[] };
      setModels(data.models);
      setError("");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Model discovery is unavailable. Enter a model ID.",
      );
    }
  };
  return {
    real,
    connections,
    selection,
    selected,
    models,
    error,
    select,
    discover,
    setModel: (model: string): void =>
      setSelection((previous) => ({ ...previous, model })),
    available:
      !real || Boolean(selected?.status === "ready" && selection.model?.trim()),
  };
}
