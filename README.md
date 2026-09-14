# Callori

Callori is an AI agent that makes phone calls for the user.

The main idea is to help people with anxiety when making phone calls, and people who are not able to make calls because of language barriers (for example, foreigners living in Japan).

The user gives Callori:

* a phone number
* an objective
* useful context
* optional constraints
* the language to use

Callori then:

1. Makes the phone call using Telnyx.
2. Uses OpenAI to handle the conversation.
3. Tries to complete the objective.
4. Asks the user when information or approval is needed.
5. Continues the same call after the user responds.
6. Returns the result of the call.

Callori will show the live transcription of the call in the user's interface language.

## Example

```text
Phone:
045-XXX-XXXX

Objective:
Book a dentist appointment.

Context:
I am already a patient.

Availability:
Wednesday after 16:00.

Language:
Japanese
```

## MVP

Build a web application where the user can:

* create a call
* see the call status
* see the live conversation
* answer questions from the agent
* see the final result
* support i18n for English and Spanish
* have a configuration page where the user can manage their profile

The user profile should include:

* First name
* Last name
* Preferred name
* Age
* Sex
* Nationality
* UI language

This profile information may be used by the agent during phone calls.

The first version should run locally.

No authentication, billing, or multi-user support is needed yet.

## Important behavior

Callori should never invent information.

If the person on the phone asks something Callori does not know, Callori should ask the user.

Example:

```text
Dentist:
Are you taking any medication?
```

Callori should keep the phone conversation active, ask the user through the web UI, receive the answer, and continue the same call naturally.

## Technical requirements

Use:

* OpenAI
* Telnyx

Prefer:

* Next.js
* TypeScript
* Vercel-compatible infrastructure

Make it **security first**.

All secrets and provider credentials must remain server-side.

The technical architecture is intentionally left to Codex. Choose the simplest architecture that satisfies the MVP and can evolve into a production-ready application.
