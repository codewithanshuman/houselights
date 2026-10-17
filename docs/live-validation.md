# Live validation — updated 16 October 2026

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

## Supporting fandoms and capacity evidence continuation

On 14 October 2026, the reattached Routed and Theme Night GM ZIPs were inspected at their new paths; their hashes matched the previous audit. The Routed capacity parser was ported with its MIT license. Capacity review, conflict selection, qualification and escaped HTML export were exercised end to end with explicitly synthetic supplied venue text. No independently retrieved venue capacity is claimed.

Live crossover research was exercised through the Festival GM browser controls:

- `UtwpOKiSMg` → `idnkUXMoDQ`: Free Guy plus proposed supporting fandom Monument Valley. **34/34 new receipts were `ok`**, all freshly fetched. The comparison returned no shared context; the support was excluded from partner signals.
- `idnkUXMoDQ` → `Panf8DVVUA`: retained Monument Valley and added Little Women as a second proposed support. **35/35 new receipts were `ok`**, 30 cached and five fresh. Receipt `g217` returned shared labels **Romance** and **Relatable** for Little Women. Four partner queries (`g218`–`g221`) used Free Guy plus Little Women. Monument Valley stayed excluded (`g216`).
- Both anchors and their Taste Fit values remained unchanged; all receipt IDs in the saved chain are unique. These labels establish returned cultural context only, not ticket-buyer overlap or combined-theme demand.
- The browser displayed both decisions and their receipts with no captured JavaScript errors. Local proof: `artifacts/crossover-browser.png`; validation summary: `artifacts/crossover-validation.json`.

Tests include multilingual extraction, conflicting capacities, source attribution limits, content hashes, explicit capacity opt-in, availability independence, snapshot invalidation, organizer protection, HTML escaping, crossover exclusions, unchanged anchor scores and canonical harness schemas. The first full run hit a worker startup timeout; the same canonical worker test passed in isolation. Test fixture issues found during added invalidation checks were corrected without changing production validation or quotas.

Final full regression: **140/140 tests passed** with `node --test --test-concurrency=2`. This includes the official worker/schema test. The local test transcript is `artifacts/crossover-capacity-tests.txt`.

## Decision Room proof and organizer review

On 16 October 2026, the Decision Room was exercised against the existing saved London Qloo evidence. Proof generation made **zero new provider calls**. This validates saved-evidence analysis, not a new live retrieval or a commercial forecast.

- The grounded decision remains **The xx + Caribou (£12,000)**; the constraint-only minimum-cost selection is **Caribou + Wolf Alice (£10,000)**. Both use the same pool and buyer-entered assumptions.
- Five evidence-class ablations and twelve individual receipt ablations were evaluated. Withdrawing the shared audience ranking `g7` or the selected-pair observation `g22` changes the slate. Both become explicit organizer review findings. All six discrete preference profiles preserve this example's selection; both single-act cancellations have feasible survivor-preserving recoveries.
- Browser checks verified immutable proof creation, a £10,000 unsaved budget preview, artist evidence cards, and navigation to the expanded original `g7` receipt. An attempted approval with unacknowledged findings was rejected, preserved the entered rationale, and left draft generation disabled. The saved decision remains awaiting review with no approval transitions or sent messages.
- Final local proof: `LgjVq_hwWw`. Narrow and desktop layout checks showed no horizontal document overflow or captured JavaScript errors. Screenshots and the machine-readable proof are stored locally under `artifacts/`; the HTML dossier also includes its decision proof.
- **155/155 automated tests passed** with `node --test --test-concurrency=2`, including the official MCP worker handshake. The initial unrestricted-concurrency run timed out during that worker's initialization; bounded runs passed without relaxing production validation or the worker timeout. Final transcript: `artifacts/decision-os-tests-final.txt`.
- New regression coverage includes shared-receipt withdrawal, both directions of pair evidence, exact cent-valued budget boundaries, missing evidence and fit floors, optimizer tie precision, lock-preserving recovery, legacy provenance invalidation, stale approvals, organizer access, revision conflicts, unsent drafts, public redaction and escaped dossier export.

The LLM-only column remains explicitly unavailable because no real control was generated. No external reviewer outcomes are invented. Partdrop is still awaiting upload; no source reuse from it is claimed. Multi-event portfolio optimization, a model-driven critic and a unified gate across legacy commitment APIs remain later stages, as described in `docs/decision-os.md`. Public hosting remains deferred.
# Portfolio, Groq transport and blind-review validation — 17 October 2026

- The final regression run passed **167/167 tests** with `node --test --test-concurrency=1` (44.3 seconds). Two earlier runs hit the existing MCP worker's 20-second startup timeout; a standalone handshake subsequently connected in 2.46 seconds and listed ten official tools. The final full run passed that same startup assertion without relaxing its timeout. The final export-response adjustment also passed both portfolio/benchmark API tests.
- The supplied PartDrop archive was inspected and its scheduling adaptation attributed; see [the integration audit](partdrop-integration.md). No reference-project scripts or credentials were executed.
- Browser and API verified saved portfolio `IOvGOzBCO1iF`, using real saved Qloo source `LgjVq_hwWw` with illustrative April 2027 dates and buyer-assumed fees. Independent choices cost £24,000 and violate the £22,000 shared budget. The exact joint result selects Caribou + Wolf Alice (£10,000) and The xx + Caribou (£12,000), with linked evidence checks and a reconciled planned cash timeline.
- Canceling The xx in the second event through the browser created immutable rehearsal `mlDtXclXz9Sb`, replacing that selection with Wolf Alice and retaining every surviving selection. Its total is £20,000; the original remains £22,000 with The xx selected. These are planning scenarios, not actual cancellations, holds, contracts, payments or verified savings.
- Reloading a saved portfolio restores its declared inputs. Recovery reports identify their parent and distinguish the survivor locks from a new plan started in the form. Local screenshot: `artifacts/portfolio-recovery-browser.jpg`.
- Groq is selected with `openai/gpt-oss-120b`, but `GROQ_API_KEY` is absent. The browser correctly reports the missing configuration and refuses a genuine benchmark. Transport tests use an explicit stub; they are **not live model results**. No actual model performance or Qloo-versus-LLM improvement is claimed.
- Blind review now supports venue programmers, festival organizers, artist bookers and audience members, with optional cultural-fit, breadth and practicality ratings. API tests verify roles, genuine-generation gates, stale briefs, first-trial selection, and concealed source labels using isolated test data. **No real external judgments were collected or invented.** See [the evaluation protocol](evaluation-protocol.md).

## Persistent research and six-archive audit — 17 October 2026

- Reidentified all six supplied archives by SHA-256 and checked the relevant research, storage, replay, logistics, inspection and analysis modules against the existing mappings. [Capability status](archive-capability-status.md) records the meaningful omissions explicitly.
- **175/175 regression tests passed**, including eight new tests for idempotency, atomic completion, source immutability, event-chain verification, cursor replay, real workflow plumbing with synthetic transport, cooperative cancellation, lease expiry, queue limits, private history and failure redaction. Test log: `artifacts/persistent-research-full-tests.txt`.
- Browser proof-only run `2489960d-882c-4cb0-84ae-13d010f13e5d` reused saved live source `LgjVq_hwWw`, made zero provider calls, and saved proof snapshot `2mRcSf7rVQ` with four recorded events.
- Browser festival run `53da8d5a-12cd-41fc-a67a-f01f95e2089b` started against the same saved London pool. The page was reloaded while the run was active; **Reconnect last request** restored the same run, without a second job. It completed with **28 successful Qloo workflow receipts**, 68 journal events and result `m-hbzMKa4w`, including a new decision proof. The source snapshot remained unchanged. This verifies execution and provenance, not commercial performance.
- Queue interruption and cancellation were tested with isolated synthetic transport. No live provider call was intentionally canceled, no organizer decision was approved, and no external message or payment was sent.
