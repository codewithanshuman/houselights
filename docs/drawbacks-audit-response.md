# Response to the complete drawbacks audit

24 October 2026. This document takes each item in the audit and puts it in one of four groups:

- **Fixed.** Fixed in code, with a test that failed before the fix.
- **Relabelled.** Now disclosed accurately.
- **Measured.** A number is reported, not a claim.
- **Open.** Code cannot close it. Each open item says what would.

Nothing here claims a commercial result.

## Defects fixed in code

| Audit item | What was wrong | Fix | Test |
|---|---|---|---|
| Evidence integrity verification (P1) | `verifyEvidenceContent` checked only the receipts it was given. Supplying none passed. | Every source receipt listed in the manifest must be supplied and must match its digest. A missing receipt is a named failure. The report states how many receipts were checked and whether a pin was used. | `tests/autopilot-v2.test.mjs`: supplying no receipts fails; omitting one fails with exactly one problem |
| Near-tie chaining (P2) | The 0.002 band was applied transitively. Acts 0.0045 apart could form one "tie". | A near-tie is now a pair whose own gap is under 0.002. Every reported pair is narrower than the band. The New York record lists four pairs. It previously listed a three-way group (Charlotte Day Wilson / Lady Wray / St. Paul & The Broken Bones) plus Sault / Jordan Rakei. | `tests/affinity.test.mjs`: four acts 0.0015 apart never form a group spanning the band |
| Affinity normalization (P1) | Min-max scaling stretched any range to 0–1. A 0.0001 gap could look like a full fit step. | Fit is `1 − (top − score) / max(range, 0.05)`. A pool narrower than 0.05 keeps its real spacing. In the New York record the bottom act's fit is 0.41, where min-max gave it 0. | `tests/affinity.test.mjs` |
| Historical vs current scoring (Medium) | Older records would have replayed under the new scale and failed. | Each record carries its scoring version: ordinal, affinity with min-max scaling, or affinity with fixed-span scaling (`fitScale`). Replays use the version that produced the record. All three published generations replay and are pinned. | `tests/autopilot-v2.test.mjs` (three replay tests) |
| Partial research reported as complete (new, found during this work) | Workspace research in which 10 Qloo calls failed was saved as `complete`. | Research with any failed call is `partial`. The workspace shows which calls failed and that the decisions are provisional. Complete research is never replaced by a weaker attempt. The example capture now refuses to publish partial research. | `tests/events.test.mjs` |

## Inputs that were misleading: relabelled or made operational

The audit's finding stands: target audience, programming direction and objectives did **not** change the calculation. I did not quietly wire them into the score, because there is no evidence-based way to turn free text like "grow a younger audience" into weights. Instead:

- **Relabelled.** The workspace form, the Markdown packet and the HTML packet label these fields "context only". The audience is described accurately: Qloo works from the reference artists.
- **Made operational where the mapping is exact.** A new **Minimum Qloo-discovered acts** constraint (`discoveryMin`) feeds the existing optimizer constraint. A promoter who wants discovery can now require it.
- Inputs that always operated are unchanged: budget, slots, fees, availability, genre cap, locks and exclusions.

## Claims corrected (P0: no misleading claims)

| Claim | Now |
|---|---|
| "0 violations vs 9.7%" | 3/231 (1.3%) on 77 comparable solvable shocks. Forced and non-comparable shocks are reported separately (`results/shocks.md`, regenerated and unchanged). |
| "Qloo changes 9 of 11 decisions" | 7 of 9 comparable feasible briefs. Mumbai, Paris and Sydney are marked not comparable and excluded. |
| The recorded run's "7.14-point margin" | Under fixed-span scaling the margin is **0.14 policy points**. The bill rests on the Sault / Jordan Rakei near-tie (affinity gap 0.00014), and the packet says so. The recapture shows how thin the decision is. |
| "Recalculate and prove" | "Recalculate and check". The glossary defines a *decision proof* as a consistency record, not evidence that a bill sells more tickets. |
| Workspace example | It was captured before affinity scoring. The page now says its decisions used Qloo rank order. Two attempts to recapture it were refused because Qloo `where_popular` and `compare_audiences` timed out. |
| Research-policy superiority | Already reported as not demonstrated (`docs/autopilot-2-report.md`): none of the 2.0 vs 1.0 vs fixed-order differences is statistically meaningful. That statement is kept. |
| Hard-constraint advantage | Houselights enforces constraints by construction. The comparison shows the LLM's failure rate, not superior intelligence; `results/shocks.md` says this. |

## Judge journey (P1: one visible decision)

`/judge.html` now opens with **The decision at a glance**, loaded from the recorded live run before any mechanics. It shows four blocks:

- **BOOK**: the bill and its cost.
- **WHY**: the first Qloo claim for each act.
- **WATCH OUT**: the critical and high-severity risks from the stress test.
- **YOUR CALL**: the human decision, here the near-tie.

It also states the limits: illustrative fees, fit not demand, nothing booked. A plain-language glossary covers each term the audit listed as jargon. Whether this helps a first-time user is not yet known; see the usability kit below.

## Measured performance (P2)

Measured on the development machine (Node 24.21, Windows 11):

| Measure | Value |
|---|---|
| Zero-call Autopilot planning, 12 published briefs | median 96 ms, max 198 ms |
| Verifying the public record (content, pin, full replay) | 421 ms |
| Qloo call latency, recorded Autopilot run (6 calls) | median 6.3 s, max 9.5 s |
| Qloo call latency, workspace research (26 calls) | median 0.6 s, max 5.3 s |
| Judge page first-party assets | HTML 15 KB, CSS 41 KB, JS 28 KB, recorded run 141 KB |

These figures come from one machine with no concurrent users. **Not measured:** load from concurrent organizers, real-device mobile on slow networks, and multi-instance deployment.

On 24 October Qloo's location and audience-comparison tools timed out repeatedly (45 s per-call timeout, 150 s research deadline). Research then degrades to `partial` and says so. It does not stall, and it does not invent evidence. Provider dependence is real.

## Open: code cannot close these

| Audit item | Status | What would close it |
|---|---|---|
| Latest code on the live host (P0) | The host still reports release `c5028158`, which predates the Booking Desk, Autopilot and the workspace. | Deploying the verified `development` commit, with the owner's explicit approval, then running `npm run release:verify` against the host. Not done. |
| External usability and booking-value feedback (P1) | Zero sessions. | Run the [usability test kit](usability-test-kit.md) with at least five first-time users and two working bookers. Publish every result, including failures. |
| Real-world booking advantage | None established. | Prospective decisions paired with real ticketing outcomes (`npm run import:outcomes`). The paid-tickets model stays disabled until its holdout gates pass. |
| Cultural fit ≠ ticket demand | A permanent limitation of the evidence. It is stated on every packet and on the glance card. | Calibration against real outcomes, as above. |
| Real fees and availability | All published fees and availability are illustrative inputs. | Real quotes from agents. The software already distinguishes `quoted` from `estimate` and `confirmed` from `assumed`. |
| Incomplete Qloo rankings; uninterpretable trends; ambiguous names | Provider behaviour. Houselights marks these cases not comparable, unknown or needing a choice; it never imputes. | Qloo-side changes. |
| Unsigned Qloo responses | Hashes prove a record is unchanged since capture, not that Qloo sent it. The verifier reports provenance as "unverifiable". | Signed provider responses. |
| Single organizer token; bearer share links; SQLite on one instance | Documented design limits of a prototype. Events never enter the public link table. | Per-user accounts, expiring links and a multi-instance store before any multi-customer use. |
| Qloo cost predictability | Budgets count workflow calls, which are not billed HTTP requests. | Provider billing data. |
| Willingness to pay; workflow adoption | No customers and no pricing research. | Customer interviews. Code cannot supply this. |

## Verification for this change

The release state for this change is in the commit message and `docs/autopilot-2-report.md`. The checks are:

- `npm test`, the full suite
- `npm run test:browser`
- `npm run release:rehearse`
- `npm run reproduce:autopilot`
- `npm run reproduce:qloo-proof`
- `npm run reproduce:shocks`
- `npm run evaluate:autopilot`
