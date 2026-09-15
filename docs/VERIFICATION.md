# Verification

## Current release checks — September 15, 2026

| Check                     | Result                                                                                                                  |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| TypeScript                | Passed                                                                                                                  |
| Automated suite           | 33 tests passed; isolated fixtures and mocked telephone transports                                                      |
| Optimized Next.js build   | Passed                                                                                                                  |
| HTTP lifecycle smoke test | Passed on a temporary port/data directory with empty provider credentials                                               |
| Dependency audit          | Zero reported vulnerabilities at review time                                                                            |
| SQLite backup             | Synthetic live-WAL backup/restore, file permissions and overwrite refusal passed; local handoff backup integrity passed |
| Browser                   | Guided UI checked on desktop/mobile; prior full practice flow and user real-call feedback are distinguished below       |
| GitHub Actions            | Workflow added with pinned action revisions and Node 24; not executed remotely during handoff                           |

Local checks ran using Node 25.6.0. The declared baseline and CI target are Node 24+. No claim is made that the GitHub runner or a hosted deployment has been exercised locally.

## Automated coverage

- Japan-only phone normalization: local/international/full-width input, landlines/mobile/IP numbers, rejection of other countries, short codes, extensions and malformed input, canonical API validation and allowlist enforcement.

- Webhook Ed25519 signatures, forgery/tampering, fixed-clock replay checks, strict request schemas and destination policy.
- Local Host/origin guards, route allowlist, internal credential forwarding, masked service failures, and incremental limits for chunked bodies.
- Profile/full-name separation and opt-out; purpose-specific briefs; date alternatives, timezone and explicit confirmation permissions; rejection of new practice calls.
- One active call, persistent request/webhook deduplication, stale/duplicate user answers and cancellation.
- Simulated PCMU media relay, original/translated transcript storage, interruption handling, gated/throttled pending-question responses and resumption on the same session.
- Cancel during a delayed dial response, durable failed hangup recovery, stable hangup command IDs, blocking redial while cleanup is unresolved, and rejection of cancelled/late model tool output.
- Carrier hangup failure is accepted as already closed only when a status response explicitly returns `is_alive: false`; active/unknown states remain errors.
- SQLite online backup includes committed WAL data and is readable after restore.

The isolated HTTP smoke test separately verifies health, unauthenticated API/signature rejection, oversized-body rejection, malformed WebSocket upgrade handling, graceful shutdown, and that a duplicate server launch cannot alter a seeded active call.

## Browser and user testing evidence

Business discovery was redesigned and verified on September 16 with real Google tiles, ten restaurant results near Shinjuku Station and desktop/mobile (390×844) screenshots. No browser errors or horizontal overflow were observed. The map uses the request’s known service, prompts once for location, searches automatically when granted and keeps area controls on the map. An isolated fixture verified permission denial/out-of-region fallback, blocked closed/no-phone places, saving/removing references, restoring results across tabs, wizard autofill without dialing, late location callbacks superseded by a manual search, cancellation on close and missing-key messaging. The fixture intercepted contact writes and all call submissions; no real contact data was changed. Cloud restriction settings and live saved-contact detail refresh remain unverified. See [Google Maps](GOOGLE_MAPS.md) for the repeatable browser checks.

The Japan country selector was rechecked after restart on desktop and at 390×844. Only Japan (+81) appeared; `07012345678` formatted as `070-1234-5678` on blur and previewed `+81 70 1234 5678`. A US number showed an inline error and could not advance. Final review preserved the normalized Japan destination. No horizontal overflow or browser errors were observed, and no call was submitted.

The guided appointment path was checked in Spanish: Dentist → cleaning reason → contact/English voice → profile sharing → date/time window → final review. Review displayed all given names/surnames, the exact contact and selected date/time. A browser-only intercepted submit verified the live request payload and error handling without dialing. Mobile review at 390×844 showed no horizontal overflow or framework overlay. Inquiry and follow-up displayed their own questions and used shorter flows. The updated overview no longer offers practice mode. Final browser recheck after the release restart confirms UI loading/settings health, rather than claiming a new phone acceptance test.

Earlier browser testing covered both EN/ES UI, transcript export, profile persistence, manual end-call controls and the same-call user-answer loop using the former practice flow. Those scripted checks are historical evidence, not available production functionality and not evidence that all real carrier scenarios pass. Previous automated accessibility scans of settings/overview/call results reported zero violations; the new wizard has manual keyboard/focus/label/mobile checks, not a claimed complete new accessibility audit.

The user made real calls and reported successful Telnyx/OpenAI connections, followed by improved behavior after the turn/language fixes. Stored originals supported the language-drift finding. OpenAI accepted the revised audio configuration and returned a valid structured translation in isolated checks. A Realtime text session using a fictional profile correctly used all given names and surnames. A proposed check with the user's real name was blocked by automatic approval review and was not executed; the fictional test was the safe replacement.

## Controlled live-call acceptance still required

Before broader use or a hosting change, record results for:

1. EN/ES/JA voice with EN/ES UI, full names and spelling/accents.
2. Missing information, explicit refusal and approval, and exact resumption on the same call.
3. No app answer for 90 seconds; user cancellation while ringing, speaking and waiting.
4. Recipient hangup, noisy input, long pauses, interruptions and speakerphone/headset echo.
5. Provider outage, lost dial response, failed hangup and process restart; verify the actual Telnyx leg is inactive and no duplicate call was placed.
6. Confirmation/result accuracy, translation failures and privacy constraints under adversarial recipient requests.

No real telephone calls were placed by the automated production-review checks. Audio quality, real-world prompt compliance, full carrier fault coverage, load tests, public-host security and production recovery-time targets remain unverified. See [TODO](TODO.md) for acceptance criteria.
