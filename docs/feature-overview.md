# Houselights: feature overview and configuration

This is the full feature description, configuration reference and verification history that used to be the README. The [README](../README.md) now keeps only the lead, the four-step path, what is and is not measured, and the reproduce commands.


**Constraint-correct, auditable booking decisions for live events, with Qloo receipts.** A promoter gives Houselights a brief: city, the artists whose audience they want, candidate acts, fees, availability and booking rules. Houselights uses Qloo audience affinity to rank the candidates, finds the best lineup that satisfies every rule, and links each conclusion to the saved Qloo response behind it.

**The two-minute path** (no sign-in): open the [Booking Desk](https://houselights.80-225-218-239.sslip.io/judge.html) and follow its four steps.

1. **The brief.** New York: 2 slots for listeners of Leon Bridges, a $14,500 artist budget and 8 candidates with illustrative fees.
2. **The optimized slate.** Michael Kiwanuka + Sault ($13,500). Every booking rule passes, and the near-tie and the human decision are shown.
3. **Withdraw Qloo evidence.** The same optimizer, pool, fees and budget now book Jordan Rakei + Hiatus Kaiyote ($9,000). The decision changes, with zero provider calls.
4. **Check the receipt.** Open the saved Qloo rank response (`r9 · rank`) behind the change.

**What this shows, and what it doesn't.** Qloo evidence changes the decision in 7 of the 9 briefs with a complete Qloo ranking. When the top acts by Qloo rank can actually be booked, the optimizer usually books them; it chooses differently only at a near-tie. In 3,600 randomized scenarios it differed in 11.7% of such cases, all in one brief. Its main contribution is constraint handling: in 58% of scenarios the top-ranked acts could not be booked, and it either found the best bookable lineup or said none exists ([rank vs optimum](../results/rank-vs-optimum.md)). No ticket-sales or profit improvement has been measured, and published fees are illustrative. See the [claims audit](claims-audit.md) and the list of [corrections we made to our own claims](competition-changelog.md).

**Houselights Autopilot 2.0** turns a promoter's brief into a decision packet. The steps:

- Fit uses Qloo's own affinity scores rather than ordinal ranks, scaled over a fixed 0.05 span so tiny gaps stay tiny. Pairs of acts within 0.002 are flagged as near-ties and re-checked, and briefs whose Qloo ranking is incomplete are marked not comparable.
- The [response to the drawbacks audit](drawbacks-audit-response.md) lists what was fixed, what was relabelled, what was measured and what remains open, including that no real booking advantage has been shown.
- Every open evidence question is tested against the exact optimizer, jointly as well as alone. A second signal that only matters in combination is no longer missed.
- Qloo calls are spent only where an answer could change a bill within the call budget, or is needed to justify a booked act.
- Feasible strategies are compared under one common set of disruption scenarios: cultural fit, lower cost, more robust, ranked-only and location-free. Backups are named for every act.
- An organizer-ready packet is written, with receipts, fee and availability status, break points and approval-tagged next actions.

Organizers create and revise their own events in the private [organizer workspace](organizer-workspace.md). Judges see a recorded live New York run and a recorded organizer session on a brand-new event in the [Booking Desk](https://houselights.80-225-218-239.sslip.io/judge.html#8be4d03ef4792ca9f1466983). Every published record carries content digests and a pinned manifest. Provider authenticity is stated as unverifiable. See [Autopilot 2.0](autopilot.md) and the [milestone report](autopilot-2-report.md).

The [advanced workflows](advanced-workflows.md) include a bounded model-directed investigator with native function calls and server-rendered facts, private source-document review, approval enforcement across planning APIs, joint commercial stress, diverse-brief evaluation, and verified SQLite backup/restore. Real Groq controls cover London, Manchester, Berlin and New York; an incomplete Mumbai ranking remains explicitly non-comparable. External human judgments remain pending.

**Public demo:** the [Houselights Booking Desk](https://houselights.80-225-218-239.sslip.io/judge.html) on the existing Oracle ARM VM. The latest deployment and its verification are recorded in the [shared-host deployment record](shared-oracle-host.md), which covers hosted release checks, real-browser checks, organizer access boundaries, backup and rollback drills. The [initial deployment validation](live-validation.md#oracle-public-deployment--20-october-2026) is kept for history. The hostname uses free third-party DNS. No new cloud resource was purchased or provisioned; account billing eligibility and long-term uptime have not been verified.

The [Booking Desk](judge-workspace.md) at `/judge.html` provides a one-minute path: tighten a budget, turn Qloo evidence off, and inspect the same saved pool's proof and receipts. It needs no organizer token or new provider calls. The [public evidence page](https://houselights.80-225-218-239.sslip.io/evidence.html) shows the recorded shock study, raw human-review counts and reasons when any exist, and the limits of the current evidence. Benchmark batches run in the [persistent worker](persistent-research.md#durable-benchmark-contract), with idempotent submission, cancellation, reconnect and explicit unknown outcomes after interruption.

The organizer-only [Demand Lab](demand-model.md) at `/demand.html` plans city-, event- and price-specific lineups from up to 20 candidates. The supplied real box-office rows are cataloged, but none contain timestamped pre-event predictors, so the lab displays an explicitly uncalibrated cultural proxy and buyer-entered financial scenarios. Immutable pre-event plans can later be paired with real ticketing outcomes; a numerical **paid-tickets-sold** model activates only after chronological holdout and minimum-data gates pass. A matched Qloo/no-Qloo backtest is defined but **has not run**: it needs 40 qualifying pre-event records and none exist yet. When it runs it must report negative results as well as improvements. Paid tickets sold are distinct from physical venue entries.

The [Financial Risk Lab](financial-model.md) at `/financial.html` compares exact-feasible lineups with 10,000–100,000 seeded, correlated outcome scenarios, explicit ticket/tax/fee/refund accounting, booking risk, break-even volume, CVaR, stress tests and replayable audit records. It consumes the Demand Engine and Audience Twin without converting Qloo fit directly to sales. Public runs use a real Booking Desk plan's candidates, Qloo fit and fees, with venue, ticket, sell-through and cost assumptions stated by the visitor; [historical financial validation](financial-validation.md) remains unavailable until genuine prospective settlement outcomes exist.

[Audience Twin](audience-twin.md) adds bounded Qloo rank research for organizer-defined taste seeds, deterministic clustering, synthetic weighted scenario profiles, overlap-aware lineup coverage, price and competition sensitivity, exact-slate scenario optimization and prospective event-total validation. Its weights and purchase behavior are assumptions, not Qloo demographics or an observed customer audience.

The [deterministic shock replay](../results/shocks.md) compares exact re-optimization, a fixed saved LLM lineup and three captured tool-free Groq re-prompts per shock, including clearly labeled synthetic 10- and 12-candidate stress cases. On the 77 comparable shocks where a feasible lineup exists, 3 of 231 re-prompted LLM responses (1.3%) violated a hard constraint, against 0 for Houselights, which enforces hard constraints by construction, so its 0 is a design property, not a measured intelligence advantage. The 7 unsolvable shocks, where the prompt forced a lineup, and Mumbai's non-comparable shocks are reported separately. `npm run reproduce:shocks` rebuilds the table offline from the saved fixture. Infeasible cases and missing controls remain visible rather than receiving substitute lineups. The [single demo path](judge-demo.md) shows the live execution trace, one changed decision and the stress result.

## Run locally

Requires **Node.js 24 or newer** and npm. The live integration starts the official Qloo harness as a local stdio child process, so use a normal Node server or container. Snapshots, pipeline updates, quotas and blind-review ballots use built-in SQLite.

```powershell
npm ci
Copy-Item .env.example .env
npm run dev
```

Open [localhost:8080](http://localhost:8080). `npm run dev` always uses **synthetic Qloo data** and displays a demo-mode label. Synthetic rankings, artists and evidence are for product development; they do not validate real audience fit.

For live Qloo, follow the [key request guide](key-request.md), put your key in `.env`, leave `QLOO_MODE` unset, and run:

```powershell
npm start
```

`npm start` loads `.env`. Never commit credentials or place them in browser code. The app works without an LLM. For Groq, set `LLM_PROVIDER=groq`, `GROQ_API_KEY`, and `LLM_MODEL=openai/gpt-oss-120b`. Anthropic remains available with `LLM_PROVIDER=anthropic`, `ANTHROPIC_API_KEY` and a supported `LLM_MODEL`. `LLM_MODE=off` disables model features. Restart after changing configuration. See the [evaluation protocol](evaluation-protocol.md) for limits and honest benchmark interpretation.

| Setting | Purpose |
|---|---|
| `QLOO_API_KEY` | Required for live Qloo calls |
| `QLOO_BASE_URL`, `QLOO_TRUSTED_BASE_URL` | Explicit event endpoint; this key was verified on `https://hackathon.api.qloo.com` |
| `LLM_PROVIDER`, `LLM_MODEL`, provider key | Optional model features; Groq uses `GROQ_API_KEY`, Anthropic uses `ANTHROPIC_API_KEY` |
| `PORT` | HTTP port; defaults to `8080` |
| `HOST` | Bind address; defaults to `127.0.0.1` locally; hosted Node needs `0.0.0.0` |
| `DATA_DIR` | Persistent SQLite directory; defaults to `./data` |
| `ORGANIZER_TOKEN` | At least 32 characters; required for production writes and private reports |
| `PUBLIC_DEMO` | Set to `1` to require organizer access locally too |
| `GM_CALL_BUDGET` | Festival research attempt ceiling; defaults to `60`, maximum `120` |
| `CALL_BUDGET` | Workflow attempts per memo; defaults to `30` |
| `INTELLIGENCE_CALL_BUDGET` | Workflow attempts per multi-market intelligence run; defaults to and is capped at `60` |
| `DAILY_MEMO_CAP` | Per-process daily memo cap; defaults to `150` |
| `QLOO_CACHE_TTL_S` | In-memory Qloo cache lifetime; defaults to six hours |
| `TRUST_PROXY` | Set to `1` only when the deployment has one trusted proxy hop |

## What the product does

Open **Decision Room** on a saved slate to build a decision proof. Compare a cost-first constraint-only baseline, a real saved LLM-only control (when configured), and Houselights under the same booking assumptions. Withdraw evidence by class or receipt, inspect the resulting lineup changes, test budget and preference sensitivity, and follow an artist to the consequential evidence. Structured challenge findings feed a persisted review → planning approval → unsent draft workflow. Blockers cannot be overridden by a model, and stale revisions cannot reuse approval. See [Decision OS implementation and limits](decision-os.md).

**Event portfolio** jointly optimizes 2–6 events under shared budgets, artist reuse/rest limits, venue conflicts and cash checkpoints. It compares independent event choices, certifies optimality only after a completed search, produces a cent-reconciled planning timeline and rehearses cancellations while preserving surviving bookings. The [PartDrop audit](partdrop-integration.md) identifies the source adaptation and limits.

**Independent evaluation** runs repeated real-model controls with recorded generation provenance, preserves failed attempts, and declares the first trial for blind review. Real reviewers can submit anonymous A/B preferences and structured ratings across venue, festival, artist-booking and audience roles. The software collects judgments; it does not invent them. See the [evaluation protocol](evaluation-protocol.md).

Build a slate, then open **Festival GM** for city research, audience evidence, whole-lineup cultural connections, Ask the GM, and cancellation recovery. Its bounded evidence agent retries incomplete primary-market rankings once and re-optimizes after comparing every bookable pair. Every decision remains linked to receipts and an unchanged source snapshot. See the [demo walkthrough](judge-demo.md) and [source integration map](theme-night-integration.md).

The original Houselights festival policy adds cultural cohesion, theme breadth, missing-pair penalties and feasible cancellation coverage to the booking objective. The imported five-part reference Taste Fit remains separate and attributed. LLM comparisons are explicitly **in-sample objective diagnostics**; a separate blinded-review workflow collects actual human preferences across distinct briefs, without fabricating judgments or claiming statistical superiority.

**Themed nights now have their own research.** Festival GM ranks up to ten saved anchors in each of five domains for the requested age groups, compares an optional reference market, and queries sponsors, music, places and podcasts separately for each theme. Resolve ambiguous sponsor categories explicitly and replace one night's anchor while retaining the others. Missing evidence remains unmeasured. Use the browser controls or `npm run gm -- season-research <saved-id> options.json`; see the [options and evidence rules](theme-night-integration.md#per-theme-research-and-revision).

Run `npm run validate:live` after configuring your Qloo key. It performs a bounded provider smoke test and writes a credential-free summary to ignored `artifacts/live-validation.json`. A configured key or passing synthetic tests does not establish a successful live integration. Bounded provider requests have also passed on the deployed Oracle host; their scope is recorded in the deployment record.

- Resolves artist names and offers a choice when the provider reports ambiguity.
- Discovers artists outside the initial shortlist and ranks candidates against the room's anchors and city.
- Allocates deeper geographic, audience-comparison and trend checks within a bounded workflow budget.
- Finds the best slate under an explicit scoring policy, subject to budget, slots, availability, known fees, locks, exclusions, a discovery minimum and a genre cap.
- Explains infeasibility, shows cost-versus-score frontier options, and evaluates one-for-one swaps.
- Stress-tests budgets from 80% to 120% and known fees at 0%, 10%, 20% and 30% increases while preserving the other constraints.
- Builds a contingency playbook for every selected-act cancellation, three quote shocks per act, four budget cuts and three combined shocks. Cancellation drills keep the surviving bookings fixed, identify the replacement, and flag any slate with no clean fallback.
- Searches every feasible exact slate for a robust alternative, ranking bills by cancellation coverage, worst-case fallback utility, average fallback utility and then baseline utility. It reports the utility sacrificed for resilience instead of silently changing the objective.
- Generates an evidence-bound booking packet with unsent hold-request drafts, unsupported-number checks, an eight-field logistics checklist and a standards-compliant `.ics` calendar payload.
- Runs a persistent booking pipeline through research, pitch approval, outreach, response, negotiation, secured logistics and show scheduling, including Day 3/7/14 follow-ups and outcome-derived analytics.
- Retains approved pitch angles and venue segments, outreach metadata, categorized objections and a complete received/proposed counteroffer history; campaign ceilings use current agreed commitments.
- Builds an executive decision dossier containing evidence coverage, geographic status, planning relationships, risks, opportunities, contingency resilience and a report-scoped analyst that answers only from saved evidence.
- Runs a receipt-backed multi-market intelligence pass across every selected artist and requested market, compares every selected-artist pair, discovers cultural place leads, and saves the result as a linked snapshot.
- Searches every permitted ordered route exactly, enforcing a 150 km market-separation rule, a 1,800 km maximum leg and explicit travel-day scheduling. It maximizes comparable returned-evidence coverage before using distance as the tie-breaker; heatmap percentiles from separate queries are never compared.
- Joins research, human pitch approval, outreach, outcomes, negotiation ceilings, scheduled follow-ups, contingency replacements and route intelligence into a four-stage campaign control report.
- Exports a standalone, escaped, print-ready HTML decision dossier with its source receipt index.
- Qualifies routed Qloo place leads with caller-supplied capacity sources, availability and costs; applies explicit 60%–250% room-fit rules and produces cent-reconciled per-stop break-even call sheets.
- Builds an optional receipt-backed aggregate audience activation profile from slate tags, per-artist demographics and selected cross-domain Qloo recommendations such as brands, movies, podcasts, books, TV and games.
- Builds per-market local activation plans: receipt-backed opener discovery and shared themes, strict returned-popularity size checks, neighborhood hotspots, coordinate-gated poster runs and aftershow place leads.
- Exports a standards-compliant whole-tour calendar containing every routed show, transfer and rule-inserted day off.
- Turns decision practice into a six-mission Decision Gauntlet: reduce the source budget, book a discovered act, protect genre breadth, survive a 10% quote increase, keep rank receipts complete, and record a lock or exclusion. XP is recomputed on the server from saved evidence and is never a demand forecast.
- Produces per-artist claims linked to receipts and saves named alternative scenarios with a parent link and the original evidence.
- Presents the workflow in a responsive midnight-blue and gold workspace with owner-supplied atmospheric artwork and an optional motion setting.

## How it works

```text
Browser → Node/Express → bounded agent workflow → official Qloo MCP harness
                              ↓                           ↓
                       exact slate optimizer ← normalized evidence
                              ↓
                    claim ledger + receipt snapshot
```

| Stage | Qloo workflow | Use |
|---|---|---|
| Resolve | `qloo_describe` | Confirm anchors and offered artists |
| Profile | `qloo_entity_tags` | Describe anchor taste vocabulary |
| Discover | `qloo_recommend` | Surface adjacent artists with city context |
| Rank | `qloo_rank` | Order the candidate pool against the anchors |
| Verify | `qloo_where_popular` | Check whether geographic results are available |
| Compare | `qloo_compare_audiences` | Retain aggregate comparison context |
| Timing | `qloo_trends` | Use interpretable, explicit source changes |

The optimizer enumerates every exact-size subset for up to 20 candidates and 25,000 combinations; the stress-analysis route (`/api/analyze`) accepts at most 12. Its declared policy combines cultural fit (Qloo affinity scores scaled over a fixed 0.05 span, with ordinal rank only when scores are missing), evidence availability, explicit trend direction, buyer-entered genre diversity and discovery. Fees are rounded to cents. Missing fees or unconfirmed availability make an act ineligible; missing rank evidence can make a selected slate provisional. An exact optimum means best **under this policy and candidate pool**, not the best possible commercial booking decision.

The optional LLM chooses names from the candidate pool for deeper checks and selects from verified claim IDs. It cannot write new factual prose into the grounded memo. Without it, deterministic planning and template claims remain available. See [architecture and evidence limits](architecture.md) for the scoring formula and provenance model.

Re-optimization, stress analysis, contingency planning and the Decision Gauntlet reuse evidence and spend no Qloo calls. Stress and contingency results are deterministic rehearsals, not event probabilities or success forecasts. Gauntlet missions reward inspectable booking behavior rather than predicted outcomes. Saving a scenario rebuilds it from a stored source run plus edited booking terms and constraints; client-supplied scores or claims cannot replace the saved evidence.

Generate a machine-readable contingency report for any saved run:

```powershell
npm run contingency -- <saved-run-id>
npm run dossier -- <saved-run-id>
npm run dossier -- <saved-run-id> --json
```

These commands read the snapshot from `DATA_DIR`, making the planning engines usable in demos and automation before dedicated interfaces are added.

The operational APIs also remain interface-independent:

| Route | Purpose |
|---|---|
| `GET /api/dossier/:id` | Complete saved-evidence decision report |
| `GET /api/dossier/:id/report` | Standalone printable HTML decision report |
| `POST /api/dossier/:id/ask` | Report-scoped deterministic question answering |
| `POST /api/packet/:id` | Hold drafts, logistics checklist and iCalendar payload for an explicit event |
| `GET /api/tour-calendar/:id` | Whole-route show, transfer and day-off iCalendar export |
| `GET /api/pipeline/:id` | Create or read the persistent selected-artist pipeline |
| `POST /api/pipeline/:id/events` | Apply a validated pipeline transition or outcome |
| `POST /api/intelligence/:id` | Run and save multi-market Qloo evidence, pair cohesion, venue scouting and exact routing |
| `GET /api/campaign/:id` | Derive the four-stage campaign controller from evidence and the persistent pipeline |
| `POST /api/venues/:id/qualify` | Save sourced venue qualification, room-fit decisions and deterministic route economics |
| `POST /api/activation/:id` | Save local opener, hotspot, poster-run and aftershow planning with receipts |

See the [operational API contract](api.md) for payloads, legal transitions and response semantics. The [file-level archive gap audit](archive-gap-audit.md) maps the supplied reference modules to implemented behavior and explicit evidence boundaries.

## Receipts and limits

Each receipt records the workflow, arguments, purpose, status, timestamps, latency, cache state, bounded evidence and a SHA-256 digest. A digest is a reproducibility aid for that compact record; it is **not a provider signature**, an immutable audit trail, or proof that the underlying Qloo data is true. Raw provider payloads and API keys are not stored in shared snapshots.

Qloo is not a source of artist fees, confirmed availability, ticket demand, attendance or revenue forecasts. Scaled affinity fit is a relative score, not a probability or a percentage. Audience comparison does not establish unique ticket buyers, net-new audience share or pairwise cannibalization. Missing results remain missing evidence. Live response calibration and real-booker validation are still required.

Share links are bearer links: anyone who has a link can read that snapshot, including buyer-entered planning information. Use demonstration inputs in a public hackathon deployment.

## Verification and deployment

```powershell
npm test
npm run probe -- "Radiohead" London
npm run eval
```

The probe uses live quota unless mock mode is set. Inspect its returned shapes before drawing conclusions from trends or audience comparisons. The evaluation script uses the cases in `evals/cases.json`; its optional LLM agreement metrics describe differences, **not accuracy or evidence of superiority**. It is not a complete portfolio-quality benchmark.

Deployment needs a Node runtime supporting child processes, outbound HTTPS and a writable, persistent `DATA_DIR`. Cloudflare Workers and other isolate-only runtimes do not run this stdio harness. See the [deployment runbook](deployment.md) and [submission checklist and demo script](submission.md).

Public repository: [github.com/codewithanshuman/houselights](https://github.com/codewithanshuman/houselights). Live Qloo/Groq checks and release verification are recorded in [release validation](live-validation.md). The public demo serves the application directly from its persistent Oracle backend; optional Vercel frontend packaging remains available in the [deployment runbook](deployment.md). Independent human judgments remain pending. No judged outcome is claimed by synthetic tests.

The [free hosting runbook](free-hosting.md) documents persistent storage, HTTPS, automatic public-case seeding and the anonymous release verifier. [Release CI for aab6cae](https://github.com/codewithanshuman/houselights/actions/runs/40104466215) passed the unit suite, the real-browser suite (x86), the published stress-audit reproduction, and the container/persistence checks on x86 and native ARM64. Locally on Node 24.21 the current release passes 330 unit tests and 32 browser tests. Separate checks on the deployed VM verified saved proof results and event journals after application-container recreation. The VM itself was not rebooted, and existing bot/livestream quality has not been independently measured.

Festival GM research now runs in a persisted server queue with idempotent requests, receipt journals, reconnection, cancellation and automatic decision proof generation. See the [research run contract](persistent-research.md). The [six-archive capability status](archive-capability-status.md) distinguishes exact ports, adapted workflows and remaining gaps; it does not claim every feature was migrated.

Built using the [official Qloo hackathon kit](https://github.com/qloo/qloo-hackathon-kit) and `@qloo/qloo-harness`. Code is provided under the [MIT license](../LICENSE). Reference-derived functionality and licensing are documented in [the feature audit](reference-feature-audit.md) and [third-party notices](../THIRD_PARTY_NOTICES.md). The five supplied artwork files and their provenance are listed in [asset sources](../public/assets/SOURCES.md); no ownership of that artwork is asserted. The rain-lantern GIF is approximately 18.3 MB and is reserved for opt-in motion.
