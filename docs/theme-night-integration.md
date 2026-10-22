# Festival GM source integration

This adapts workflows from an owner-supplied MIT reference into Houselights' saved-evidence and booking model. Festival GM browser controls expose the principal workflows; the API and `npm run gm` also support advanced options. Existing visual styling is reused.

## Source provenance and exact ports

Source: owner-supplied MIT reference archive.
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

CLI operations return a new ID and complete snapshot. Read it with `GET /api/memo/:id`. The HTTP benchmark route now requires an `Idempotency-Key` and returns a queued job (202), with polling described in the [durable benchmark contract](persistent-research.md#durable-benchmark-contract). `GET /api/dossier/:id` includes the Market DNA, GM, benchmark and theme-season data, and its Markdown export includes the new summaries.

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
| `POST /api/gm/:id/season-research` | Season input plus `candidateLimit` (2–10/domain), optional `referenceLocation`, `sponsorTags` (0–5), `excludedAnchorIds`, `anchorOverrides:{date:entityId}` | 201 child with fixed-pool audience matrix, individual theme partner queries, receipt-linked alternatives and explicit complete/partial status |

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

- The source Gemini function-calling/retry loop, Redis deployment and its Next.js UI are not transplanted. Houselights uses its own server, SQLite storage, bounded rule-based evidence agent and optional configured-model interpretation. Persisted research runs and cursor-based event replay are now implemented in that architecture; see [persistent research](persistent-research.md). Reconnection resumes observation, not interrupted provider execution.
- Per-theme age matrices, explicit reference-market ordinal lift, sponsor-category filters and fresh per-theme partner queries are now implemented in `server/theme-research.mjs`. Family life-stage remains unsupported by the installed harness. Trend-window fallback to archived 2025 data is not imported as current momentum.
- Season editing supports explicit saved-anchor overrides by date and exclusions, with fresh evidence and immutable parent-linked results. Original arbitrary season-night LLM editing remains narrower here: a new artist, city, arbitrary theme text or new economic term needs a supported input/research operation.
- Full season assembly does not use the source's model submission schema, exact promotional copy or sport-specific copy. Explicit supporting fandoms now have pairwise Qloo checks before entering partner queries; arbitrary model-generated supporting relationships are not imported. The original core utility source is retained, and adapted season behavior is described above.
- Festival research, Market DNA, audience evidence, revisions, cancellation recovery, benchmarks, blind review, per-date theme research and theme replacement have browser controls. Candidate limits, exclusions and advanced schedule heuristics are also available through API/CLI.

## Per-theme research and revision

`season` retains the inexpensive saved-evidence preview. `season-research` performs new Qloo workflows. Example options:

```json
{
  "dates": [
    {"date":"2027-04-01","time":"night","segment":"gen_z"},
    {"date":"2027-04-15","time":"night","segment":"young_pros"}
  ],
  "count": 2,
  "referenceLocation": "United Kingdom",
  "sponsorTags": ["technology"]
}
```

These are illustrative organizer dates, not confirmed fixtures. Run `npm run gm -- season-research <gm-snapshot-id> options.json`, or use Festival GM → Research themed nights.

Each available domain tests up to ten saved anchors, the official harness's rank batch limit. The identical pool is ranked locally, for each requested supported age bucket, and optionally in the explicit reference market. Any incomplete pool has no comparable utility. Young-professional fit equally weights complete 25–29 and 30–34 rankings; this is a declared programming policy, not a measured demographic mixture. Family life-stage is unmeasured rather than replaced by a guessed parental age range.

Local and age ranks feed the original 30% and 25% score components. The remaining components stay estimated. Positive reference lift means a higher local ordinal position in the same pool; it does not enter the score or imply popularity growth. The matrix discloses scanned versus tested candidates.

Every selected theme receives four separate queries: brand, artist, place and podcast. Brand queries apply explicit category tags; unresolved tags remain visible as missing evidence. Ambiguous category names expose bounded provider-returned choices in the GM browser controls, with no automatic selection; the organizer can rerun using an explicit tag while preserving all chosen themes. Place queries constrain the city. Suitability filtering uses returned labels/tags and does not assert demographic partner fit. Missing individual results never fall back silently to festival-wide partners. Every displayed lead links to its own receipt, and the exported dossier carries those receipts.

Overrides reserve a known theme for a selected date before other nights are assigned. Unknown, duplicate, excluded or unsuitable overrides are rejected before paid work. Replacements preserve the other selected theme IDs; the UI makes a fresh child snapshot. No date-specific booking availability is inferred.

Preflight counts domain-local ranks, optional reference ranks, supported age-bucket ranks and four partner workflows per night. Retries share the same attempt budget and deadline. Protected access and persistent paid-research quotas also cover `season-research`. A live source cannot be enriched in synthetic mode or vice versa.

On 14 October 2026 the owner-supplied archive was inspected again; SHA-256 `7596EAE65F594D9CFDFF704B4218A60E5B635081DF5A53B204CB70C845BF2F9E` matches the previously audited archive. The renewed inspection covered the agent loop, replay store/hook, assembly, autopilot and targeted crossover/support tools. This does not claim every source workflow has been migrated.

### Supporting fandoms and crossover checks

The source assembly and sponsor tooling accept supporting entity IDs, while its audience comparison exposes shared cultural context. Houselights connects those mechanisms explicitly: `supportingByDate` maps selected dates to up to two distinct eligible saved theme IDs. Nonempty choices require a matching explicit `anchorOverrides` entry. Unknown, excluded, unsuitable, duplicate or self-referential choices fail before provider calls.

Each selected support adds one `compare_audiences` workflow to preflight. Only an interpretable comparison with returned shared context includes that ID in all four partner queries for that night. An empty shared-context result is retained as such; failed or opaque evidence stays unavailable. Each decision records its receipt. Anchor rankings and the anchor Taste Fit remain unchanged: shared tastes are neither buyer overlap nor a measured combined-theme score.

In Festival GM, expand a researched night, choose Supporting fandom 1/2, and use **Check crossover & research partners**. The result is a new child snapshot with the other anchors preserved. The same fields work with `npm run gm -- season-research <saved-id> options.json`. JSON, Markdown and HTML dossiers retain the checks and receipts. Candidate selectors show the tested matrix; API choices may also reference eligible saved market candidates outside that capped matrix.

Live Qloo resolution, ranks, demographics, comparisons, Market DNA and cancellation recovery were verified on 14 October 2026; see the [release validation record](live-validation.md). LLM validation and real promoter judgments remain outstanding. Synthetic and contract tests demonstrate behavior and failure handling, not real market relevance.

## Original festival policy and adaptive research

Festival GM enables `houselights-festival-v1`. It compares all bookable candidate pairs before final optimization, not just provisional winners. The base Houselights objective gains up to 8 points for the share of pairs with shared themes, up to 4 for unique theme breadth, a penalty up to 6 for missing interpretable pair evidence, and up to 6 for the fraction of cancellations admitting a replacement while preserving survivors and all hard constraints. These are declared planning weights, not learned attendance predictions. The imported five-part reference score remains separate.

An incomplete primary-city local or audience ranking triggers at most one fresh same-pool attempt per ranking, bypassing cached partial data. The agent records whether that attempt resolved the gap, retains better existing evidence if it did not, then revises the provisional slate after pair research. Calls remain bounded by preflight, budget and deadline. Authentication failures and unresolved identities are not blindly retried. This is explicit adaptive evidence gathering, not an unconstrained autonomous agent.

Independent evaluation uses separate blind study invitations across 1–20 distinct saved benchmark briefs. A/B assignment is randomized per reviewer and brief; no system labels, Qloo scores or source IDs appear on ballots. Each invitation accepts one complete submission. Reports disclose synthetic cases, identical lineups, correlated reviewers and unverified organizer-supplied reviewer roles. No real promoter judgments are implied by automated tests.
