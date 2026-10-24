# Houselights Autopilot 2.0

**Brief → evidence-gap research → feasible strategies → stress test → stress follow-up → decision packet.**

Autopilot runs in two places:
- **Booking Desk** (`/judge.html`, step 03): public, published briefs. It shows a recorded provider-backed run and re-plans any brief from saved evidence with zero provider calls.
- **Organizer workspace** (`/workspace.html`): private, behind the organizer token. Organizers create new events, research them with Qloo, decide, revise, compare and export. See [organizer workspace](organizer-workspace.md).

Reused, not rebuilt:
- the exact slate optimizer;
- the Qloo `Run` client, with receipts, budgets and caching;
- the memo research agent (`buildMemo`), used for new events;
- the contingency engine and decision-proof evidence ablations;
- SQLite persistence and organizer authorization.

## What changed in 2.0

| Area | 1.0 behaviour | 2.0 behaviour |
|---|---|---|
| Research selection | Tested each missing signal alone. Two signals needed together were labelled "immaterial". | **Joint materiality**: for every feasible challenger bill, the best case of its open gaps is compared with the worst case of the incumbent's. Evidence enters the objective additively per artist (`evidencePoints`, tested against the optimizer), so this bound is exact and needs no outcome enumeration. A gap is decision-material if it belongs to the smallest answer set that could flip the bill within the remaining calls. If that set needs more calls than remain, the gap is `deferred`, not researched. |
| Priority within material gaps | Fixed tier order. | Calls needed, learned answer rate per evidence kind, batched trend cost, and validation of booked acts. |
| Incomplete Qloo ranking | All fit discarded; the full pool was re-queried with the same request. | The re-query covers **bookable acts only**. If it is still incomplete, the bill is marked **provisional**, a separate "best among acts Qloo could rank" strategy is shown, and the packet asks the organizer to approve keeping an unranked act. |
| Robustness | Count of budget-only checks, with a coverage tie-break that could label a bill "most resilient" without better survival. | One **common scenario set** for every bill: 5–20% budget cuts; +10/20/30% on each fee; each act unavailable; three combined shocks. Each scenario is **held**, **repaired** (one act swapped) or **failed**. A bill is called more robust only if it strictly beats the recommendation on plan continuity, or on unchanged holds at equal continuity. |
| Integrity | The decision digest ignored receipt numbers, so editing an affinity left it unchanged. | Per-receipt **content digests** over canonical JSON, a **manifest** with its own digest, the decision digest covering every receipt digest, and **pinned** manifest digests in reviewed code. Three separate verdicts are reported (below). |
| Failures | Error envelopes only. | Transport exceptions and client disconnects are recorded as failures, not evidence. Runs are marked `partial` with stop reason `provider_unavailable` or `interrupted`. |
| Packet | Markdown. | Structured packet rendered to Markdown and print-ready HTML with tables (section list below). |

## Qloo affinity scores, near-ties and comparability

**Fit uses real Qloo scores.** Qloo's rank tool returns an affinity score for every ranked entity. Ordinal positions turn a 0.0001 affinity gap into a full rank step: in a five-act pool, one step is 25 fit points per slot. Fit is now `(affinity − lowest) / (highest − lowest)` across the ranked pool. Ordinal position is used only when a score is missing. This applies to Autopilot, the organizer workspace and new research (`server/affinity.mjs`, `buildMemo`).

**Near-ties are declared and checked.** Candidates whose scores differ by less than **0.002** form a near-tie group. The decision is re-optimized with each group given equal fit. If the bill changes, the packet raises a high-severity "near-tie decides the bill" finding and an approval action. Qloo publishes no score uncertainty, and repeated live captures returned identical scores, so the band is a declared sensitivity threshold, not a noise estimate.

**What the real scores changed:**
- *New York: compare all three methods.* Sault and Jordan Rakei differ by 0.0001. The ordinal bill Kiwanuka + Sault becomes Kiwanuka + Rakei under affinity.
- *Recorded New York run.* After research the bill is still Kiwanuka + Sault, but it rests on the same 0.00014 near-tie. Treated as tied, it would be Kiwanuka + Rakei, $3,500 cheaper. The packet asks the organizer to decide.
- Near-ties with no effect on the bill are disclosed for Berlin, Amsterdam and São Paulo.

**Comparability.** A comparison is supported only when every bookable act has a rank from one complete Qloo query. **Mumbai** (4 of 5 ranked), **Paris** (2 of 5) and **Sydney** (5 of 6) fail this test, as does the recorded Chicago example (Qloo omitted Durand Jones & The Indications). They are excluded from the shock-study comparison, the Proof Lab's comparative LLM statistics and the 12-brief audit. Their packets say "Not comparable", and the desk's Qloo preview no longer claims a Qloo effect for them.

**Frozen studies are not re-scored.** The shock cohort, the Qloo Proof Lab reports and the published simulator baselines were locked before this change, and keep their original ordinal fit. Their reports now add comparability and near-tie columns computed from the saved scores. The Proof Lab shows which published bills would differ under affinity; New York: compare is the only one.

## Integrity: what is verified and what is not

`verifyRecordedAutopilot(file, { pinnedManifestDigest })` reports three separate properties:

1. **Evidence-content integrity.** Every public receipt still hashes to its manifest digest. The manifest still hashes to its own digest. Decision inputs (fits, flags, terms) and source receipts match. Edits to affinity, entities, status, arguments, timestamps or capture-time digests are detected. Anyone who rewrites the content *and* recomputes every digest is detected only against the independent pin in `server/autopilot-pins.mjs`, which the release check also enforces.
2. **Decision reproducibility.** The deterministic policy is replayed against the recorded observations with no provider calls. 2.0 records must reproduce identical actions, observations, history, strategies, stop reasons and decision digest. The 1.0 record has been migrated to `results/autopilot-recorded-v1.json`: a manifest was added and tied to the Git blob of the committed 1.0 file. It replays under the 1.0 policy, and only its research reproducibility is checked.
3. **Provider provenance.** This is **not verified.** Qloo responses are unsigned. `originalDigest` values are application hashes made at capture, not provider signatures.

The adversarial tests modify a receipt's affinity, an entity name, a status and a provenance digest; each is caught by the appropriate check. They also cover a self-consistent forgery, which only the pin catches.

## Decision packet (2.0)

The packet has these sections:
1. Event brief and objectives.
2. Recommendation, marked **for human approval**, with provisional status where it applies.
3. Strategy comparison under the same constraints and scenarios, with "prefer it when…".
4. Backups for every booked act.
5. Fees and availability. Each is labelled quoted, estimate, illustrative or unknown, and confirmed, assumed or not confirmed, with "needs confirmation" flags.
6. Budget and financial sensitivity: fee ceilings and budget floor. Break-even appears only when the promoter supplied commercial assumptions, and it is arithmetic, not a forecast.
7. An evidence matrix that separates *measured* from *missing* evidence, with the reason each gap is missing.
8. Stress test.
9. Remaining uncertainties.
10. Prioritised next actions, each tagged *Requires human approval*, *Confirm with agent* or *Recommendation*.
11. Assumptions and limits, plus a receipt index with content digests.

Hypothetical fee ceilings say "not a quote". Cultural affinity is never described as demand.

## Recorded runs

- **New York (Booking Desk).** Captured with `npm run capture:autopilot` using 6 fresh Qloo calls, all `ok`. The location-free cross-check shows that Sault's slot depends on New York taste. Trends returned no interpretable direction. The decision did not change. `npm run reproduce:autopilot` replays it exactly.
- **New organizer event (workspace example).** Captured with `npm run capture:workspace-example`: "Night Shift Soul Revue", Chicago, references Leon Bridges and Erykah Badu. It used 26 live Qloo calls: 20 for research and 6 for the first decision. Qloo's ranking omitted Durand Jones & The Indications even in a bookable-only query, so both decisions are **provisional**. The packet offers the ranked-only bill and asks for approval. After the organizer cut the budget to $15,000 and entered a $9,500 Masego quote, the bill changed from Thee Sacred Souls + Thundercat to Masego + Thee Sacred Souls with no new research calls. Fees, venue and ticket price are illustrative inputs.

## Evaluation

See [research-policy evaluation](../results/research-policy-heldout.md), [close-call evaluation](../results/research-policy-heldout-close.md) and the [12-brief audit](../results/autopilot-evaluation.md). The protocol was declared before the held-out runs in [evals/autopilot-policy-protocol.json](../evals/autopilot-policy-protocol.json). In summary, 2.0 fixes the interacting-evidence blind spot, which the tests prove. On held-out synthetic scenarios its decision agreement equals 1.0 in the general family. In close calls it is 95% vs 93% at 4 calls, but with slightly higher mean regret, which is within noise. It does not demonstrably beat a fixed-order heuristic. Details are in [the milestone report](autopilot-2-report.md).

## Limits

- Policy points are the optimizer's declared objective. They are not demand, attendance or revenue.
- Research-selection comparisons use synthetic ground truth. They test policy behaviour, not real audiences.
- Live trend calls in this deployment return series without an interpretable direction.
- Qloo sometimes omits a requested artist from a ranking. The decision then stays provisional rather than imputing a rank.
- No human promoter has evaluated a packet, and no ticketing outcome validates one.
