# Live validation — updated 20 October 2026

Local release candidate: Houselights 1.2.0, Node 24, Qloo harness 0.1.26. Credentials were supplied through ignored `.env` and are not present in this report or source control.

This is a dated validation log. Earlier entries describe the configuration and features at the time of each check; the latest dated entry records subsequent verification. Dates use the project's Asia/Calcutta timezone; retained machine timestamps are UTC.

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

## Real controls, investigation and operational safeguards — 18 October 2026

Groq credentials are now configured server-side. The real provider is `groq`, with requested and returned model `openai/gpt-oss-120b`; these results replace the earlier missing-credential status. No paid plan was enabled by this work.

| Brief | Local source | Benchmark batch | Attempted | Feasible controls | Retained failures |
| --- | --- | --- | ---: | ---: | --- |
| London | `LgjVq_hwWw` | `x-3rYZczTjDprEUq` | 3 | 2 | One HTTP 429 |
| Berlin | `uXhLhA-gOg` | `wBdLd7ohRkG8R7ks` | 3 | 3 | None |

- All six model attempts remain recorded, including the rate-limit failure. Each city's feasible trials produced one distinct control selection. Repeated agreement is not independent evidence of quality.
- Both briefs use the same six-artist pool and illustrative booking assumptions. This verifies two-city execution under the same declared constraints, not generalization across event types, genuine booking quotes, ticket demand or Qloo superiority. The model control received no Qloo scoring evidence and had no tools enabled; the shared pool itself may have been discovered with Qloo.
- The Berlin source came from durable festival job `b872c301-a7c0-4d35-8915-b441fe33cb74`, which emitted **24 successful new Qloo receipt events** and preserved its London parent. Totals in the saved snapshot also include inherited receipts; they are not the count of new calls. Machine-readable evidence is retained locally in `artifacts/gap-live-validation.json`.
- The first trial from each batch was used to prepare a two-case blind-review study for four declared roles: venue programmer, festival organizer, artist booker and audience member. **Zero human ballots have been collected.** Roles are invitation labels, not authenticated reviewers. Invitation tokens remain in private local artifacts; no invitation was sent externally.

### Model-directed investigation validation

The native tool loop has made real model calls, inspected saved evidence, corrected a rejected argument and performed a fresh Qloo fixed-pool ranking and an exact hypothetical scenario. Earlier failures are retained: the initial JSON response attempt returned HTTP 400; a native run encountered HTTP 429; and paced run `bbf6ef41-4b17-4ff2-b222-d99d473e023c` saved `DAwBESo41A` with four HTTP 200 tool proposals followed by a final HTTP 400 `tool_use_failed`. Its persisted investigation status is `model_unavailable`, even though the durable job completed saving partial evidence. No findings were invented to turn this into a completed investigation. See `artifacts/native-investigation-validation.json`.

The function-call instructions and argument schema were corrected. Additional trials exposed premature completion and repeated attempts to reuse a failed query. These led to enforced evidence inspection, a changed scenario with a final citation, removal of exhausted query actions from the schema, and a final-step finish constraint. The repeated-query run `8ff2553c-8e89-4efd-8524-d76c2d2462b6` is retained as `d-Z9dM147w` with investigation status `step_limit`; its durable job completed saving partial evidence.

The final native run `81fece01-b8a2-4bcc-8740-44069507973f` completed and saved `hglWvCgjgA`. All four Groq calls returned HTTP 200: `test_scenario`, `inspect_receipt`, `market_rank`, then `finish`. The fresh London ranking returned the complete pool. The exact £10,000 scenario selected Caribou + Wolf Alice while preserving existing locks and booking assumptions. The source remained unchanged. Machine-readable evidence: `artifacts/native-investigation-release.json`.

Execution success does not establish prose accuracy: the final model commentary incorrectly called the £14,000 budget the current slate cost, which is £12,000. Citation existence is checked; claim entailment is not. The app therefore leads with server-executed results and puts model commentary in a separate review-required disclosure, with original observations available. No model statement is used to alter fees, availability, policy weights or commercial approval.

### Regression and backup evidence

- The final regression transcript records **198/198 tests passed** with `node --test --test-concurrency=1` in 60.56 seconds, including the official MCP worker check. An earlier 195/196 run hit that worker's existing startup timeout; its standalone rerun passed in 2.71 seconds without relaxing the timeout. Two saved-client tests exposed missing event APIs in the minimal DOM test fixture after adding decision-change cleanup; the fixture now supplies and checks that event. Transcript: `artifacts/gap-closure-tests-final-verified.txt`.
- Added coverage exercises native Groq/Anthropic action parsing, bounded investigator tools and citations, cancellation and provider pacing, immutable scenario adoption, private source review, stale-approval rejection, legacy packet/pipeline gates, joint commercial stress, and content-preserving backup/restore. Provider stubs and synthetic commercial sources in these tests are not live provider or commercial evidence.
- The actual local SQLite database was backed up with the online backup API to `artifacts/release-backup-2026-10-18`, then restored separately to `artifacts/restore-drill-2026-10-18`. Both copies passed integrity checks and matched the manifest's schema/content digests for all **11 tables**. At backup time there were 30 snapshots, two benchmark batches, four research runs, 138 research events and three portfolios. The review study was created afterward and is not in that backup.
- The backup contained no operational evidence, decision sessions, pipelines or ballots at that point. Their behavior has automated test coverage; this drill does not claim real populated operational workflows were restored. Backups and review artifacts remain private and ignored by Git.

Public hosting remains deferred and Docker is unavailable on this machine. Genuine human judgments, authenticated artist terms and hosted persistence are unverified. The bounded investigator is not a general web or email agent, and the six reference archives have not been ported in full; [capability status](archive-capability-status.md) lists the implemented adaptations and remaining scope.

## Scenario adoption and release verification — 19 October 2026

- Browser adoption of the completed investigator exposed a legacy provenance loss: removing derived festival research also removed the exact rank dependency, leaving two possible rank receipts. Derived candidates now retain explicit legacy bindings across investigator adoption, manual scenarios and GM revisions. Existing empty bindings and genuinely ambiguous evidence are not guessed or overridden. The new browser-saved scenario `1TX5p7k8vA` selects Caribou + Wolf Alice at £10,000, retains rank receipt `g7`, and requires a new organizer decision. No approval or booking was performed. Screenshot: `artifacts/scenario-review-2026-10-19.png`.
- Dossier freshness checks now distinguish the original investigation input from the result with additional research receipts. New runs bind a result digest; legacy reports require the unchanged parent inputs and original receipt prefix. The live dossier for `hglWvCgjgA` includes its three attributed interpretations. Changed terms or original evidence invalidate the report.
- The first full check passed 199/200 tests; the official MCP startup exceeded 20 seconds. A standalone check reproduced it, and importing the official adapter alone took 39.57 seconds. Bundling the installed adapter with esbuild reduced the standalone MCP test to 0.72 seconds without raising its timeout or replacing official tools. The final full suite passed **200/200 in 30.05 seconds**: `artifacts/gap-closure-tests-release-2026-10-19.txt`. Missing or lockfile-stale bundles fall back to the installed adapter; deployment now includes an explicit build step.
- A fresh bundled-adapter Qloo `describe` request returned `ok`, one artist result, in 2.59 seconds: `artifacts/bundled-qloo-live-confirmed-2026-10-19.json`. The first manual probe used the wrong argument name and was rejected locally by the official schema; its error receipt is retained separately. Neither timing is a production latency guarantee.
- The final backup and isolated restore in `artifacts/release-backup-2026-10-19-final` and `artifacts/restore-drill-2026-10-19-final` matched integrity and content digests for all 11 tables: 40 snapshots, 10 research runs, 240 research events, two benchmark batches, three portfolios and one review study. Ballots, operational evidence, pipelines and decision sessions remain empty in the real database; their populated behavior has isolated automated coverage only.

## Verified fact selection and diverse briefs — 19 October 2026

- **212/212 tests passed** in 41.73 seconds with `npm test -- --test-concurrency=1`. Transcript: `artifacts/evidence-release-tests.txt`. New regressions cover fact selection, invented prose rejection, incomplete rankings, fixed offered pools, evaluation coverage, partial benchmark batches and Vercel packaging. A final coverage-counter correction also keeps incomplete ranks out of agreement diagnostics; its focused agent/evaluation check passed 4/4 tests (`artifacts/rank-counter-tests.txt`).
- Real Qloo preparation used 72 workflow calls across Manchester jazz, Berlin electronic, Mumbai independent and New York alternative-soul briefs. All returned successful status envelopes, but Berlin and Mumbai initially ranked only seven of eight resolved candidates. This exposed a scoring bug: the base memo builder treated returned ranks from a partial pool as comparable. It now leaves all fit scores unknown for an incomplete pool. The decision proof also rejects legacy selected-rank receipts whose requested options are absent from returned evidence.
- Before any new controls, a uniform amendment restricted all four cases to their five offered artists and re-ranked each pool, with four additional real Qloo workflows. Both the original sources and the declaration are retained. Manchester, Berlin and New York returned complete rankings; Mumbai remained incomplete and was not silently removed. Booking fees, genre labels and availability are illustrative, not authenticated market quotes.

| Case | Fixed-pool source | Requested trials | Live model calls | Feasible controls | Result |
| --- | --- | ---: | ---: | ---: | --- |
| Manchester | `Snqz4ifQcg` | 2 | 2 | 2 | Both controls matched the optimizer's selection |
| Berlin | `LKBOsPF5dA` | 2 | 2 | 2 | Two distinct controls; neither matched the optimizer |
| Mumbai | `yWDAh85Zhg` | 2 | 0 | 0 | Non-comparable ranking; one retained refusal and one unattempted trial |
| New York | `mhGhPs4W_A` | 2 | 2 | 2 | One repeated control; neither trial matched the optimizer |

The campaign is explicitly **partial**, with six genuine Groq calls and six feasible controls. Its four offered pools have distinct artist membership. These are execution and selection-agreement results, not evidence of Qloo superiority, demand forecasts, statistical independence or observed revenue. The first trials eligible for later blind review are `A61C7978DQ`, `XDxbn57dlg` and `_vJxfBMdDA`; no new reviewers or ballots were fabricated. Artifacts: `evaluation-preparation-d3a84256-99dc-42c6-abe3-3d14e0e75745.json`, `evaluation-offered-df13f513-08bb-4014-a75d-cf3d7a33abff.json`, and `evaluation-e741b495-7a59-4705-b317-0394749502b6.json` under ignored `artifacts/`.

The live version 2 investigation `a0c895f1-b329-4141-9af6-6f6167cb3b12` saved completed result `QWgj_QrB6g`. Three native Groq calls returned HTTP 200: receipt inspection, scenario test and finish. It inspected a trends receipt, made zero new Qloo queries and selected five server-rendered facts. The report distinguishes a £6,000 declared budget from £4,600 in assumed fees for Nubya Garcia + Alfa Mist. Its tested £4,500-budget alternative selects Alfa Mist + Makaya McCraven for £4,400, a £200 planning difference. Free-form factual conclusions are not accepted by this protocol; facts remain conditional on supplied evidence and assumptions. No proposed alternative was automatically adopted or approved. Job record: `artifacts/live-fact-investigation.json`. Browser verification confirmed the rendered facts and disclosure after restarting the preview, with no captured JavaScript errors; screenshot: `artifacts/verified-facts-browser-2026-10-19.png`.

Vercel frontend packaging is implemented and tested locally. It requires an explicit HTTPS backend and exports only public assets plus rewrites, refusing hidden files, symlinks and existing output directories. No Vercel deployment or persistent backend has been provisioned. Public walkthrough, artwork permissions, real reviewer judgments and genuine commercial evidence remain unverified.

## Durable benchmarks and public judge experiments — 20 October 2026

- **222/222 automated tests passed**, zero skips, in 9.72 seconds (`artifacts/release-tests-2026-10-20.txt`). New coverage includes idempotent benchmark submission, first-trial retention, cancellation during provider execution, expired leases without replay, source mutation, shared quotas, private-field exclusion, immutable judge cases, public access boundaries, evidence withdrawal, survivor recovery and invalid input rejection.
- Two one-trial live Groq checks completed through the new worker with feasible controls. API check `8dd29a4c-2e21-44f2-bff5-19eb33662720` returned HTTP 202 in 1,361 ms, then a retained HTTP 200 provider result and snapshot `6cdukv112w`. Browser check `1ecd4cdf-3401-4233-8b69-cd2868aedf87` saved `WfXy-xOOTw`; reloading and reconnecting displayed that same batch and first trial without another model request. These were transport/lifecycle checks, not additional independent evaluation cases.
- Four public judge projections were prepared from Manchester, Berlin, New York and Mumbai. Their fields exclude private documents, reviewer credentials, approval records and model conversations. Mumbai still shows unknown ranks and a blocked proof. The export `artifacts/judge-public-cases-2026-10-20.json` can seed the future backend; it is not a public deployment.
- Browser interactions verified that Manchester's GBP 4,500 budget selects Alfa Mist + Makaya McCraven for GBP 4,400; withdrawing the rank receipt blocks evidence without necessarily changing the lineup; canceling Nubya Garcia retains Alfa Mist and selects Kokoroko at GBP 4,800. Inputs remain explicitly illustrative. No captured JavaScript errors occurred on either the judge page or evaluation page. Screenshot: `artifacts/judge-budget-proof-2026-10-20.png`.
- Online backup and isolated restore matched all **12 tables**, including four public judge cases, eight benchmark batches, thirteen research runs, 264 events, 58 snapshots, three portfolios and one study (`artifacts/release-backup-2026-10-20`, `artifacts/restore-drill-2026-10-20`). Real ballots, private commercial evidence, pipelines and decision sessions remain empty.
- External hosting, real host restart/volume tests, organizer-workspace artwork permission and genuine human/commercial evidence remain unverified. Anonymous judge actions use no Qloo or LLM calls and do not create bookings or approvals.

## Public three-method comparison — 20 October 2026

- **228/228 tests passed**, zero skips, in 36.14 seconds (`artifacts/judge-comparison-tests-2026-10-20.txt`). Additional regressions cover stale or altered briefs, first-trial enforcement, provider provenance, private-field removal, untrusted cached scores, invalid selections, retained failures and fixed-selection budget/cancellation/evidence replays.
- Four additional public cases use the already recorded first trials from the four-market campaign. Manchester's Qloo and LLM selections both cost GBP 4,600; the cheapest feasible selection costs GBP 4,400. Berlin's optimizer and cheapest selection cost EUR 10,000, versus EUR 12,500 for the saved control. New York's optimizer costs USD 13,500, the cheapest selection USD 9,000, and the saved control USD 10,000. These illustrative costs are not quotes, and lower cost alone does not establish a better event. Mumbai retains its non-comparable result and no model generation.
- Browser verification of Berlin showed the three selections and the original matched comparison. Reducing the budget to EUR 10,000 retained Moderat + Bicep as the fixed LLM selection, marked it infeasible and exposed the EUR 2,500 budget violation. The interface labels this as a replay and suppresses the matched-benchmark point delta. Screenshot: `artifacts/judge-three-methods-2026-10-20.png`. No additional provider calls were needed.
- The updated export `artifacts/judge-comparison-cases-2026-10-20.json` contains eight curated cases, preserving the original four links. Model prose, raw responses, private source IDs, batch IDs and provider request IDs are excluded. Model/provider statuses and content digests are application-recorded provenance, not independent signatures or outcome evidence.
- Public hosting, artwork permission and independent human/commercial evidence remain unresolved. This increment does not turn saved controls into independent validation or establish real-world revenue or attendance gains.
