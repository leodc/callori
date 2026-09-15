# Business discovery and saved contacts

The first wizard step selects the calling country. Japan is the only enabled destination. After choosing a service, the user can find a business without leaving the request, or reuse a saved contact. Dentist searches start with `歯科`, clinics with `クリニック`, beauty/hair services with `美容院`, and restaurants with `レストラン`. Known service terms are inferred from the request and are not presented as another question. Only requests without a known service show a business/service input; private free-text reasons are never used to guess a public search query. Appointment reasons and profile fields are never included in discovery requests.

Opening the configured finder requests location once, through the browser permission prompt. If granted and inside Japan, the known service search starts automatically. A short notice explains permission and the option to search by city, neighborhood or station in the floating map controls. Denied, unavailable or out-of-region location leaves that area search usable. A manual search supersedes a pending location callback; closing the finder cancels its outstanding UI work. The **Near me** control explicitly retries location. Nearby results are restricted to a roughly 10 km-wide viewport; returned addresses must also belong to Japan. The initial map center is Tokyo, but no search silently assumes Tokyo is the user’s location. Location is used in memory and sent directly to Google, never stored by Callori.

Numbered map pins and the adjacent results panel select a place detail view. On mobile, the map stays above the scrollable panel. Explore and Saved retain the current search within the open finder. **Choose this place** copies the business name, valid Japan phone and branch address into the wizard. It does not place a call. Normal review, consent, profile opt-in and server destination validation still apply. Closed businesses and places without a valid published phone cannot be selected for dialing; they can still be inspected on Google Maps.

## Enable the integrated map

Discovery stays inside Callori: there is no external search CTA. Without a key, the finder explains that search is unavailable and the phone can be entered directly in the request. Google attribution, place-source and policy links remain. Automatic selection uses Maps JavaScript/Places APIs.

1. Create/select a Google Cloud project with Maps Platform billing enabled.
2. Enable **Maps JavaScript API** and **Places API (New)**. The implementation uses `Place.searchByText`, `Place.fetchFields` and advanced markers, not legacy Places or the Embed API.
3. Create a dedicated **browser** API key. Restrict its applications by website referrer to `http://127.0.0.1:3000/*` and `http://localhost:3000/*`. Restrict its APIs to the two enabled APIs. Add the exact deployment origin only when deploying. The loader sends origin referrers, so do not create a path-specific restriction narrower than the whole origin.
4. Add `GOOGLE_MAPS_BROWSER_KEY` to `.env`. This key is intentionally delivered to the browser by the local, protected config endpoint; OpenAI/Telnyx secrets are never included.
5. Optionally set `GOOGLE_MAPS_MAP_ID` to your JavaScript map ID, not an API key. Local development falls back to `DEMO_MAP_ID`; configure your own before hosting.
6. Restart Callori and reload the page. Verify both map tiles and Places results, referrer restrictions, quotas and phone fields against the actual Google project.

The SDK is loaded only when opening the finder, using the existing script nonce and the quarterly channel. CSP allows Google Maps image/network/font/frame/worker origins, while retaining nonce-based script restrictions. Location permission is limited to the application's own origin. No global tracking or background geolocation is added.

## Saved contacts and data handling

SQLite stores only the Google Place ID, calling country and creation timestamp, with a 100-contact cap and idempotent saves. It does not create a persistent directory of Google names, addresses, coordinates or phone numbers. Opening saved contacts fetches current details on demand; unavailable references can be removed. The initial batch is ten places and more are loaded only on request. Failed changes are not shown as successful saves.

Once a user chooses a business for an actual call, the selected phone/name/branch address become part of that call request and follow the existing call-history retention policy. Google result data otherwise lives only in the open finder/session. No Google reviews, photos, ratings or profiles are collected. Attribution and links to Google Maps are displayed with results. Results are subject to provider accuracy and do not establish availability, quality or recommendation.

Before public hosting, provide the operator's publicly accessible terms and privacy policy incorporating the applicable Google terms, review the Google project billing region/EEA-specific restrictions and validate the intended transactional data retention. Callori's current supported deployment remains private; this change does not add authentication, subscriptions or multi-user support.

## Validation boundary

Automated checks cover query construction/encoding, country and phone filtering, geolocation search bounds, branch context, ID-only contact persistence, deduplication, deletion, limits and protected config/contact endpoints. Browser checks use a clearly isolated Google SDK fixture for the configured flow; they cannot certify actual Google authorization or tile/API connectivity without the operator's key. On 2026-09-16, the local browser key was configured in `GOOGLE_MAPS_BROWSER_KEY` after it had been mistakenly placed in `GOOGLE_MAPS_MAP_ID`. After restart, real Google tiles loaded and a restaurant search near Shinjuku Station returned ten results without browser errors. No contacts were saved or calls placed. Google Cloud restriction settings and quotas were not independently audited; live saved-contact detail refresh remains to be verified.

The September 16 map redesign was checked with live tiles and ten real restaurant search results, plus desktop and 390×844 screenshots. Isolated browser checks cover automatic permitted-location search, denied/out-of-region fallback, closed/no-phone blocking, saving/removing references, restoring results across tabs, selection without dialing, a manual search racing a late location response, closing with location pending and missing Maps configuration. No real contact mutations or calls were made.

To replay the isolated flow, start Callori, open `/calls/new?template=restaurant` with `agent-browser --session callori-check`, then run:

```sh
agent-browser --session callori-check eval --stdin < tests/fixtures/maps-browser.js
agent-browser --session callori-check eval --stdin < tests/fixtures/maps-flow-check.js
agent-browser --session callori-check eval --stdin < tests/fixtures/maps-fallback-check.js
agent-browser --session callori-check close
```

These scripts require the Spanish interface. The fixture intercepts all contact writes and call submissions; it does not test Google availability or save synthetic data to the server.

## Official references

- [Text Search (New)](https://developers.google.com/maps/documentation/javascript/place-search)
- [Place Details (New)](https://developers.google.com/maps/documentation/javascript/place-details)
- [Maps URLs](https://developers.google.com/maps/documentation/urls/get-started)
- [API key security](https://developers.google.com/maps/api-security-best-practices)
- [Content Security Policy](https://developers.google.com/maps/documentation/javascript/content-security-policy)
- [Storage and attribution policies](https://developers.google.com/maps/documentation/javascript/policies)
