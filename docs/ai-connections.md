# User-owned AI connections

Sidebar real-AI mode uses each signed-in user's saved connection, never server-wide
provider credentials. LangChain adapters cover Anthropic Claude, OpenAI, Google
Gemini, Ollama, and OpenAI-compatible APIs. Compatible models must support structured
tool calling; passing a connection test does not establish CAD quality or manufacturability.

## User setup

Open **AI connections** from Your projects. Add a named connection, enter its model
ID, save it, and optionally make it the account default. Hosted connections accept
a write-only API token; compatible hosted connections also require a public HTTPS
API base URL such as `https://provider.example/v1`. Editing without a token keeps
the existing credential only when provider, location, and endpoint are unchanged.

The chat picker allows a different saved connection and model for the next turn.
Model discovery is optional: providers can restrict their model-list API, and a
listed model may still lack tool calling. Manual model IDs always remain available.
The explicit connection test calls a harmless `connection_check` tool and may consume
provider tokens. It does not read or modify a project.

Changes to the picker do not alter an active turn. Retry uses the original turn's
connection/model. A deleted or unavailable connection produces an explicit error;
there is no automatic provider, credential, model, or mock fallback.

## Server configuration and rotation

Apply migration `0016_ai-connections`, then configure these server-only settings:

```dotenv
THEORYFOUNDRY_AI_ENCRYPTION_KEY_ID=primary
THEORYFOUNDRY_AI_ENCRYPTION_KEYS={"primary":"<base64-encoded-32-byte-key>"}
```

Generate the key with a cryptographically secure generator, store it in the deployment
secret manager, and retain it with the recovery configuration. Do not commit it or
place it in browser-visible environment variables. Compose passes these settings
through without requiring keys when real AI is unused.

AES-256-GCM credentials include a fresh nonce, authentication tag, key identifier,
and owner/connection associated data. For rotation, add the new key to the JSON
keyring and change the active identifier. Retain old keys until affected connections
have been re-saved with their tokens. Missing/deleted keys disable those connections;
they do not cause plaintext recovery or a different credential to be used.

Keep `THEORYFOUNDRY_CHAT_PROVIDER=mock` for runtime initialization. The independent
Unleash flags still select visibility and real/mock mode per request. Enable both
sidebar flags for real chat and companion inference. Hosted model requests use the
saved token and fixed native API origins. Custom hosted endpoints reject credentials
in URLs, private/reserved DNS results, DNS rebinding at connection time, and redirects.
Private endpoints belong behind the local companion.

## Local companion

The AI companion is an independent mode of `@tfoundry/local-worker@0.2.0`. It needs
Node 24, OS credential storage, and a running model server. It does not initialize
Chromium, download renderer assets, configure an MCP client, or pull models.

Provision the existing worker OAuth client with `pnpm oauth:provision -- --worker`
if it is not already provisioned. Hosted OAuth must be enabled; the rendering-worker
availability flag does not control AI companion endpoints. Authenticate first:

```sh
pnpm --silent dlx @tfoundry/local-worker@0.2.0 login --server https://your-server.example
pnpm --silent dlx @tfoundry/local-worker@0.2.0 ai serve --server https://your-server.example --account <account-id>
```

Ollama defaults to `http://127.0.0.1:11434`. For LM Studio/vLLM, add
`--provider openai-compatible --endpoint http://127.0.0.1:1234/v1`. Use `--name`
to distinguish computers/endpoints. `ai doctor` with the same options verifies
hosted authentication and lists local models. Use `--configure-token` to enter an
optional local API token through a hidden terminal prompt; it is kept in the OS
credential store. Entering a blank token removes local authentication for that
configured companion. Tokens cannot be supplied as command-line arguments.

After starting the companion, select it in a local saved connection and enter an
installed model ID. Inference runs locally; the hosted app still handles the chat
and transfers project context. The companion receives model messages and tool
schemas, never permission to execute arbitrary hosted or local commands. All CAD
tools, ownership checks, rendering jobs, and revision promotion stay server-controlled.

The package must be published separately before users can install this version
from npm. Local implementation/packed-package tests do not publish it.

## Relay lifecycle and limits

Companions use outbound HTTPS long polling with the existing OAuth grant plus a
separate OS-stored device secret whose server copy is hashed. Jobs bind owner,
companion, connection, request, invocation, and optional project. Devices only use
their locally configured endpoint; the hosted service cannot provide an arbitrary URL.

Claims are atomic, leases last 30 seconds and renew every 10 seconds, and offline
status appears after 35 seconds without contact. An expired invocation is failed,
not replayed. Completion retries accept only the same normalized result for the
same lease. Cancelled, expired, wrong-owner, or conflicting completions cannot feed
the agent. Payloads clear when consumed/cancelled or expired; periodic cleanup
removes abandoned rows. Account erasure cascades through connections, companions,
and jobs; project erasure removes its bound jobs.

Turns retain the 120-second timeout, eight CAD tool rounds, and two repair attempts.
Each model call is capped at 8,192 output tokens; relay inputs are capped at 8 MiB
and results at 512 KiB. A cold/slow local model may require warming before retry.
Provider authentication, quota, unsupported-model, offline, and timeout failures
return sanitized messages without upstream error bodies. Cancellation stops further
work and refreshes canonical state; it does not undo an already committed promotion.

## Acceptance

Automated fixtures cover adapter protocols, isolation/encryption, relay lifecycle,
and browser management/selection. Complete a separate real-provider journey for
each chosen provider/model: create, validate/render, promote, revise, and export.
Repeat with local Ollama and a local compatible server, including disconnection
and cancellation. Record deployment commit, model IDs, companion version, and
outcomes without tokens or source-bearing upstream logs. No live provider quality,
deployment, publication, or physical fit acceptance follows from a passing build.
