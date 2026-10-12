# Architecture and evidence model

## Runtime and workflow

`server/index.mjs` starts the Node server. `server/app.mjs` serves the static UI, streams memo progress through server-sent events and stores result snapshots. `server/agent.mjs` resolves up to three anchor artists and six offers, adds discovered candidates, ranks the pool, allocates deeper evidence checks, constructs claims and invokes `server/optimizer.mjs`.

| Route | Behavior |
|---|---|
| `POST /api/memo` | Run the Qloo workflow and save its result |
| `POST /api/optimize` | Re-solve supplied candidate evidence and constraints without Qloo calls |
| `POST /api/analyze` | Analyze hypothetical budget and fee scenarios without Qloo calls |
| `POST /api/gauntlet` | Verify six decision missions against server-stored evidence and a freshly optimized slate |
| `POST /api/contingency` | Generate cancellation, quote, budget and combined-shock playbooks from server-stored evidence |
| `POST /api/scenario` | Save edited terms and constraints against evidence loaded from a saved source run |
| `GET /api/memo/:id` | Read a saved snapshot |
| `GET /m/:id` | Open a snapshot in the workspace |

The optimize and analyze calculation routes accept client-supplied candidates. Their responses are calculations, not independently certified Qloo observations. The Gauntlet, contingency and save-scenario routes load evidence from a stored source run; browser-supplied scores, claims and unknown candidate IDs cannot alter their results.

`server/qloo.mjs` launches the installed official `@qloo/qloo-harness` with the current Node executable over MCP stdio. There is no request-time package download. The browser does not receive provider credentials. `server/shape.mjs` normalizes tool envelopes and keeps unknown measurements from becoming invented facts.

The workflow uses describe, entity tags, recommend, rank, geographic popularity, audience comparison and trends. Disambiguation can pause an identity until a buyer chooses a provider candidate. An unavailable rank remains absent: input order is not substituted for Qloo rank.

The run budget counts uncached workflow attempts, including retries. A harness workflow may issue multiple provider requests, so the counter is not a Qloo HTTP quota meter. Retryable errors receive at most three attempts subject to the remaining budget. Cache entries are scoped by mode and server Qloo configuration; successful, empty and partial responses may be reused until expiry. The cache is bounded and exists only in process memory.

## Exact optimization

The pure optimizer supports up to ten candidates and checks every combination with exactly the requested number of slots. Hard constraints are total fee budget, confirmed availability, valid fees, required and excluded IDs, minimum discovered acts and maximum acts per known genre. Unknown genres do not receive diversity credit and cannot establish genre concentration. A discovered act means it came from outside the original shortlist, not that it is obscure or attracts a new audience.

For a slate of `n` artists, the current policy is:

| Component | Points |
|---|---|
| Relative fit | Average of `100 × fit` across slots |
| Momentum | Average of `+3` for rising, `−2` for cooling, otherwise `0` |
| Geographic support | `2 × fraction of slots with geographic evidence` |
| Genre breadth | `2 × max(known genre count − 1, 0) / max(n − 1, 1)` |
| Discovery | Fraction of slots filled by discovered artists |
| Concentration penalty | `−4 × repeated known-genre pairs / all pairs`, or zero for one slot |
| Evidence penalty | `−10 × (1 − riskTolerance / 100) × mean missing-evidence weight` |

Missing-evidence weights are rank `0.60`, geographic support `0.15`, trends `0.15` and audience comparison `0.10`. The agent maps a returned rank to `fit = 1 − (rank − 1)/(returned count − 1)`; a single returned artist gets `1`. This is ordinal rank utility and depends on the submitted pool. It is not a calibrated Qloo affinity score or commercial demand measure. No supported rank contributes zero fit points and adds an evidence penalty.

Ties resolve by score, then lower fee, then candidate IDs. Scores are policy points. Fees are converted to integer cents before comparisons. The result includes the score decomposition, checked and feasible counts, the non-dominated cost/score frontier, one-for-one swaps, and diagnostics for failed constraints. Budget relaxations are offered only when changing budget alone would make a combination feasible. A feasible slate with unsupported fit is labeled provisional.

The inspection budget normally allows deeper checks for at most four candidates. Consequently, an evidence penalty can reflect a candidate not being checked, not a negative finding. Risk tolerance changes the missing-evidence penalty; it does not estimate the buyer's financial risk. The policy weights are explicit design choices and await calibration with real bookers.

## Stress analysis and saved scenarios

`server/analysis.mjs` reruns the exact optimizer at 80%, 90%, 100%, 110% and 120% of the declared budget. A separate series applies uniform increases of 0%, 10%, 20% and 30% to known buyer-entered fees. Monetary values are rounded to cents; budget steps that become the same cent amount are combined. Unknown fees remain unknown.

Every case keeps availability, locks, exclusions, discovery requirements, genre limits and evidence fixed. Fee cases separately report whether the complete original slate still fits and whether another feasible slate exists. The two questions are not interchangeable. Reported changes and retained artists compare the scenario to a feasible baseline. If no feasible baseline exists, original-slate fee comparisons and headroom are unavailable. Headroom is remaining budget, with its percentage expressed against the declared budget. Provisional evidence remains provisional after changing the economics.

These are deterministic, one-assumption-at-a-time planning scenarios. They do not model correlated market changes, estimate quote probabilities, or predict sales, attendance or revenue.

## Contingency planning and robust slates

`server/contingency.mjs` starts with the exact optimum, then rehearses the cancellation of every selected artist, 10%, 20% and 30% increases to each selected quote, 5%, 10%, 15% and 20% budget cuts, and three declared combinations of a budget cut with a uniform quote increase. A cancellation freezes every surviving booking, excludes the canceled artist and asks the optimizer to fill exactly one slot. This makes the proposed replacement operationally specific and prevents a nominal fallback from quietly rebuilding the whole bill.

The response reports feasibility, retained and replaced IDs, cost and score changes, candidate selection rates across feasible scenarios, a backup bench and critical dependencies. Its coverage percentage is the share of these declared cases with a feasible response. It is not a likelihood, confidence level or estimate of real-world cancellation risk.

The robust-slate search enumerates every exact-size candidate subset, removes any slate that violates the original constraints, and rehearses one frozen-survivor cancellation per selected artist. It orders the remaining slates by cancellation coverage, worst fallback score, average fallback score, original policy score, cost and deterministic ID order. `utilitySacrifice` exposes how many policy points the robust slate gives up against the original optimum. Up to five ranked alternatives are returned as the robustness frontier. At ten candidates the search remains bounded by the same small exact decision space as the optimizer.

`POST /api/contingency` accepts a saved `sourceId`, current terms keyed by known candidate ID and current constraints. Like the Gauntlet, it restores scores, evidence and receipts from the saved run and applies only valid term edits. Client-provided candidate arrays and fit scores are ignored. `npm run contingency -- <saved-run-id>` generates the same analysis directly from a stored snapshot for demos or downstream automation.

## Decision Gauntlet

`server/gauntlet.mjs` turns six planner habits into deterministic missions. It verifies a feasible slate at 90% of the source budget, a bookable discovered act, up to three represented buyer-defined genres, survival of a uniform 10% increase to known quotes, complete selected-act rank coverage, and at least one explicit lock or exclusion. Points and tiers are a product-learning device; they are not evidence of market demand or booking quality.

`POST /api/gauntlet` accepts a saved `sourceId`, current terms keyed by known candidate ID and current constraints. The server reloads the source candidates, applies only valid term edits, reruns the exact optimizer and stress analysis, and then evaluates the missions. The client cannot submit its own XP, achievements or affinity values. Mission actions change visible booking constraints and require re-optimization before the slate can be scored again.

To save an alternative, `POST /api/scenario` accepts `sourceId`, `name`, `terms` keyed by candidate ID and `constraints`. Supply the complete fee, genre and availability values for each edited artist. The server loads the source snapshot, validates the IDs, preserves original ranks, claims, receipts and evidence, then computes a fresh slate. Client-provided scores or evidence cannot overwrite the saved source. Stored constraints are the normalized values actually used by the optimizer. The new snapshot records its immediate `parentId` and scenario name; the original snapshot remains unchanged. Saved scenarios can serve as parents for further scenarios. Parent links are subject to the same snapshot retention limit as other share links. Scenario saves are limited to twelve per IP per minute and 200 per day per process; these controls reset with the process and are not account access controls.

## Claims and receipts

The agent constructs a closed claim ledger from supported rank, geographic-result availability and interpretable trend evidence. With the optional LLM enabled, the writer selects IDs from this ledger. Unknown or cross-artist claim IDs are discarded, and the original claim text is rendered. The LLM cannot add its own factual prose to the grounded notes.

Receipts retain tool arguments, purpose, envelope status, timestamps, latency, attempt count, source mode, cache state and up to twelve compact result rows. Compact rows contain recognized public entity labels and selected scalar fields; full raw provider payloads are not retained in the shared snapshot. A receipt can explain which observation supported a decision, but cannot reconstruct every underlying provider response.

The SHA-256 digest covers the compact record's tool, arguments, source, fetched time, status and evidence. It does not cover every display field, is not digitally signed by Qloo, and is not anchored in an immutable log. It should not be described as tamper-proof provenance.

Synthetic data is identified separately. Live mode means the live connector was selected; a failed live tool is still a failed tool. An unfamiliar time-series point layout yields an unknown trend until a real fixture establishes its meaning. Geographic results show that data was returned, not that an artist will sell out a room. Audience comparison supplies context without estimating net-new ticket buyers or pairwise overlap percentages.

## Optional comparison and persistence

The Qloo-off baseline asks an LLM to order the original offers without tools. Agreement, directional agreement and rank correlation describe how its answer differs from the grounded workflow. Digit counts in baseline prose flag unsupported numeric content for review; they are not a factual correctness test. No performance uplift, attendance uplift or preference accuracy is established by these metrics.

Snapshots persist in `DATA_DIR`, with retention bounded to 500 snapshots. Share IDs grant read access to the full snapshot and have no user authentication. Use a dedicated persistent directory and treat links as bearer access to buyer-entered data. Cache and rate-limit state are process-local. A public production service would need account access controls, shared quota enforcement and a deliberate retention policy.

## Presentation assets

The responsive workspace uses a midnight-blue and gold palette and five owner-supplied artwork files, recorded in [`public/assets/SOURCES.md`](../public/assets/SOURCES.md). They are atmospheric visuals, not artist photographs or Qloo evidence. Motion is opt-in; the approximately 18.3 MB rain-lantern GIF should not be an automatic page-load dependency. The MIT code license does not assert ownership of the supplied artwork.
