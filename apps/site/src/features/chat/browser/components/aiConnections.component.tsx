"use client";
import {
  useCallback,
  useEffect,
  useId,
  useState,
  type FormEvent,
  type JSX,
} from "react";
import type {
  AiConnectionInput,
  AiConnectionSummary,
  CompanionSummary,
} from "@theoryfoundry/contracts";
import {
  aiRequest,
  readAiConnections,
  saveAiConnection,
} from "../services/aiConnections.service";

const blank: AiConnectionInput = {
  name: "",
  provider: "openai",
  location: "hosted",
  model: "",
  isDefault: false,
};
function editable(connection: AiConnectionSummary): AiConnectionInput {
  return {
    name: connection.name,
    provider: connection.provider,
    location: connection.location,
    model: connection.model,
    isDefault: connection.isDefault,
    ...(connection.endpoint ? { endpoint: connection.endpoint } : {}),
    ...(connection.companionId ? { companionId: connection.companionId } : {}),
  };
}
export function AiConnections({
  origin,
  account,
  workerVersion,
}: {
  origin: string;
  account: string;
  workerVersion: string;
}): JSX.Element {
  const [connections, setConnections] = useState<AiConnectionSummary[]>([]);
  const [companions, setCompanions] = useState<CompanionSummary[]>([]);
  const [form, setForm] = useState<AiConnectionInput>(blank);
  const [editing, setEditing] = useState<string>();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const id = useId();
  const refresh = useCallback(async (): Promise<void> => {
    const data = await readAiConnections();
    setConnections(data.connections);
    setCompanions(data.companions);
  }, []);
  useEffect(() => {
    const update = (): void => {
      void refresh().catch(() =>
        setMessage("AI connections are unavailable. Retry shortly."),
      );
    };
    update();
    const timer = setInterval(update, 15_000);
    return (): void => clearInterval(timer);
  }, [refresh]);
  const operation = async (
    work: () => Promise<void>,
    success: string,
  ): Promise<void> => {
    setBusy(true);
    setMessage("");
    try {
      await work();
      await refresh();
      setMessage(success);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The operation failed. Retry shortly.",
      );
    } finally {
      setBusy(false);
    }
  };
  const save = (event: FormEvent): void => {
    event.preventDefault();
    void operation(async () => {
      await saveAiConnection({ ...form, ...(token ? { token } : {}) }, editing);
      setToken("");
      setEditing(undefined);
      setForm(blank);
    }, "Connection saved.");
  };
  const local = form.location === "local";
  const field = (name: string): string => `${id}-${name}`;
  return (
    <section
      className="connected-apps ai-settings"
      aria-labelledby={`${id}-heading`}
    >
      <header className="connected-apps-heading">
        <div>
          <p className="eyebrow">Account settings</p>
          <h1 id={`${id}-heading`}>AI connections</h1>
        </div>
        <a href="/">Projects</a>
      </header>
      <p>
        Use your own provider API token or run inference on your computer.
        Provider charges are billed to your account.
      </p>
      <p role="status" aria-live="polite">
        {message}
      </p>
      <ul className="connected-apps-list">
        {connections.map((connection) => (
          <li key={connection.id}>
            <div>
              <strong>
                {connection.name}
                {connection.isDefault ? " · Default" : ""}
              </strong>
              <span>
                {connection.provider} · {connection.model} · {connection.status}
              </span>
              <span>
                {connection.location === "local"
                  ? "Local inference through companion"
                  : connection.hasCredential
                    ? "API token saved"
                    : "API token required"}
              </span>
            </div>
            <div className="ai-actions">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setEditing(connection.id);
                  setForm(editable(connection));
                  setToken("");
                }}
              >
                Edit
              </button>
              <button
                type="button"
                disabled={busy || connection.isDefault}
                onClick={() =>
                  void operation(
                    () =>
                      saveAiConnection(
                        { ...editable(connection), isDefault: true },
                        connection.id,
                      ),
                    "Default connection updated.",
                  )
                }
              >
                Make default
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void operation(async () => {
                    await aiRequest(`/${connection.id}/test`, "POST", {});
                  }, "Structured tool calling passed.")
                }
              >
                Test connection
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void operation(async () => {
                    await aiRequest(`/${connection.id}`, "DELETE");
                    if (editing === connection.id) {
                      setEditing(undefined);
                      setForm(blank);
                      setToken("");
                    }
                  }, "Connection deleted.")
                }
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
      {!connections.length && (
        <p>No AI connections yet. Add one below, then make it your default.</p>
      )}
      <form onSubmit={save} className="ai-connection-form">
        <h2>{editing ? "Edit connection" : "Add connection"}</h2>
        <fieldset disabled={busy}>
          <label htmlFor={field("name")}>Connection name</label>
          <input
            id={field("name")}
            required
            maxLength={100}
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
          <label htmlFor={field("provider")}>Provider</label>
          <select
            id={field("provider")}
            value={form.provider}
            onChange={(event) => {
              const provider = event.target
                .value as AiConnectionInput["provider"];
              setForm({
                name: form.name,
                model: "",
                provider,
                location: provider === "ollama" ? "local" : "hosted",
                isDefault: form.isDefault,
              });
              setToken("");
            }}
          >
            <option value="openai">OpenAI</option>
            <option value="anthropic">Claude (Anthropic)</option>
            <option value="google">Gemini (Google)</option>
            <option value="ollama">Ollama</option>
            <option value="openai-compatible">OpenAI-compatible API</option>
          </select>
          {form.provider === "openai-compatible" && (
            <>
              <label htmlFor={field("location")}>Run through</label>
              <select
                id={field("location")}
                value={form.location}
                onChange={(event) => {
                  setForm({
                    name: form.name,
                    provider: form.provider,
                    model: form.model,
                    isDefault: form.isDefault,
                    location: event.target.value as "local" | "hosted",
                  });
                  setToken("");
                }}
              >
                <option value="hosted">
                  Hosted server (public HTTPS endpoint)
                </option>
                <option value="local">Local companion (LM Studio, vLLM)</option>
              </select>
            </>
          )}
          <label htmlFor={field("model")}>Default model ID</label>
          <input
            id={field("model")}
            required
            maxLength={200}
            value={form.model}
            onChange={(event) =>
              setForm({ ...form, model: event.target.value })
            }
            placeholder="Enter the provider's model ID"
          />
          {local ? (
            <>
              <label htmlFor={field("companion")}>Companion</label>
              <select
                id={field("companion")}
                required
                value={form.companionId ?? ""}
                onChange={(event) =>
                  setForm({ ...form, companionId: event.target.value })
                }
              >
                <option value="">Choose a companion</option>
                {companions
                  .filter((companion) => companion.provider === form.provider)
                  .map((companion) => (
                    <option key={companion.id} value={companion.id}>
                      {companion.name} ·{" "}
                      {companion.online ? "online" : "offline"}
                    </option>
                  ))}
              </select>
              <p>
                Inference runs locally. Project context passes through
                TheoryFoundry. Configure endpoint credentials on the companion.
              </p>
            </>
          ) : (
            <>
              {form.provider === "openai-compatible" && (
                <>
                  <label htmlFor={field("endpoint")}>API base URL</label>
                  <input
                    id={field("endpoint")}
                    type="url"
                    required
                    value={form.endpoint ?? ""}
                    placeholder="https://provider.example/v1"
                    onChange={(event) =>
                      setForm({ ...form, endpoint: event.target.value })
                    }
                  />
                </>
              )}
              <label htmlFor={field("token")}>
                {editing
                  ? "Replace API token (leave blank to keep)"
                  : "API token"}
              </label>
              <input
                id={field("token")}
                type="password"
                autoComplete="new-password"
                required={!editing}
                maxLength={4096}
                value={token}
                onChange={(event) => setToken(event.target.value)}
              />
              <p>Saved encrypted. Tokens are never displayed again.</p>
            </>
          )}
          <label className="ai-checkbox">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(event) =>
                setForm({ ...form, isDefault: event.target.checked })
              }
            />
            Use as account default
          </label>
          <button className="button-primary" type="submit">
            Save connection
          </button>
          {editing && (
            <button
              type="button"
              onClick={() => {
                setEditing(undefined);
                setForm(blank);
                setToken("");
              }}
            >
              Cancel edit
            </button>
          )}
        </fieldset>
      </form>
      <details className="ai-companion-setup">
        <summary>Set up a local AI companion</summary>
        <p>
          Install Node 24 and start Ollama or an OpenAI-compatible server. Sign
          in, then keep the companion running while using chat.
        </p>
        <pre>
          <code>{`pnpm --silent dlx @tfoundry/local-worker@${workerVersion} login --server ${origin}\npnpm --silent dlx @tfoundry/local-worker@${workerVersion} ai serve --server ${origin} --account ${account}`}</code>
        </pre>
        <p>
          For LM Studio or vLLM, add{" "}
          <code>
            --provider openai-compatible --endpoint http://127.0.0.1:1234/v1
          </code>
          . Use <code>ai doctor</code> with the same options to check access and
          list models. Add <code>--configure-token</code> to enter an optional
          local API token into OS credential storage.
        </p>
        <p>
          Connection tests make a small model request and may consume provider
          tokens. Model discovery in chat is optional; model IDs can always be
          entered manually.
        </p>
      </details>
    </section>
  );
}
