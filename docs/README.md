# Callori documentation

This documentation describes the **MVP production foundation**, reviewed September 15, 2026. It covers the implemented private, single-user application. No authentication, billing or multi-user features are included.

| Document                        | Read it for                                                          |
| ------------------------------- | -------------------------------------------------------------------- |
| [Project README](../README.md)  | Product behavior, quick start and release boundaries                 |
| [SETUP](SETUP.md)               | Local setup, Telnyx/OpenAI variables, tunnels and troubleshooting    |
| [ARCHITECTURE](ARCHITECTURE.md) | Components, audio flow, security boundaries and deployment decisions |
| [OPERATIONS](OPERATIONS.md)     | Running, health, backups, restore, shutdown and release checks       |
| [FINDINGS](FINDINGS.md)         | Issues discovered, fixes, technical challenges and residual risk     |
| [VERIFICATION](VERIFICATION.md) | Checks actually performed, evidence and unverified behavior          |
| [TODO](TODO.md)                 | Prioritized follow-up work with completion criteria                  |

[Google Maps discovery and contacts](GOOGLE_MAPS.md) describes the optional map setup, location permission and saved-place handling.

Runtime configuration and provider credentials live in the local `.env`, never in these documents. `.callori/` contains private runtime data and is excluded from Git. Test fixtures and smoke checks use isolated data; they do not place real calls.
