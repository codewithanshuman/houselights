# Claims audit

Checked on 24 October 2026. I re-checked each significant claim Houselights makes publicly against regenerated results; the reproduction commands rebuild them offline. Matched and unmatched comparisons are kept separate. Synthetic results are labelled and never used as evidence of commercial improvement.

## Verified claims

### 1. Qloo changes the recorded New York decision (matched)

**Claim.** For the recorded New York case, with the same pool, fees and $14,500 budget:

- With saved Qloo evidence, the optimizer books Michael Kiwanuka + Sault ($13,500).
- With that evidence withdrawn, it books Jordan Rakei + Hiatus Kaiyote ($9,000).

**Source.** The `qlooOff` experiment on case `8be4d03e…`, which the Booking Desk shows in its first screen. Zero provider calls.

**Status.** Verified on the local build and on the public host.

**Limit.** This shows the evidence influences the decision. It does not show more ticket sales.

### 2. Withdrawing Qloo evidence changes <!--claim:withdrawal-->7 of 9<!--/claim--> comparable briefs (matched)

**Claim.** Among the 9 feasible briefs whose Qloo ranking is comparable, withdrawing the saved Qloo evidence changes the optimized decision in 7.

**Source.** `results/autopilot-evaluation.md`; reproduce with `npm run evaluate:autopilot`.

**Limit.** Evidence influences the decision; ticket sales are not measured; fees are illustrative.

**Sensitivity.** Under ±20% noise on every illustrative fee (200 seeded draws per brief), withdrawal changes the decision in <!--claim:noiseMean-->71%<!--/claim--> of draws on average, but robustly (in at least 95% of draws) in only <!--claim:noiseRobust-->1 of 9<!--/claim--> briefs. Berlin, published as "no change", changes in 63% of draws. "7 of 9" is therefore a point estimate at the published fees ([sensitivity](../results/sensitivity.md); `node scripts/evaluate-sensitivity.mjs`).

**Status.** Verified: regenerated with no change.

**Negative findings.**

- Berlin and São Paulo do not change.
- Mumbai, Paris and Sydney are excluded as not comparable, because the Qloo ranking is incomplete.
- Seven of the twelve briefs are titled "Illustrative", and every brief's fees and availability are illustrative inputs.

### 3. Qloo affinity scores vs ordinal ranks (matched)

**Claim.** Affinity scoring changes the starting bill in 1 of 9 comparable briefs (New York compare): Kiwanuka + Rakei under affinity, Kiwanuka + Sault under ordinal ranks.

**Source.** `results/autopilot-evaluation.md`.

**Status.** Verified.

### 4. The recorded run rests on a near-tie

**Claim.** The recorded run's bill rests on a Sault / Jordan Rakei near-tie (affinity gap 0.00014, band 0.002). The packet hands that choice to the organizer.

**Status.** Verified.

**Disclosure.** Planning on the same saved case without the run's six new calls finds no near-tie decision. In that version Jordan Rakei lacked local and audience-comparison evidence, so the evidence penalty separated the two acts. The research supplied that evidence and left only the fit near-tie. The research made this decision *less* certain, and the packet says so.

### 5. Shock study (matched where comparable)

**Claim.** On 77 comparable solvable shocks, <!--claim:shockViolations-->3/231<!--/claim--> re-prompted LLM responses (<!--claim:shockRate-->1.3%<!--/claim-->) violated a hard constraint, against 0 for Houselights.

**Source.** `results/shocks.md`; reproduce with `npm run reproduce:shocks`.

**Status.** Verified: regenerated with no change.

**Limits.**

- Houselights enforces constraints by construction, so its 0 is a design property, not a measured intelligence advantage.
- The 7 unsolvable shocks (21/21 LLM violations, because the prompt forced a lineup) are reported separately.
- Mumbai's non-comparable shocks are also reported separately.

### 6. Zero hard-constraint violations (by construction)

**Claim.** 82 recommended, alternative and fallback selections across 12 briefs had 0 hard-constraint violations.

**Source.** `results/autopilot-evaluation.md`. An independent reference check also runs in `tests/optimizer-reference.test.mjs`: 5,000 seeded combinations of budget, slots, fees, availability, locks, exclusions, discovery minimum and genre cap.

**Status.** Verified.

### 7. Published records replay exactly

**Claim.** Four pinned records replay under the scoring version that produced them:

- the public New York record, with fixed-span affinity;
- archived records with min-max affinity, 2.0 ordinal and 1.0 ordinal scoring.

**Source.**

- `npm run reproduce:autopilot`
- `server/autopilot-pins.mjs`
- the tests

**Status.** Verified. Content integrity and decision reproducibility pass.

**Limit.** Provider authenticity cannot be verified, because Qloo responses are unsigned.

### 8. Research-policy comparison (synthetic only)

**Claim.** On synthetic held-out scenarios, Autopilot 2.0 does **not** show a statistically meaningful advantage over 1.0 or a fixed-order heuristic.

**Source.** `results/research-policy-heldout*.md`.

**Status.** Verified. This is a negative finding and is kept as one.

### 9. Optimizer vs booking Qloo's top-k (seeded scenarios)

**Claim.** Where the top-k acts by Qloo rank are bookable, the optimizer chooses differently in <!--claim:rankDiffersCount-->177 of 1,517<!--/claim--> scenarios (<!--claim:rankDiffers-->11.7%<!--/claim-->) under affinity fit and <!--claim:rankDiffersOrdinal-->0%<!--/claim--> under ordinal fit. Evidence influences the decision; ticket sales are not measured; fees are illustrative. All 177 come from New York, the only brief with a near-tie at the selection boundary. The top-k could not be booked in 2,083 of 3,600 scenarios; the optimizer found the best bookable lineup in 1,380 and reported infeasibility in 703.

**Source.** `results/rank-vs-optimum.md`; reproduce with `node scripts/evaluate-rank-vs-optimum.mjs`.

**Status.** Verified.

**Limit.** The value lies in constraint handling, not in re-ranking Qloo. Fees and availability are illustrative.

### 10. Blind-review pairs

Of the 8 review-eligible briefs, 3 pair identical lineups (Manchester, Los Angeles, São Paulo), because Houselights and the saved LLM control chose the same acts. Only 5 briefs (Berlin, New York, London, Amsterdam, Toronto) can produce a preference; the other 3 can only produce ties.

## Not established (no evidence exists yet)

| Area | Status |
|---|---|
| Ticket sales, attendance, revenue or profit from following Houselights | None measured. |
| Demand Lab Qloo/no-Qloo backtest | **Defined, not run.** It is gated on 40 qualifying pre-event records; none exist. The README previously implied it had reported results. That was corrected on 24 October. |
| Promoter or judge preference | No blind reviews have been collected. |
| First-time usability | No sessions have been run. The protocol is in the [usability test kit](usability-test-kit.md). |
| Real fees and availability | Every published fee and availability is an illustrative input. |
| Willingness to pay; industry adoption | No customers and no interviews. |

## Unmatched comparisons (context only)

The saved LLM-only controls (Groq) chose different bills, for example Kiwanuka + Rakei for $10,000 in New York. These compare different selection methods under the same constraints. They do not show that either bill is better.

## Corrections made during this audit

- The README's backtest wording was changed to "defined, not run". That covers the "not run" status only; the backtest's design is unchanged.
- The packet's fit-basis wording now follows the scoring version that produced it (see the [architecture document](architecture.md)).
