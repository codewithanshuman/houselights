# Qloo decision-proof experiment protocol

Version: `qloo-proof-v1`. The experiment is a **fixed-pool selection test**. It never treats an optimizer policy point as observed attendance, revenue, cultural preference, or causal Qloo benefit.

## Locked input and four arms

Create from an immutable saved HouseLights decision through `POST /api/experiments` with `sourceSnapshotId`. The server freezes the saved candidate identities, fees, availability, terms, original constraints, Qloo receipts, and any saved LLM control. Only the organizer may create, run, read, or export a private experiment. Repeating an identical create request returns the same experiment ID. The input and report have SHA-256 digests; completed results are immutable. An interrupted worker can be explicitly resumed through `POST /api/experiments/:id/run`.

The arms receive the same frozen artist pool and terms:

1. **LLM only:** reuse the saved, tool-free first-trial model response. It was selected from an allowlisted brief without Qloo ranks or receipts. A missing, stale, failed or invalid response stays missing or invalid; no substitute is generated.
2. **Constraint only:** choose the least expensive exact-size lineup satisfying the shared operational constraints, with a deterministic ID tie-break.
3. **Qloo withdrawn:** run the exact HouseLights optimizer after removing all four cultural signal groups and their dependencies.
4. **Full HouseLights:** run the same optimizer with all saved cultural observations available.

The original policy is preserved by default. If it has a Qloo-derived `minimumAverageFit`, evidence-free arms are **not comparable**. The organizer may explicitly declare `policy: "shared_operational"` when creating a separate evaluation. The removed fit floor and original value are stored in the locked configuration. A saved LLM response from the original policy is then stale until a matching control is collected. The experiment never silently relaxes constraints.

## Signal and receipt counterfactuals

The four groups are `rank`, `local`, `trends`, and `comparison`. The engine runs all 16 subsets, including all-off and all-on. It also withdraws up to 64 linked receipts one by one, affecting every candidate that depends on a shared receipt. Missing observations remain missing. Each result records lineup, feasibility, quoted fees, confidence, and changed artists.

The contribution calculation uses exact four-player Shapley weights over a frozen internal diagnostic:

> For each subset of enabled signals, choose a lineup under that subset, then evaluate that selected lineup once on the original full-evidence HouseLights policy score.

Contributions explain how evidence changes the **model's decision**, not real-world causal value. If any subset lacks a feasible lineup, attribution is unavailable. Six discrete scoring-weight profiles test whether the full-versus-no-evidence selection difference persists under plausible preference changes. Each changed artist has linked receipt IDs and timestamps for inspection; linkage is not proof that a receipt caused a real-world outcome.

## Evaluation and denominators

Operational measures are hard-constraint violation codes, feasible decisions, quoted booking cost, budget utilization, lineup overlap, evidence completeness, and deterministic decision changes. Model-provider cost is reported only if an auditable source receipt supplies it; this local replay makes no new provider calls. Worker start and completion times measure replay runtime separately from source research latency.

Human preference and post-event outcomes are independent tracks. A linked blind study counts only submitted real ballots; ties and abstentions stay visible, and the decisive preference denominator excludes them. Wilson intervals are descriptive because reviewers may judge multiple briefs. Repeated LLM generations on one brief are clustered under that brief and must not be counted as separate markets. Booking fee differences are summarized within currency, never across currencies.

The separate `POST /api/experiments/discovery` protocol accepts independently generated Qloo, LLM, and explicit non-Qloo candidate lists against one brief, records each origin and common identity, availability and fee checks, then compares eligible candidate overlap. Submitted source references remain **organizer attestations** until an external evaluator checks them. It does not reuse a Qloo-discovered fixed pool as proof of discovery benefit.

## Replay and limitations

`npm run reproduce:qloo-proof` reads committed `deploy/judge-cases.json` and writes the full locked public reports to `results/qloo-proof.json` plus a count-first summary in `results/qloo-proof.md`. Public judge cases are sanitized projections; private source snapshots and reviewer tokens never enter those artifacts. The public [Proof Lab](/proof-lab.html) exposes the same 16 combinations without authentication. Private exports contain the frozen input and report for independent replay under the pinned model version.

The current published manifest has five distinct saved briefs and five artist pools across four cities. The fifth brief is a 2026-10-23 provider-backed New York run with a complete 31-event application log and 18 linked live-Qloo receipts. The older four briefs contain receipt completion timestamps but no saved model-step trace. The target of 12–20 distinct, independently supported briefs is **not met**. The manifest has no submitted blinded judgments or held-out event outcomes. A small suite can demonstrate correctness and transparency but cannot establish generalization or commercial superiority.
