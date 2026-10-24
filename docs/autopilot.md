# Houselights Autopilot

**Promoter brief → evidence-gap research → feasible strategies → stress test → stress-driven follow-up → decision packet.**

Autopilot is step 03 of the public [Booking Desk](/judge.html#8be4d03ef4792ca9f1466983). It reuses the exact slate optimizer, the Qloo `Run` client with receipts and budgets, the contingency engine and the decision-proof evidence ablations. The new part is the research policy that decides what is worth asking Qloo, and the connection of stress results back into research and into the final recommendation.

## How the agent decides what to research

1. **Frame.** Optimize the brief with the saved evidence and record the starting bill.
2. **List unanswered questions.** For every candidate and every missing evidence class (geography, audience comparison, trend), plus pool-level ranking completeness and a location-free ranking cross-check.
3. **Test each question against the optimizer before spending a call.** Every possible observation is applied hypothetically. Geography and comparison are tested as "returned"; trends as both rising and cooling. The exact optimizer is then re-run. Each question gets a tier:
   - `ranking`: the pool ranking is incomplete. Fit carries 100 policy points per slot, so this comes first.
   - `material`: some possible answer changes the recommended or fallback bill.
   - `robustness`: the location-free ranking cross-check.
   - `justification` / `fallback`: no answer changes the bill, but the act is booked (or is the replacement under a stress scenario). The packet would justify it without evidence.
   - `immaterial`: no answer changes any strategy, and the act is not booked anywhere. **Not researched**, with the reason shown.
   - `blocked`: no fee or availability (Qloo cannot make an act bookable), or no anchor identities.
4. **Execute** the highest-priority question with the matching Qloo tool: `rank`, `where_popular`, `compare_audiences` or `trends`. Trend questions are batched.
5. **Integrate only what the receipt shows.** Empty, uninterpretable or failed answers leave the gap open. Nothing is imputed.
6. **Re-optimize after every observation** and record any decision change with its causing receipt.
7. **Stop** when one of these holds:
   - `sufficient`: no researchable question remains and every answer was usable.
   - `exhausted`: everything relevant was attempted, but some answers were unusable.
   - `budget_exhausted`
   - `round_limit`
   - `provider_unavailable`: two consecutive failures.
   - `planning_only`: public replay with no calls.

   A quarter of the call budget is held back for stress follow-up.
8. **Strategies.** Three bills are built from the exact enumeration:
   - **Strongest cultural fit:** the optimizer winner.
   - **Lower-cost:** the best policy score among cheaper feasible bills.
   - **Most stress-resilient:** survives the most declared stress scenarios unchanged (budget cuts of 5–20%, +10/20/30% on each booked fee, three combined shocks), then cancellation coverage, then score.

   A **location-free** bill is added when the cross-check disagrees with the city-weighted ranking. Coincident strategies are merged and labelled, not duplicated.
9. **Stress test the recommendation.** This step covers artist unavailability with survivors locked, fee increases, budget cuts, combined shocks and withdrawal of all or individual evidence classes. It also produces exact break points: the maximum fee per booked act, the minimum budget, and the bill that replaces it.
10. **Stress-driven follow-up.** Fallback bills from cancellations and the budget floor become new research contexts. Their open questions are tiered and researched with the remaining budget, then strategies and stress are recomputed.
11. **Decision packet.** It contains:
    - the recommendation, with per-artist claims linked to receipts;
    - alternatives and their trade-offs;
    - assumptions;
    - research verdict: did research change the decision, and if not, why;
    - robustness findings and break points;
    - evidence gaps, each with its status and reason;
    - quote leads for top-ranked but unquoted artists, with the hypothetical fee at which the optimizer would book them;
    - actionable next steps.

    It is exported as Markdown and as a strict-CSP printable HTML page.

The research policy is deterministic. No LLM chooses actions or writes facts, so runs are reproducible and every sentence is a template over receipts and optimizer output. The separate [LLM-directed investigator](advanced-workflows.md) remains available.

## Three clearly separated modes

| Mode | Where | Provider calls | Label |
|---|---|---|---|
| Recorded provider-backed run | Booking Desk default for the New York recorded case; `public/autopilot-recorded.json` | 0 when viewed (6 at capture) | "RECORDED PROVIDER-BACKED RUN … This page made no new provider calls" |
| Planning replay | Any published case, any budget; `POST /api/judge/cases/:id/autopilot` (anonymous, rate-limited) | 0; research budgets rejected | "PLANNING REPLAY · SAVED EVIDENCE ONLY … nothing below was newly researched" |
| Fresh run | `POST /api/judge/cases/:id/autopilot/live` (organizer token; counted as paid research) | ≤16 workflow calls | "FRESH PROVIDER-BACKED RUN", or "SYNTHETIC QLOO DATA" in mock mode |

Fresh runs are persisted: `GET /api/autopilot/runs/:id` returns the run and `…/packet[?format=md]` returns the packet. Bearer-link semantics match saved memos.

## The recorded New York run (genuine)

This run was captured with `npm run capture:autopilot` against case `8be4d03ef4792ca9f1466983`. It used an isolated cache, so all 6 calls are fresh and `cached:false`. All six Qloo receipts returned `ok`.

1. *Robustness:* a location-free rank of the same 8 candidates [a1]. It would select **Michael Kiwanuka + Jordan Rakei** instead of **Michael Kiwanuka + Sault**. Sault's place in the bill depends on the New York signal. The packet reports this as a high-severity finding and a next step ("decide how local the audience is").
2. *Justification:* Kiwanuka, the booked headliner, had no geographic or audience-comparison evidence in the original run. Qloo returned 10 New York geography rows [a2] and an anchor comparison [a3].
3. *Justification:* trends for Kiwanuka and Rakei [a4] returned data with no interpretable direction. The gap stays open, and further trend queries are skipped.
4. *Justification:* Jordan Rakei (lower-cost alternative and the cancellation fallback for both acts) received New York geography [a5] and an anchor comparison [a6].
5. It stopped with `exhausted`: 2 answers were unusable. Six gaps for Khruangbin and Hiatus Kaiyote were judged immaterial and **not** researched. The quoted acts had no possible outcome that changes any strategy.
6. Verdict: the decision did not change. The winning margin is 7.14 policy points, and no tested outcome could alter the selection.

Two independent live captures about 20 minutes apart produced the identical run digest (`sha256:4863df3b…`). `npm run reproduce:autopilot` replays the record offline. Each call is answered only from the recorded receipt for identical tool and arguments. The check requires identical actions, decision history, strategies, stop reasons and digest. Tampering with a receipt's arguments or evidence fails the check.

## Evaluation

Run `npm run evaluate:autopilot`. It makes no provider calls. Output is in [results/autopilot-evaluation.md](../results/autopilot-evaluation.md) and `.json`.

- **Saved Qloo evidence across 12 published briefs.** Withdrawing the saved Qloo evidence changes the optimized decision in 9 of 11 feasible briefs. Across 80 recommended, alternative and fallback selections there are 0 hard-constraint violations. The infeasible Paris brief spends 0 calls: evidence cannot fix fees or budget.
- **Research-selection policy (synthetic outcomes, same tools and integration).** The comparison is against fixed-order (top-ranked artists first, like the original memo agent) and random research. Agreement with the full-information decision:

  | Budget | Autopilot | Fixed order | Random (mean) |
  |---|---|---|---|
  | 2 calls | 12/12 | 12/12 | 10.4/12 |
  | 4 calls | 12/12 | 12/12 | 11.2/12 |
  | 6 calls | 12/12 | 12/12 | 11.6/12 |

  Booked-act gaps left unresearched are 15 / 6 / 1 for Autopilot versus 9 / 7 / 3 for fixed order. At 2 calls Autopilot leaves more booked-artist gaps, because it spends a call on the ranking cross-check. Autopilot also stops earlier: 63 vs 70 calls at a budget of 6. An earlier version researched ±2-point local gaps before re-requesting an incomplete ranking. That lost agreement on the Sydney brief (11/12) until ranking was prioritised. This metric does not show Autopilot beating a simple heuristic on decision agreement for these briefs.
- **Failure injection.** Every call fails:
  - Stop reasons: `provider_unavailable` 10, `exhausted` 1, `sufficient` 1 (no call attempted).
  - At most 2 calls are spent.
  - Evidence and recommendation are unchanged in 12/12 briefs.
  - Gaps are reported as open.

## Limits

- Policy points are the optimizer's declared objective. They are not demand, attendance or revenue. Fees and availability are illustrative inputs.
- The policy comparison uses synthetic research outcomes. It shows policy behaviour, not that real Qloo answers would change these briefs.
- The live trends tool returns series without an interpretable direction in this deployment. Momentum therefore stays unknown for every artist.
- No human booker has judged the packets. No ticketing outcome validates them.
- Only one brief has a recorded provider-backed Autopilot run. Fresh runs on the public host require the organizer token.
