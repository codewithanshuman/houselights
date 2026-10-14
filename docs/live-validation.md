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
