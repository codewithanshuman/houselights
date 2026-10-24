# Houselights Decision OS — first implementation

Houselights is the AI decision room for live entertainment: cultural research, exact optimization, counterfactual challenges and organizer review around one saved decision. This implementation builds on the existing research agent and booking engine. It does not label deterministic checks as a new free-running LLM agent.

## Decision proof

Open a saved slate → **Decision Room** → **Build decision proof**. The server reads the saved candidate pool, terms, constraints and receipts. Client-supplied scores or replacement candidate data cannot enter the proof. A new immutable snapshot stores the result; no provider calls are made.

Three methods share the same pool and booking assumptions:

- **Constraint-only** selects the least expensive feasible slate, then breaks cost ties by candidate ID. Cultural score is displayed only as an after-the-fact diagnostic; it does not choose this baseline.
- **LLM-only** uses an existing real benchmark generated without Qloo evidence. The proof checks the benchmark brief digest and evaluates its selection again. Missing, invalid, stale and constraint-violating model outputs stay visible. A model is never simulated to fill this column.
- **Houselights** uses the existing exhaustive optimizer and its declared planning objective.

A Qloo-derived `minimumAverageFit` makes an evidence-free control incomparable under identical constraints. The proof reports that limitation rather than silently removing the floor. All methods may use a pool originally discovered with Qloo, so this comparison does not measure discovery value.

## Counterfactual engine

Class ablations remove audience rank, local context, trends, comparisons, and all four together. Receipt ablations remove one linked observation from every dependent artist and both directions of every dependent cultural edge. A shared rank is withdrawn for the whole dependent pool; remaining artists are not reranked. Missing-evidence penalties are recomputed and all original constraints remain in force.

Fresh research now records explicit per-field receipt dependencies. Legacy festival snapshots can recover rank provenance from their saved audience profile. Ambiguous legacy ranks are not assigned an invented individual effect: they remain visible and block approval if selected. Individual ablation is capped at 64 receipts, with tested/eligible counts reported. Class ablations still cover the full pool. Unrelated season or sponsor receipts are not treated as booking objective inputs.

The result includes six discrete preference profiles, the exact next larger-budget switch within the bounded pool, single-artist cancellation rehearsals, and feasible alternatives ordered by recovery coverage and policy utility. The budget engine tests candidate fee-sum boundaries in ascending order, recomputing the optimizer because its recovery preference also depends on budget. This is exhaustive for this pool; it is not a search over unknown artists or changed fees.

Challenge findings contain an assumption, affected artist IDs, receipt IDs, the tested counterfactual and a suggested correction. Infeasibility, missing selected audience ranks, unusable/ambiguous rank provenance and a stale saved selection block approval. Receipt sensitivity, uncovered cancellations, missing pair evidence and discrete preference switches require organizer review. An unchanged slate under ablation is reported without claiming the evidence had no value outside this experiment.

## Traceability and interaction

Artist evidence cards connect resolved identity, original audience rank/pool, organizer-entered fee and availability, consequential ablations, query parameters, timestamp and source digest. No graphic is used to imply an unsupported audience relationship.

The budget preview recomputes the slate and Pareto frontier from server-held evidence without saving a scenario or changing booking terms. To adopt a changed budget, edit and save a scenario in Slate studio, then build a new proof. An existing blind-study report can be opened from the review panel; its source case IDs must match the intended benchmark. Judgments are never fabricated or pooled automatically across unrelated briefs.

## Approval state machine

The persisted sequence is `review_required` → `approved_for_planning` → `draft_ready`. Organizers may defer and reopen; reopening revokes previous approval and clears the planning packet. Approval requires every review finding to be acknowledged and a written rationale. Blockers cannot be acknowledged away.

Each write checks `expectedRevision` in a SQLite transaction. Duplicate or stale actions fail with HTTP 409. Each transition records its previous/new state, timestamp, exact proof digest and rationale. A modified fingerprint makes a proof unusable. Sessions are tied to immutable snapshot IDs, and every new proof starts a new review. Protected deployments require organizer access for writes; public reads hide review notes and draft contents.

Approval authorizes planning only. A valid event date is required to generate unsent offer drafts. Nothing is sent, paid or signed. The legacy packet route and pipeline planning actions now require the same current proof approval. Incoming responses and notes remain recordable after revocation so adverse facts are not suppressed. A changed agreed fee must be reflected in a newly optimized scenario before planning continues. Commercial source imports, reviews and proposed offers invalidate the scope of earlier approval. Conflicting accepted terms block renewed approval. See [advanced workflows](advanced-workflows.md).

## API

- `POST /api/decision/:id/proof` → immutable proof snapshot. Maximum 12 proof computations per minute per running data store.
- `GET /api/decision/:id` → saved proof and review state; organizer sessions also receive private history and unsent packet.
- `POST /api/decision/:id/preview` with `{ "budget": 15000 }` → unsaved budget-only slate/frontier.
- `POST /api/decision/:id/transition` with `action`, `expectedRevision`, and required action fields. Approval uses the latest `expectedScopeDigest` returned by GET, `reason`, and `acknowledgedFindings`; deferral uses `reason`; draft generation uses `event.date`.

## Remaining proposal stages

Multi-event portfolio optimization is implemented in the Event portfolio workspace; see the [PartDrop integration audit](partdrop-integration.md). A bounded native-function investigator, source-document review, joint commercial stress, and unified planning gates are now implemented. Continuous weight-region analysis, independently authenticated commercial terms and real contracts remain outside those implementations. The original proof/approval engine was independently implemented before PartDrop was supplied; the audit identifies the later adaptation precisely.

Policy utility, evidence coverage, resilience and ablation changes are not ticket-sales forecasts, causal uplift or a probability of success. Commercial stress calculates margins only from explicit supplied scenarios. Real controls have now been generated for London and Berlin; real blind reviewer judgments remain outstanding.
