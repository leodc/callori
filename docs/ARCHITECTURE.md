# Callori architecture

## Local MVP

```text
Browser → Next.js (127.0.0.1:3000)
             │ same-origin JSON API, server-only internal token
             ▼
          Voice service (127.0.0.1:3001) → SQLite
             │                    ▲
             │                    │ signed Telnyx webhooks
             ├── Telnyx dial ─── phone recipient
             │                    │
             └── media WebSocket ─┘
                    ⇅ PCMU audio
               OpenAI Realtime
                    │
                    └── ask_user → saved question → browser reply
```

Next.js App Router handles the interface, localization and a narrow backend-for-frontend API. A small Node service owns persistent call state, provider callbacks, open media connections, and timers. Both processes start with one command. This separation avoids custom Next.js server behavior and prevents hot UI updates from owning a phone connection.

SQLite is sufficient for one local user. The service is the sole database writer. Calls contain an immutable creation time, validated input, UI language, status, transcript, current question and outcome. Profile updates apply to subsequent calls: each live session takes a profile snapshot. Provider control identifiers and request/webhook deduplication records are stored separately and are never returned to the UI. Tokens/keys are not stored in call records.

The browser polls at 1.2-second intervals. This is intentionally simpler than adding another WebSocket or Redis dependency for a single local user. Audio remains realtime over WebSockets; displayed translations arrive after each finalized utterance. Stored transcript and status survive page reloads. A process restart interrupts a call rather than pretending to resume a lost Realtime session.

## Media and human-in-the-loop behavior

Telnyx dial requests select inbound PCMU audio and bidirectional RTP mode. Incoming media JSON carries base64 raw audio (no RTP header); it is forwarded to OpenAI `input_audio_buffer.append`. OpenAI `response.output_audio.delta` is sent back as Telnyx `media` events. The Realtime session uses `audio/pcmu`, a supported voice, server VAD and input transcription. Both sides use the same codec, avoiding transcoding in the application.

Input is buffered briefly until OpenAI acknowledges the session configuration. VAD interruptions clear Telnyx's playback queue and truncate the OpenAI item to an estimated elapsed playback duration; the UI marks the item as interrupted. Telnyx mark events acknowledge playback completion. This elapsed-time approximation should be evaluated on real carrier routes before production.

`ask_user` takes a question and either `information` or `approval`. The application saves a correlated UUID question, changes the state to `waiting`, and responds to the tool with an explicit pending status. It does not invent an answer. OpenAI is instructed to maintain the conversation politely while awaiting an actual app-user message. The user response must match the pending question; duplicate, stale, or late answers are rejected. The service injects the exact answer into the **same OpenAI session** without redialing. If a response is in progress, the next response is queued until it completes.

`finish_call` takes an outcome, summary and details. It is rejected while a question remains unanswered. The agent is instructed to say goodbye and report only confirmed facts; a natural hangup without a confirmed tool result produces an incomplete outcome. A successful phone connection is never treated as a successful objective.

Tool arguments are validated at runtime. Human approval and “never invent” behavior are supported by prompts, constrained tools, input validation and correlated answers. They are not a formal guarantee about all model speech. Real conversations, accent/latency conditions and adversarial recipient prompts still require evaluation. No payment, transfer, arbitrary HTTP or shell tools are exposed to the agent. IVR keypad navigation is outside this MVP.

## Code map

| Location                     | Responsibility                                                 |
| ---------------------------- | -------------------------------------------------------------- |
| `components/workspace.tsx`   | Overview, call transcript/question/result, history, profile    |
| `app/globals.css`            | Responsive visual system, accessible focus and reduced motion  |
| `lib/i18n.ts`                | English and Spanish UI copy and actionable errors              |
| `lib/validation.ts`          | Strict request/profile schemas and limits                      |
| `app/api/[...path]/route.ts` | Local Host/origin enforcement and authenticated service proxy  |
| `proxy.ts`                   | Per-request nonce CSP for Next.js scripts                      |
| `server/index.ts`            | HTTP API, webhook verification, WebSocket upgrade, shutdown    |
| `server/engine.ts`           | Call lifecycle, audio bridge, tools, recovery                  |
| `server/providers.ts`        | Telnyx/OpenAI server-side requests and agent policy            |
| `server/store.ts`            | Local SQLite persistence and deduplication                     |
| `server/security.ts`         | Signature verification, token comparison, readiness checks     |
| `tests/`                     | Isolated security, API and provider-transport regression tests |

## Evolving toward Vercel

This release intentionally runs locally. It is **not a deploy-as-is public SaaS application**: there is no user authentication, SQLite requires durable disk, the UI rejects remote hosts, and active sessions live in one process.

The Next.js application can retain its structure on Vercel. Before exposing it publicly, add identity/access control, replace local Host rules with an explicit deployment allowlist, set a shared internal service credential, and provide durable shared storage and per-user authorization. Keep the media service on a host with persistent connections, or adapt the media endpoint to Vercel's currently documented WebSocket runtime and duration limits. Vercel now documents native WebSocket support; connections are pinned to an instance for the function's maximum duration, and later connections can reach a different instance. In-process maps and local SQLite must therefore be replaced with shared state, routing and coordinated lifecycle handling for that deployment model.

No cloud resources, billing, public deployment or new accounts were created by this implementation.

## Official documentation consulted

- [OpenAI Realtime conversations and function calling](https://developers.openai.com/api/docs/guides/realtime-conversations): session configuration, audio events, pending tool results, input messages and interruption truncation.
- [Telnyx media streaming](https://developers.telnyx.com/docs/voice/programmable-voice/media-streaming): PCMU audio payloads, bidirectional RTP mode, clear and mark events.
- [Telnyx Dial API](https://developers.telnyx.com/api-reference/call-commands/dial): outbound fields, stream options, callback URL, unique commands and provider-enforced time limits.
- [Telnyx webhook fundamentals](https://developers.telnyx.com/docs/development/api-fundamentals/webhooks/receiving-webhooks): raw-body Ed25519 verification, replay protection and duplicate/out-of-order deliveries.
- [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers), [CSP](https://nextjs.org/docs/app/guides/content-security-policy), and the bundled Next.js 16.3.5 documentation: dynamic routes, server boundaries and nonce CSP.
- [Vercel WebSocket support](https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections): current native support, instance affinity and duration/shared-state considerations.

Consulted September 14–15, 2026. Account permissions and actual provider connectivity must be checked using the user's credentials.

### Controlled turns and language separation

The server creates responses on deduplicated committed recipient turns; automatic VAD responses are disabled, while interruption detection remains enabled. A response is reserved before the provider acknowledges it, so an app answer cannot start a competing response. While a user question is pending, normal responses and tool retries are blocked. Recipient speech can trigger a short acknowledgement with tools disabled at most once every 15 seconds; only the correlated app answer resumes the task.

Only explicitly inbound Telnyx media is forwarded to OpenAI. Near-field noise reduction and a 0.65 VAD threshold reduce false speech triggers; these are not acoustic echo cancellation and require testing on actual phones. Spoken language remains the call language, including hold messages and resumption after a private answer. Tool text uses the UI language. Display translations use a separate Responses request with a strict JSON schema and are never inserted into the voice session.

### Guided call preparation

`components/call-wizard.tsx` guides users through purpose-specific questions, contact/language, optional scheduling, and final review. `lib/call-plan.ts` compiles the answers into the same validated call request used by the voice engine. Explicit local dates, time windows and timezone remain in the brief. Missing availability never grants permission to book, and fees always require approval. New calls accept only live mode; historical practice records remain readable, while all scripted generation has been removed.

Profile identity is assembled deterministically from every given name and surname and included as fullName only when profile sharing is enabled. The preferred name is explicitly limited to informal address. The wizard displays the exact identification name before a call.

## Production-foundation review

The service binds before recovery, exposes a minimal `/healthz`, rejects requests during initialization/draining, and attempts graceful closure within a 20-second shutdown deadline. A second process cannot recover the first process's active calls before failing its port bind.

Cancellation waits for an in-flight dial to settle before ending the returned carrier call. Stop intent immediately blocks media and closes audio sockets. Hangup commands have persisted UUIDs distinct from dial commands. Failed hangups are retried, and an explicit inactive carrier-status response can confirm a prior remote hangup. Pending terminal carrier records are reconciled at startup and every 30 seconds and prevent new dialing until resolved. Late signed callbacks can recover otherwise unknown control IDs for cleanup.

Cancelled model responses do not execute tool output, queued work rechecks terminal state, and a finish result suppresses new responses while goodbye audio drains. Invalid-tool correction loops and outbound WebSocket buffering are bounded. The web proxy enforces its 32 KiB body limit incrementally, including chunked uploads.

SQLite uses WAL, a five-second busy timeout and FULL synchronous mode. The additive `provider_calls.hangup_id` migration runs automatically. The online backup script validates integrity and refuses overwrite. See [OPERATIONS](OPERATIONS.md) for deployment/restore procedures and [FINDINGS](FINDINGS.md) for failure modes that remain unresolved by local guarantees.

Additional official references: [Telnyx command retries](https://developers.telnyx.com/docs/voice/programmable-voice/command-retries), [Telnyx call-status endpoint](https://github.com/team-telnyx/knowledge-base/blob/main/wiki/dev-docs/telnyx-voice-api-and-sip-trunking--part-1.md), and [Node SQLite backup API](https://nodejs.org/api/sqlite.html#sqlitebackupsourceDb-path-options).
