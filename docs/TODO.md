# Follow-up work

The current release is a private, single-user production foundation. These are explicit follow-ups, not features silently assumed to be implemented.

## P0 — before changing the deployment boundary or claiming broad voice acceptance

- [ ] Run and document a repeatable real-call acceptance set: Japanese/English/Spanish, full names, missing data, denied approval, silence/90-second timeout, interruption, manual/remote hangup, provider outage, and speakerphone/headset comparison. **Done when:** results identify carrier/device/model and all critical cases pass or have documented mitigations.
- [ ] Choose the target hosting topology and access boundary. **Done when:** persistent storage, process lifecycle, WebSocket duration, internal credentials, backup/restore and restricted UI access are tested on that host. Do not expose the current unauthenticated UI publicly.
- [ ] Exercise fault recovery on a controlled live destination. **Done when:** cancelled/failed calls are confirmed inactive in Telnyx, including lost-response/restart cases, without duplicate dialing.

## P1 — operational maturity

- [ ] Add retention and safe deletion/export controls for transcripts/profile data. **Done when:** users can understand and remove stored data, including documented backup retention.
- [ ] Paginate history and return only necessary data during live polling. **Done when:** a large history does not make every 1.2-second update transfer all transcripts.
- [ ] Add redacted provider error categories, latency/failure metrics and alerts for pending recovery. **Done when:** operators can diagnose problems without logging audio, credentials or transcript text.
- [ ] Schedule encrypted backups and perform periodic restore drills on the chosen host. **Done when:** a documented recovery-time/data-loss target is demonstrated.
- [ ] Improve translation retry/status handling and recovery of untranslated historical lines. **Done when:** pending, failed and completed translation states are distinct and retrying does not alter spoken conversation history.
- [ ] Evaluate accurate playback accounting and echo handling. **Done when:** interruption behavior passes measured real-route tests without cutting off or replaying agent speech unexpectedly.

## P2 — product expansion

- [ ] Enable additional calling countries one by one in `lib/phone.ts`, with localized examples, regression tests and carrier permission checks. Resolve the business’s local timezone for countries with multiple timezones before enabling them. Japan is the only currently enabled destination.

- [ ] Add more localized appointment/service types and richer scheduling rules only after validating the current wizard with users.
- [ ] Evaluate IVR/DTMF, voicemail and transfer handling with explicit user permission boundaries.
- [ ] Add durable scheduling/resumption only with a defined policy; current restarts end calls and never silently redial.

## Explicitly deferred to the next phase

- [ ] Authentication and user authorization.
- [ ] Billing, subscriptions and quotas.
- [ ] Multi-user data isolation and concurrency.

Those three areas are intentionally absent from the MVP. Their eventual implementation must include the corresponding deployment and data-boundary changes; they are not switches to turn on in the current build.
