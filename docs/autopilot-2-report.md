# Autopilot 2.0 milestone report

> **Superseded (25 October 2026).** This document describes an earlier state and is kept for the record. For the current state see [Autopilot](autopilot.md) and the [claims audit](claims-audit.md).

Development branch only. Production is not changed, and nothing is merged to `main`.

## What now works end to end

1. **A new organizer event.** "Night Shift Soul Revue" (Chicago) is not one of the published cases. It was created through the workspace functions, researched with **20 live Qloo calls**, decided with **6 more** and revised (budget $22,000 → $15,000; Masego estimate $9,000 → quote $9,500, confirmed). It was decided again on the same evidence with no new calls and compared. The bill changed from *Thee Sacred Souls + Thundercat* to *Masego + Thee Sacred Souls*. Qloo omitted Durand Jones & The Indications from the ranking even in a bookable-only query, so both decisions are labelled **provisional**. Each packet carries a "best among acts Qloo could rank" strategy and an approval action. The record is `public/workspace-example.json`, replayed at `/workspace.html#example`. Tests also exercise the full workspace flow through the token gate in Chromium and across a real server restart.
2. **Bounded research that targets decision-relevant evidence**, including evidence that only matters in combination (see the policy evaluation).
3. **Strategies compared under one common scenario set**, each with "prefer it when" guidance and backups per act.
4. **Tamper-evident records** with three separately reported properties. The provider's authenticity is stated as unverifiable.
5. **An organizer-ready packet** in Markdown, HTML and JSON, with approval-tagged next actions and fee and availability status.

## Before and after

| Workflow | Before (1.0) | After (2.0) |
|---|---|---|
| New event | Only published judge briefs | Private workspace: brief → research → decide → revise → compare → packet; survives restart |
| Interacting evidence | `local:c` and `trends:c` each "immaterial" although together they flip A+B → A+C | Both marked *decision-material (joint)*, researched first, and the bill flips to A+C with 2 calls. 1.0 spends its first call on the cross-check and stays on A+B (test `autopilot-v2.test.mjs`) |
| Incomplete Qloo rank | All fit discarded; identical full-pool re-query | Bookable-only re-query; provisional label; ranked-only strategy; approval action |
| Robust strategy | Could be chosen by a coverage tie-break | Strict improvement on plan continuity or unchanged holds, on common scenarios; ties say "no bill is more robust" |
| Receipt tampering | Changing an affinity left the decision digest unchanged | Caught by content integrity and by the decision digest; self-consistent forgery caught by the pin |
| Booking Desk cancellation | A cancellation card reset an edited budget | The budget, locks and exclusions are kept (browser test) |
| Ambiguous artist names | Not actionable | Qloo's candidate matches are offered; the chosen entity ID is used in research |
| Provider exception or disconnect | Exception path untested | Recorded as a failure (not evidence); run labelled `partial` |
| Mobile layout | — | A grid min-content overflow introduced during this milestone was found by browser tests and fixed |

## Research-policy evaluation

The protocol was declared before the held-out runs ([evals/autopilot-policy-protocol.json](../evals/autopilot-policy-protocol.json)). Results: [general family](../results/research-policy-heldout.md) and [close calls](../results/research-policy-heldout-close.md). Both use synthetic ground truth and make no provider calls.

**General family** (150 held-out scenarios). Agreement with the full-information bill, then mean regret in policy points:

| Calls | Fixed order | Random (3 seeds) | Autopilot 1.0 | Autopilot 2.0 |
|---|---|---|---|---|
| 1 | 97% / 0.478 | 89% / 2.587 | 97% / 0.485 | 97% / 0.485 |
| 2 | 98% / 0.314 | 94% / 1.333 | 99% / 0.310 | 99% / 0.310 |
| 4 | 99% / 0.310 | 95% / 1.209 | 99% / 0.310 | 99% / 0.310 |

With no additional research, agreement is 85% and regret 3.95. Research helps a lot, and any informed order beats random. **2.0 is identical to 1.0 here**: only 7 of 150 scenarios contain jointly-material evidence.

**Close calls** (80 held-out scenarios where some gap could change the bill; 78 contain joint evidence):

| Calls | Fixed order | Random (3 seeds) | Autopilot 1.0 | Autopilot 2.0 |
|---|---|---|---|---|
| 1 | 90% / 0.059 | 88% / 0.084 | 89% / 0.073 | 89% / 0.073 |
| 2 | 89% / 0.092 | 88% / 0.072 | 89% / 0.085 | 90% / 0.062 |
| 4 | 89% / 0.072 | 88% / 0.087 | 93% / 0.024 | 95% / 0.037 |

With no additional research, agreement is 89%. At 4 calls 2.0 has the highest agreement, but **1.0 has lower mean regret**: its misses were smaller. At 1 call, fixed order is best. Each percentage point is about one scenario, so **none of these differences is statistically meaningful**.

**Honest conclusion.** The 2.0 policy fixes a real, test-proven blind spot: interacting evidence was labelled immaterial. It makes better-targeted calls (`deferred` instead of wasted calls) and gives clearer reasons. On aggregate synthetic decision quality it does **not** demonstrably outperform 1.0 or a simple fixed-order heuristic. The extra complexity is justified by correctness and explanation, not by a measured benchmark win. The diagnostic that explains why: under the declared outcome rates, the favourable *combination* needed to flip a bill is rare, so policies that research different gaps usually end at the same bill.

## Verification

Final verification on the pushed commit is recorded in the delivery message. Run during the milestone:

- `npm test` (Node 24.21.0).
- `npm run test:browser` (Chromium).
- `npm run release:rehearse`.
- `npm run reproduce:autopilot`: 2.0 New York record, and the migrated 1.0 record.
- `npm run evaluate:autopilot`, over 12 briefs: 0 hard-constraint violations across 82 selections. Qloo evidence withdrawal changes 9 of 11 feasible decisions. Failure injection never claims sufficiency after a failed call.
- Live Qloo, limited to about 120 workflow calls across all captures, probes and iterations. Both published records carry pinned or embedded manifests.

## Corrections after review (24 October 2026)

- **Shock headline.** The headline "0 violations vs 9.7% for a re-prompted LLM at 12 candidates" pooled responses on shocks with no feasible lineup. On those shocks the prompt required a lineup, so the LLM was forced to violate a constraint. The like-for-like figure is **3/231 (1.3%)**, on the 77 comparable solvable shocks. The 7 unsolvable shocks (21/21 forced) and Mumbai's 9 non-comparable shocks are reported separately (`results/shocks.md`).
- **Affinity and tie bands.** Fit now uses Qloo affinity scores, and near-ties within 0.002 are re-checked. See [Autopilot](autopilot.md#qloo-affinity-scores-near-ties-and-comparability).
- **Incomplete rankings.** Mumbai, Paris, Sydney and the Chicago example are marked "not comparable" and excluded from comparisons. Among the 9 comparable feasible briefs, withdrawing Qloo evidence changes the decision in 7. This replaces the earlier "9 of 11", which counted Mumbai and Sydney.

## Second audit response (24 October 2026)

The [drawbacks audit response](drawbacks-audit-response.md) has the full map. In code:

- The verifier now fails when a manifest's source receipt is missing.
- Near-ties are pairs, never chains.
- Affinity fit uses a fixed 0.05 span instead of min-max. The recorded run's margin is now honestly 0.14 points.
- Context-only inputs are labelled as such.
- A minimum number of Qloo-discovered acts can be required.
- Workspace research that lost calls is labelled partial.
- The judge page opens with the decision at a glance.

## Limitations and unresolved defects

- Policy-selection results use synthetic ground truth. They show policy behaviour, not real audience outcomes.
- Live `trends` returns no interpretable direction in this deployment, so momentum is always unknown.
- Qloo's ranking can omit a requested artist. Houselights reports the decision as provisional rather than imputing a rank. For the example event, the omission persisted in a smaller query.
- Name resolution uses Qloo's matches. Two of the first example's names ("Anderson .Paak", "Cory Henry") were ambiguous and needed the new chooser.
- Fees, availability, venue size and ticket prices in both published examples are illustrative inputs.
- No promoter or judge has evaluated a packet. No ticketing outcome validates any decision.
- Workspace research is `partial` whenever a Qloo call fails. Two recapture attempts on 24 October lost `where_popular` and `compare_audiences` calls to timeouts, so the published workspace example is still the earlier, complete capture. It used ordinal ranks, and the page says so.
- `cb9ce4a` was deployed to the public host on 24 October. An organizer workspace session (create, live research, decide, revise, compare, packets) passed there; see the [deployment record](shared-oracle-host.md#deployment-of-cb9ce4a--24-october-2026).
- Worst-case CPU (12 candidates, 3 slots, 16 research rounds) is about 4–6 s spread across provider calls, and about 1 s for planning.
