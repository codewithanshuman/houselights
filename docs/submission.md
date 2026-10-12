# Submission draft

## Problem

Independent talent buyers assemble programs from artist offers, booking fees and a working understanding of their room. A famous artist is not automatically a good audience fit, and a good individual recommendation is not automatically a feasible slate. Buyers need to understand which assumptions and observations changed the decision.

## What Houselights does

Houselights is the slate optimizer with receipts. A buyer enters a city, anchor artists representing their audience, candidate offers and booking constraints. An agent resolves the artists, discovers adjacent choices using Qloo, ranks the pool against the anchors and inspects selected artists for geographic, audience and trend context. An exact optimizer selects the highest-scoring feasible slate under a visible policy. The buyer can inspect the objective, explore swaps, stress-test alternative budgets and quotes, save named scenarios and see why an impossible brief needs to change. A contingency engine freezes surviving bookings during cancellation drills, maps the replacement bench, and searches every feasible bill for the strongest worst-case recovery. The Decision Gauntlet turns six defensible planning habits into server-verified missions, making the trade-offs learnable without pretending XP predicts demand.

Each grounded note links to a receipt recording the Qloo workflow, inputs, status, timing and compact evidence. The optional LLM allocates deeper checks and selects verified claims; it does not invent fees, demand estimates or unsupported narrative statistics.

## Why Qloo matters

Qloo changes the candidate pool and its ordering using cultural affinity and geographic context, then adds inspectable audience and trend observations. The optimizer alone cannot supply this information. Without Qloo, Houselights can check fees and constraints but has no supported cultural-fit ranking. Optional Qloo-off LLM comparison data in the exported memo exposes differences without claiming that disagreement itself proves improvement.

The [official Qloo hackathon kit](https://github.com/qloo/qloo-hackathon-kit) and `@qloo/qloo-harness` provide the integration foundation. The application adds constrained decision making, evidence-budget planning, a claim ledger, exact evidence-weighted market routing, a closed-loop campaign controller and auditable portfolio trade-offs.

## Judge walkthrough

Allow roughly five minutes. Use a live-key fixture that has actually been tested before presenting. If showing synthetic mode, state that explicitly and do not describe its output as real Qloo evidence.

1. **Define the room.** Enter city and anchor artists. Enter offered artists with clearly labeled illustrative fees, availability and genres. Explain who supplies each input.
2. **Run the workflow.** Show identity resolution, Qloo discovery, ranking and the planned deeper checks. If an identity is ambiguous, choose a confirmed provider candidate.
3. **Inspect the chosen slate.** Show cost, unused budget, hard constraints, number of combinations checked and objective components. Explain that policy points are not a sales forecast.
4. **Challenge it.** Lock or exclude an artist, lower the budget, or increase the discovery requirement. Show the new optimum or explain the precise infeasibility. An artist without a fee remains unbookable.
5. **Show the receipts.** Open the source receipt behind a supported claim. Show timestamps, source mode and compact evidence. Also show a missing-evidence case so a judge can see how uncertainty survives into the result.
6. **Show the trade-off.** Inspect a feasible swap and a frontier option. Explain which constraints or policy components account for the difference.
7. **Stress the decision.** Show the 80–120% budget ladder and the 0%, 10%, 20% and 30% fee increases. Explain whether the original slate survives a higher quote, whether a replacement slate exists, and which artists change. Keep locks and availability fixed. These are hypothetical planning cases, not success probabilities.
8. **Rehearse a cancellation.** Run `npm run contingency -- <saved-run-id>` or call `POST /api/contingency`. Show that the other booked artists stay fixed, name the exact replacement and surface any critical dependency. Compare the optimum with the robust slate and state its visible utility cost. Coverage describes only the declared drills; it is not a probability.
9. **Build a market route.** Run `POST /api/intelligence/:id` with explicit candidate coordinates. Show the selected-artist × market receipt matrix, every pair comparison, exact route count, travel schedule, aggregate audience activation profile and cultural place leads. Qualify those leads with sourced capacities through `POST /api/venues/:id/qualify`, show the room-fit rule and break-even call sheet, and state that audience context and attendance rows are evidence inputs and arithmetic rather than conversion or demand forecasts.
10. **Move from decision to execution.** Generate a booking packet for an explicit event. Inspect one hold request's evidence lines and number guard, then move one artist through approval and outreach. Show the Day 3/7/14 reminders, campaign negotiation ceiling, exact cancellation fallback and logistics gate.
11. **Interrogate the dossier.** Open `GET /api/dossier/:id/report`, then ask the report API about risks, the multi-market comparison or receipts. Ask for a ticket-sales prediction and show the evidence boundary refusing it.
12. **Save an alternative.** Edit a quote or constraint, save a named scenario and open its share link in a fresh session. Show its parent run and the preserved source receipts. The server recomputes this scenario from saved evidence, rather than trusting scores sent by the browser.
13. **Play the Decision Gauntlet.** Score the current slate, apply the 90% budget mission and re-optimize. Show how clearing the budget mission can lose the quote-shock mission. This is the core lesson: robust booking is multi-objective, and every badge is derived from the displayed constraints and saved evidence.
14. **Compare.** If a model is configured, inspect the Qloo-off comparison in the exported memo or its optional UI section as a descriptive contrast. The optimizer's input-order baseline is a separate comparison, not the tool-free LLM answer. End with the specific buyer decision the product supports.

## Evidence to collect before claiming impact

- Run real Qloo fixtures covering ordinary names, ambiguity, absent geographic data and unfamiliar trend payloads. Preserve sanitized examples and verify their adapters.
- Ask real venue bookers to assess anonymized, paired slates using the same candidate pool and booking terms. Record the number of participants, rubric, preferences and objections, including unfavorable results.
- Compare a Qloo-grounded slate with a constraint-only baseline and a tool-free LLM baseline under the same brief. Do not turn agreement metrics into a correctness claim.
- Document whether the app saves planning time or surfaces useful artists with actual observed results. Ticket-sales or revenue impact requires separate evidence and is not currently established.

## Must complete before submission

- [ ] Complete the [Qloo key request](key-request.md), including the applicant's personal fields and rule acceptance, then run the complete app with a valid live key. The request has not been submitted by the application.
- [ ] Calibrate adapters against real Qloo outputs; keep unknown measurements unknown until their semantics are established.
- [ ] Complete real-booker testing or explicitly disclose that impact validation remains pending.
- [ ] Publish a working external demo and verify it is accessible end-to-end without private access.
- [x] Publish the complete source repository and reproducible setup instructions.
- [ ] Confirm appropriate distribution rights for the supplied visuals; [artwork provenance](../public/assets/SOURCES.md) is included, but the MIT code license does not assert ownership of them.
- [x] Verify that the MIT `LICENSE` file is visible in the public repository and recognized in its About/license area.
- [ ] Add the verified public demo link to this document and the README.
- [ ] Capture final screenshots and label the data mode honestly.
- [ ] Check current official eligibility, deadline, submission fields and API requirements before submitting.

The **user-supplied hackathon brief** lists **31 October 2026 at 9:15 a.m. India time (GMT+5:30)** as the deadline, requires a working externally hosted application, a public code repository, a text description and an open-source license, and says a video is not required. These requirements and the deadline have not been independently verified in this document. The supplied brief lists a $15,000 first prize; no placing or award can be promised.

Public demo: pending. Public repository: [github.com/codewithanshuman/houselights](https://github.com/codewithanshuman/houselights). Live integration validation: pending. Real-booker outcome evidence: pending.
