# Theme Night GM integration

This is a backend integration into Houselights' saved-evidence and booking model. No UI or styling was changed. All new features are callable through the API and `npm run gm`.

## Source provenance and exact ports

Source: owner-supplied `Theme-Night-GM-main.zip`.
SHA-256: `7596eae65f594d9cfdff704b4218a60e5b635081df5a53b204cb70c845bf2f9e`.
The archive declares MIT, copyright 2026 ZNLong2203. Its full license is retained in `server/theme-night/LICENSE`.

The original `src/lib/{market-dna,scoring,schedule,sensitivity,licensing}.ts` modules are preserved in `server/theme-night/*.mjs` by stripping TypeScript types, with attribution added. Their algorithms and constants were not rewritten. The licensing helper is retained for reference; generated plans instead mark all rights as review-required, because absent ownership metadata does not establish permission.

| Requested workflow | Houselights implementation | Important distinction |
|---|---|---|
| Market DNA | Five original domains, top-25 comparison utility, Jaccard overlap, exclusive entities, five-position rank leanings, same artist pool ranked in each city | Live retrieval is capped at the harness's 20 results; never compares raw affinity from different queries; absent domains remain unavailable |
| Audience Intelligence | Candidate audience/local ranks, optional explicit age bucket, aggregate demographics, selected-artist pair comparisons, brand/music/place/podcast leads | Age bucket is not a family life-stage proxy; comparisons are shared tastes, not measured audience overlap |
| Autonomous GM | Research → select → exact optimize → independent selection validation → budget/fee/cancellation tests → saved decision and trace | Bounded deterministic tool agent, not the archive's Gemini function-calling loop |
| Taste Fit | Original 30/25/20/15/10 weights and neutral missing values, plus measured weight and missing-input bounds | Five-part score is a separate explanation; only supported complete-pool ranks enter Houselights' optimizer |
| LLM-only Benchmark | Identical candidate IDs, fees, availability, discovery flags and constraints; blind LLM selection; identical objective evaluation | In-sample diagnostic, not independent evidence; invalid control is not repaired; missing LLM is `unavailable` |
| Ask the GM | Natural replace/exclude/lock commands; optional LLM patch interpretation; preserved constraints, exact fit floor, immutable child snapshot | Saved evidence is reused. New artist/city research requires another research run. Headliner role must be explicit |

Additional integrated source behaviors: sports schedule examples, weak-date heuristics, segment rotation, minimum date gaps, unique-anchor assignment with repeat warnings, theme giveaways/activations, sponsor rotation, partner suitability checks, IP-conscious generic naming, receipt-linked season plans and parent-linked revisions.

## Run the workflow

First create a Houselights memo with candidate fees, genres and availability. Use its saved ID below. Start the server using `npm run dev` for labeled synthetic data, or `npm start` with live credentials.

Create a JSON options file:

```json
{"markets":["London","Paris"],"city":"London","demographic":"35_to_44","includeExperience":true}
```

```powershell
npm run gm -- run <saved-id> options.json
npm run gm -- benchmark <new-gm-id>
```

Each operation returns a new ID and complete snapshot. Read it with `GET /api/memo/:id`. `GET /api/dossier/:id` includes the Market DNA, GM, benchmark and theme-season data, and its Markdown export includes the new summaries.

For a revision, create another JSON file:

```json
{"request":"Replace the headliner, keep the budget and maintain audience fit","headlinerId":"<selected-artist-id>"}
```

```powershell
npm run gm -- revise <new-gm-id> revision.json
```

If that is infeasible, the API returns 422 with diagnostics and creates no snapshot. 409 means the request needs an explicit headliner, more evidence or clearer instructions. It does not silently reduce the fit floor or increase the budget. Additional natural language is interpreted by the configured Anthropic model; unrequested numeric budget/slot changes are rejected server-side.

## API contract

| Method and endpoint | Input | Result |
|---|---|---|
| `POST /api/gm/:id/run` | Optional `markets` (1–4 unique strings), `city`, `demographic`, `existingFanIds` (0–3), `venue:{lat,lon}`, `includeExperience` | 201 child snapshot with `festivalResearch`, updated `memo`, and `gm` |
| `POST /api/gm/:id/benchmark` | `{}` | 201 child snapshot; benchmark status is `compared`, `constraint_failure`, `invalid_control` or `unavailable` |
| `POST /api/gm/:id/revise` | `request`, optional explicit `headlinerId` | 201 validated revision, 409 needs input/evidence, 422 rejected |
| `POST /api/gm/:id/cancel` | `artistId` of a selected act | 201 recovery snapshot with survivors locked, or 422 if no feasible replacement |
| `POST /api/gm/schedule` | `sport` or `dates:[{date,time,segment?}]`, `count` 1–8, `gapDays` 0–365 | Date-selection report; generated fixture dates clearly labeled synthetic |
| `POST /api/gm/:id/season` | Schedule input plus optional researched `city`, `ipPolicy` (`ip_light` or `licensed_ok`) | 201 child with evidence-linked theme nights |

Supported demographic buckets: `24_and_younger`, `25_to_29`, `30_to_34`, `35_to_44`, `45_to_54`, `55_and_older`. They are translated to the natural-language forms accepted by the installed Qloo harness.

Research preflights its workflow ceiling, defaults to 60 attempts (maximum configurable 120 via `GM_CALL_BUDGET`), has a 120-second research deadline, and retains receipts for missing or failed calls. Per-process limits allow six GM operations per minute per IP and 100 per day. A workflow can contain multiple provider HTTP calls. Retry exhaustion produces explicit unavailable evidence.

Scenario and GM revisions clear dependent route, venue, activation, benchmark and theme-season artifacts; their source snapshots remain readable. Receipt IDs continue from the highest saved `g` receipt to avoid collisions across repeated runs.

## Evidence rules

- Local and audience rank calls use the same candidate IDs across all cities. Incomplete pools retain visible returned ranks but have no comparable utility. A one-candidate pool is neutral (0.5).
- Demographics are stored only when returned; no age or gender is inferred from musical preference. Returned label-only fixtures remain label-only.
- Momentum requires dated `population_percentile` observations; arbitrary source `change` values are not converted into the source's percentage formula.
- Catchment scoring uses the source's 16 km / top-20%-hotspot formula only when at least ten valid cells and fewer than the harness's 20-cell cap are returned. It is explicitly scoped to returned cells, whose completeness remains unverified. Hitting the result cap leaves the component missing.
- Existing-fan inverse rank uses the source formula, but is labeled a proxy novelty heuristic. It is not new-fan reach measured in people.
- Both benchmark slates retain the same constraints. A minimum-fit constraint can cause the blind LLM proposal to fail objective validation; that failure is reported rather than exposing Qloo scores to its prompt. The optimizer winning its own objective is expected and is not independent validation.

## What is not yet an exact whole-project migration

The six core festival workflows are implemented, but this is not the entire original application copied verbatim. The following differences remain explicit:

- The source Gemini function-calling/retry loop, resumable SSE agent replay, Redis deployment and its Next.js UI are not transplanted. Houselights uses its own server, SQLite storage, bounded rule-based evidence agent and optional Anthropic interpretation.
- The source per-theme candidate age/life-stage matrix, national-popularity rank lift, category-specific sponsor lookup, per-theme fresh sponsor/experience research, and trend-window fallback to archived 2025 data are not reproduced. Theme seasons label shared festival-audience leads and missing score components instead of claiming those measurements.
- Original arbitrary season-night LLM editing is narrower here: Ask the GM edits the artist slate through validated operations. A new artist, city, arbitrary theme text or new economic term needs a separate supported input/research operation.
- Full season assembly does not use the source's model submission schema, exact promotional copy, all supporting fandom relationships or sport-specific copy. The original core utility source is retained, and adapted season behavior is described above.
- Festival research, Market DNA, audience evidence, revisions, cancellation recovery, benchmarks and blind review now have browser controls. Advanced theme-season configuration remains API/CLI based.

Live Qloo resolution, ranks, demographics, comparisons, Market DNA and cancellation recovery were verified on 14 October 2026; see the [release validation record](live-validation.md). LLM validation and real promoter judgments remain outstanding. Synthetic and contract tests demonstrate behavior and failure handling, not real market relevance.

## Original festival policy and adaptive research

Festival GM enables `houselights-festival-v1`. It compares all bookable candidate pairs before final optimization, not just provisional winners. The base Houselights objective gains up to 8 points for the share of pairs with shared themes, up to 4 for unique theme breadth, a penalty up to 6 for missing interpretable pair evidence, and up to 6 for the fraction of cancellations admitting a replacement while preserving survivors and all hard constraints. These are declared planning weights, not learned attendance predictions. The imported five-part reference score remains separate.

An incomplete primary-city local or audience ranking triggers at most one fresh same-pool attempt per ranking, bypassing cached partial data. The agent records whether that attempt resolved the gap, retains better existing evidence if it did not, then revises the provisional slate after pair research. Calls remain bounded by preflight, budget and deadline. Authentication failures and unresolved identities are not blindly retried. This is explicit adaptive evidence gathering, not an unconstrained autonomous agent.

Independent evaluation uses separate blind study invitations across 1–20 distinct saved benchmark briefs. A/B assignment is randomized per reviewer and brief; no system labels, Qloo scores or source IDs appear on ballots. Each invitation accepts one complete submission. Reports disclose synthetic cases, identical lineups, correlated reviewers and unverified organizer-supplied reviewer roles. No real promoter judgments are implied by automated tests.
