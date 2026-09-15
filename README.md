# Callori

Callori makes phone calls on your behalf. It helps with appointments, reservations, information requests and follow-ups, especially when speaking another language or making the call yourself is difficult.

**Release: MVP production foundation · September 15, 2026.** The application is implemented end to end and hardened for **private, single-user operation on one persistent host**. Authentication, billing and multi-user support are intentionally excluded. This is not an anonymously accessible public deployment.

## The experience

- **Book an appointment:** choose dentist, doctor, beauty/wellness or another service; give the reason; optionally say whether you have visited before.
- **Reserve a table:** provide the party size and optional seating/accessibility requests.
- **Ask for information:** write the questions you want answered.
- **Follow up:** describe the pending matter and optionally provide a reference number.
- **Another call:** describe a custom request.

The guided flow asks for the contact, phone number and spoken language. Appointments and reservations support up to three optional date/time windows in the destination’s local time (Japan: Asia/Tokyo). The final review shows the request, profile sharing, dates and confirmation permissions before the user authorizes a real call.

**Calling destinations: Japan only for now.** The country menu defaults to Japan (+81). Enter a local number such as `070-1234-5678`, or paste its international form; Callori formats it and previews `+81 70 1234 5678` before dialing. The API also enforces the controlled country list. `ALLOWED_PHONE_NUMBERS=*` allows valid numbers only within enabled countries. Spoken language is independent of destination.

**Find a place:** open a map that already knows the service from your request. Callori asks for browser location permission and searches nearby automatically when granted; floating controls let you search another city, neighborhood or station. Numbered pins match the results, and place details let you continue the call request or save a contact. The map requires a Google Maps browser key. If unavailable, the request still supports entering a phone number manually. See [Google Maps setup and data handling](docs/GOOGLE_MAPS.md).

During the call, the user sees status and a translated transcript, can inspect the original text, answer requests for information/approval, and hang up. Answers resume the same phone call and OpenAI session. The final outcome and transcript remain in history and can be exported.

The interface supports **English and Spanish**; the voice agent supports **Japanese, English and Spanish**. Profile sharing is optional per call. Identification uses all given names and surnames; a preferred nickname never substitutes for the full name. New calls are live only. Historical practice records remain clearly labeled; scripted practice generation has been removed.

## Run locally

Requires **Node.js 24 or later**; use the Node 24 LTS line from `.nvmrc` for a consistent baseline.

```sh
npm ci
cp .env.example .env  # first setup only; do not overwrite an existing .env
npm run dev
```

Open [Callori](http://127.0.0.1:3000). You can prepare and review a call without provider setup. Dialing requires the configuration below.

For the optimized build:

```sh
npm run check
npm run test:integration
npm start
```

`npm start` runs the Next.js interface on **127.0.0.1:3000** and the voice service on **127.0.0.1:3001**. Independent `start:web` and `start:voice` commands are also available for a process supervisor. Do not run a second voice instance or restart during a call.

## Connect the providers

Configure these server-only variables in `.env`:

| Variable                | Purpose                                                                   |
| ----------------------- | ------------------------------------------------------------------------- |
| `OPENAI_API_KEY`        | OpenAI Realtime and transcript translation                                |
| `TELNYX_API_KEY`        | Telnyx Voice API authorization                                            |
| `TELNYX_CONNECTION_ID`  | Voice API / Call Control application ID                                   |
| `TELNYX_FROM_NUMBER`    | Authorized outbound telephone number in E.164 format                      |
| `TELNYX_PUBLIC_KEY`     | Verify signed Telnyx callbacks                                            |
| `PUBLIC_BASE_URL`       | Public HTTPS origin of a tunnel to port 3001                              |
| `ALLOWED_PHONE_NUMBERS` | Comma-separated E.164 destinations, or `*` for all supported destinations |
| `LIVE_CALLS_ENABLED`    | Set to `true` to enable dialing                                           |

Run `ngrok http 3001`, then set:

```dotenv
PUBLIC_BASE_URL=https://YOUR-DOMAIN.ngrok-free.app
```

Configure the Telnyx **v2 webhook** as `https://YOUR-DOMAIN.ngrok-free.app/webhooks/telnyx`. Do not append `:3001` to the public URL. Keep the tunnel open and restart Callori after changing `.env`. The UI stays private on port 3000.

Telnyx handles the telephone connection; **OpenAI is the conversational agent**. This implementation uses Telnyx Call Control and a bidirectional audio WebSocket, so SIP usernames/passwords are not used. See [setup](docs/SETUP.md) for portal details and troubleshooting.

## Architecture and boundaries

```text
Browser → Next.js → authenticated internal API → Voice service → SQLite
                                                   ↕
Telephone ↔ Telnyx ↔ bidirectional PCMU audio ↔ OpenAI Realtime
                                                   ↓
                                  ask user → UI answer → same call
```

The architecture uses Next.js App Router, React, TypeScript, a small Node voice service and local SQLite. OpenAI/Telnyx credentials remain server-side; optional Maps discovery uses a separate restricted browser key. Display translations use a separate structured OpenAI request and never enter the voice conversation.

Implemented safeguards include local Host/origin checks, a private internal service token, signed/replay-checked webhooks, per-call media tokens, bounded request bodies and audio queues, one active call, dialing throttling, idempotency, provider-enforced call duration, durable hangup recovery and a 90-second user-answer timeout. The default call cap is 600 seconds, configurable within 30–1200 seconds.

No audio files are recorded by Callori. Transcripts/profile data remain on disk and are sent to providers only as required for the call/translation. They are not application-encrypted at rest; use a protected host and encrypted backups. Provider-side recording or retention settings are separate.

## Validation and operations

- `npm run check`: TypeScript, automated tests and production build.
- `npm run test:integration`: isolated HTTP lifecycle/security checks, with empty provider credentials and temporary data.
- `npm run backup -- /private/path/callori-backup.sqlite`: consistent SQLite backup, integrity-checked, owner-readable and refusing to overwrite an existing file.
- `GET http://127.0.0.1:3001/healthz`: process health only; it does not validate provider access.
- GitHub Actions runs checks and a production dependency audit with read-only repository permissions. No deployment or provider credentials are required.

The current verification includes 33 automated tests, an isolated server smoke test, production compilation, browser checks and a dependency audit with no reported vulnerabilities on September 15. Real phone connectivity has been exercised by the user. Audio quality, adversarial conversations and all carrier failure modes are not comprehensively certified. See [verification](docs/VERIFICATION.md) for the evidence and limits.

## Findings, challenges and next steps

The first real calls exposed language drift, repeated hold speech and confusion between a preferred name and the patient's full name. The implementation now separates spoken/UI languages, controls response creation during pending questions, rejects outgoing audio as model input and explicitly supplies full identity. These changes have regression coverage; acoustic echo and recognition remain dependent on the telephone route and equipment.

The production review additionally addressed cancellation during a pending dial, recovery after failed hangups, tool execution from interrupted responses, oversized streaming requests and duplicate-process startup. [Findings and challenges](docs/FINDINGS.md) explains the remaining risks.

Immediate follow-up work is a repeatable real-call acceptance suite, transcript retention/deletion, history pagination, richer operational metrics and deployment-specific state/duration decisions. Authentication, billing and multi-user support belong to a later phase, as requested. See the prioritized [TODO list](docs/TODO.md).

## Documentation

- [Business discovery and Google Maps](docs/GOOGLE_MAPS.md)
- [Documentation index](docs/README.md)
- [Setup and provider configuration](docs/SETUP.md)
- [Architecture and Vercel migration](docs/ARCHITECTURE.md)
- [Operations, backups, recovery and release procedure](docs/OPERATIONS.md)
- [Findings and challenges](docs/FINDINGS.md)
- [Verification](docs/VERIFICATION.md)
- [TODOs](docs/TODO.md)
