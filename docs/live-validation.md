# Live validation — 14 October 2026

Local release candidate: Houselights 1.2.0, Node 24, Qloo harness 0.1.26. Credentials were supplied through ignored `.env` and are not present in this report or source control.

## Verified

- Eight bounded live checks succeeded: two artist resolutions, local ranking, demographic ranking, demographic evidence, audience comparison, geographic popularity and cross-domain recommendation. The machine-readable report is locally saved at `artifacts/live-validation.json`.
- A fresh London booking brief produced **41 successful Qloo receipts, zero failed receipts**, a complete comparable audience ranking, interpretable selected-pair evidence and a feasible festival decision.
- Canceling a selected act saved a new recovery snapshot, excluded the canceled act, retained the survivor and stayed within the £14,000 budget. Recovery fees totaled £10,000. Fees and availability were explicitly illustrative buyer inputs, not data obtained from Qloo.
- Local snapshot IDs: initial memo `YYkZD5KEQQ`, festival research `AtA4BGVyIQ`, recovered decision `wTYZJr84iw`. These IDs depend on the local persistent data volume; they are not a public deployment.
- All **124 automated tests passed**, including the installed official MCP worker handshake, tool-schema limit checks, interpretation of live comparison structures, cancellation constraints, access control, retention and blinded-review ballots. Dependency audit: zero known vulnerabilities at the time of validation.

## Fixes discovered through live calls

The interactive CLI router stalled before opening the MCP connection on this machine. The app now starts the installed canonical MCP adapter directly, preserving its tools and trust checks; the harness version is pinned. The production API host returned 401 for this event key. Explicit configuration of `https://hackathon.api.qloo.com` succeeded; there is no silent endpoint fallback. The separate host is documented in the [organizer's API-key notice](https://qloo-hackathon.devpost.com/forum_topics/41339-notice-didn-t-get-your-api-key-or-is-your-api-key-not-working).

Live contract validation also corrected Market DNA and heatmap requests to the 20-result cap, batched trend requests at five artists, and interpreted comparison tags only when explicit membership exists on both sides. Unknown structures remain unsupported rather than becoming fabricated similarity.

## Reproduce

Start `npm start` with the configured key and endpoint. Run `npm run validate:live`, then `npm run validate:festival`. Set `HOUSELIGHTS_URL` if the server uses another address, and supply `ORGANIZER_TOKEN` when protected mode is enabled. These commands use bounded real provider calls and save compact reports under ignored `artifacts/`.

The successful example demonstrates integration and constraint handling, not accurate ticket forecasts, real artist quotes, confirmed availability, independent promoter preference or superiority over an LLM. LLM control remains unavailable without model credentials. No real review ballots have been collected. Public hosting is deferred, and Docker is not installed on the validation machine, so the container build and hosted backup/restore procedure remain unverified.

## Theme-specific research continuation

On 14 October 2026, the new `season-research` workflow was checked against the live event endpoint and exercised through Festival GM in the in-app browser.

- London, two illustrative dates (1 and 15 April 2027), under-25 and 25–34 planning groups, and an explicit United Kingdom reference market.
- Five domains × ten candidates, with local/reference ranks and three age-bucket calls per domain: **25 complete fixed-pool ranking receipts**.
- Four partner queries per night: eight distinct theme-specific research workflows.
- Initial input `technology` produced two provider candidates (industry and keyword). Sponsor leads stayed empty and research status stayed `partial`; no category was selected automatically. Saved initial example: `Y0S9GS2hgQ`; browser ambiguity example: `irtxBkpgdQ`.
- The browser rejected continuing with no category selection. Choosing `urn:tag:industry:qloo:technology` saved `hsiOa7WcGw`: **33/33 new receipts `ok`**, with 31 cache hits and two fresh sponsor workflows. All eight partner queries returned leads.
- Replacing only the first night's theme with **Free Guy** saved `UtwpOKiSMg`, preserved **RuPaul's Drag Race UK** on the second date and retained the unchanged parent. The replacement added 33 successful receipts (29 cached, four fresh partner workflows). The exported dossier contained the replacement theme and its receipt references.
- Browser checks found no JavaScript errors. Local proof: `artifacts/theme-research-browser.png`; machine-readable summary: `artifacts/theme-validation.json`.
- Final regression: **131/131 tests passed** using `node --test --test-concurrency=2`, including canonical harness schema validation, category ambiguity, incomplete rankings, overrides, budget preflight, organizer access and durable research quotas. One earlier concurrent worker startup timed out; isolation and both subsequent full runs passed.

`Complete` describes coverage of requested research, not commercial suitability. Only the local and segment components of theme Taste Fit are measured (55% of the original weights); near-venue concentration, momentum and new-fan reach remain estimated. Family life-stage is still unsupported. Partner leads are uncontacted, and no availability, sponsorship agreement, content rights or ticket demand is established by these tests.
