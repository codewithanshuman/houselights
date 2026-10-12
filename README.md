# Houselights

**The slate optimizer with receipts.** Houselights helps independent venues and promoters turn a shortlist of artists into a booking slate: resolve identities, discover adjacent artists through Qloo, compare feasible combinations, and inspect the evidence behind the result.

The buyer supplies the city, artists representing the room's audience, offers, fees, availability and planning categories. Qloo supplies cultural context. The optimizer enforces the buyer's constraints and exposes its policy instead of presenting a score as a ticket-sales forecast.

## Run locally

Requires **Node.js 22.19 or newer** and npm. The live integration starts the official Qloo harness as a local stdio child process, so use a normal Node server or container.

```powershell
npm ci
Copy-Item .env.example .env
npm run dev
```

Open [localhost:8080](http://localhost:8080). `npm run dev` always uses **synthetic Qloo data** and displays a demo-mode label. Synthetic rankings, artists and evidence are for product development; they do not validate real audience fit.

For live Qloo, follow the [key request guide](docs/key-request.md), put your key in `.env`, leave `QLOO_MODE` unset, and run:

```powershell
npm start
```

`npm start` loads `.env`. Never commit credentials or place them in browser code. The app works without an LLM. To enable the optional planner, claim selector and Qloo-off comparison, set **both** `ANTHROPIC_API_KEY` and `LLM_MODEL` to values supported by your account. `LLM_MODE=off` disables them.

| Setting | Purpose |
|---|---|
| `QLOO_API_KEY` | Required for live Qloo calls |
| `ANTHROPIC_API_KEY`, `LLM_MODEL` | Optional model features; both are required |
| `PORT` | HTTP port; defaults to `8080` |
| `HOST` | Bind address; defaults to `127.0.0.1` locally; hosted Node needs `0.0.0.0` |
| `DATA_DIR` | Dedicated snapshot directory; defaults to `./data` |
| `CALL_BUDGET` | Workflow attempts per memo; defaults to `30` |
| `DAILY_MEMO_CAP` | Per-process daily memo cap; defaults to `150` |
| `QLOO_CACHE_TTL_S` | In-memory Qloo cache lifetime; defaults to six hours |
| `TRUST_PROXY` | Set to `1` only when the deployment has one trusted proxy hop |

## What the product does

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
- Builds an executive decision dossier containing evidence coverage, geographic status, planning relationships, risks, opportunities, contingency resilience and a report-scoped analyst that answers only from saved evidence.
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

The optimizer enumerates every exact-size subset for at most ten candidates. Its declared policy combines relative rank utility, evidence availability, explicit trend direction, buyer-entered genre diversity and discovery. Fees are rounded to cents. Missing fees or unconfirmed availability make an act ineligible; missing rank evidence can make a selected slate provisional. An exact optimum means best **under this policy and candidate pool**, not the best possible commercial booking decision.

The optional LLM chooses names from the candidate pool for deeper checks and selects from verified claim IDs. It cannot write new factual prose into the grounded memo. Without it, deterministic planning and template claims remain available. See [architecture and evidence limits](docs/architecture.md) for the scoring formula and provenance model.

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
| `POST /api/dossier/:id/ask` | Report-scoped deterministic question answering |
| `POST /api/packet/:id` | Hold drafts, logistics checklist and iCalendar payload for an explicit event |
| `GET /api/pipeline/:id` | Create or read the persistent selected-artist pipeline |
| `POST /api/pipeline/:id/events` | Apply a validated pipeline transition or outcome |

See the [operational API contract](docs/api.md) for payloads, legal transitions and response semantics.

## Receipts and limits

Each receipt records the workflow, arguments, purpose, status, timestamps, latency, cache state, bounded evidence and a SHA-256 digest. A digest is a reproducibility aid for that compact record; it is **not a provider signature**, an immutable audit trail, or proof that the underlying Qloo data is true. Raw provider payloads and API keys are not stored in shared snapshots.

Qloo is not a source of artist fees, confirmed availability, ticket demand, attendance or revenue forecasts. Relative rank utility is not an affinity percentage. Audience comparison does not establish unique ticket buyers, net-new audience share or pairwise cannibalization. Missing results remain missing evidence. Live response calibration and real-booker validation are still required.

Share links are bearer links: anyone who has a link can read that snapshot, including buyer-entered planning information. Use demonstration inputs in a public hackathon deployment.

## Verification and deployment

```powershell
npm test
npm run probe -- "Radiohead" London
npm run eval
```

The probe uses live quota unless mock mode is set. Inspect its returned shapes before drawing conclusions from trends or audience comparisons. The evaluation script uses the cases in `evals/cases.json`; its optional LLM agreement metrics describe differences, **not accuracy or evidence of superiority**. It is not a complete portfolio-quality benchmark.

Deployment needs a Node runtime supporting child processes, outbound HTTPS and a writable, persistent `DATA_DIR`. Cloudflare Workers and other isolate-only runtimes do not run this stdio harness. See the [deployment runbook](docs/deployment.md) and [submission checklist and demo script](docs/submission.md).

Public repository: [github.com/codewithanshuman/houselights](https://github.com/codewithanshuman/houselights). Public demo, live-key verification and release screenshots remain pending. No live integration or judged outcome is claimed by the synthetic demo.

Built using the [official Qloo hackathon kit](https://github.com/qloo/qloo-hackathon-kit) and `@qloo/qloo-harness`. Code is provided under the [MIT license](LICENSE). Reference-derived functionality and licensing are documented in [the feature audit](docs/reference-feature-audit.md) and [third-party notices](THIRD_PARTY_NOTICES.md). The five supplied artwork files and their provenance are listed in [asset sources](public/assets/SOURCES.md); no ownership of that artwork is asserted. The rain-lantern GIF is approximately 18.3 MB and is reserved for opt-in motion.
