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

Allow roughly five minutes. Open saved live-Qloo examples to avoid spending the entire presentation waiting for provider rate limits. Illustrative booking fees and availability must stay labeled.

1. **Decision and proof (60 seconds):** open `/judge.html` and use Manchester's saved live evidence. Set the budget to £4,500; the feasible alternative costs £4,400. Withdraw the linked ranking receipt and inspect the blocked evidence state. A withdrawal may change confidence without changing the selected artists; report what actually happens.
2. **Agent investigation (60 seconds):** replay an actual native-function investigation, such as saved result `QWgj_QrB6g`. Show the server-executed experiment and server-rendered facts. This run made three model calls and zero new Qloo queries; it did not select a final alternative for adoption. Other recorded runs may include rejected actions or provider waits.
3. **Commercial resilience (60 seconds):** apply simultaneous fee/attendance/availability shocks, then show the shared-budget portfolio and survivor-preserving cancellation recovery. Explain that margins use declared assumptions.
4. **Evidence and approval (60 seconds):** inspect one explicitly synthetic demonstration quote with exact source lines, review it, and show stale approval rejection when a term changes. No external message is sent.
5. **Independent validation and limits (60 seconds):** open Berlin's three-method judge case. The optimizer and cheapest feasible lineup both cost €10,000; the saved first-trial LLM selection costs €12,500. Lower the budget to €10,000 and inspect the original LLM selection's budget violation. This is a fixed selection replay, not another model execution or evidence of better commercial outcomes. Manchester shows agreement; Mumbai is explicitly non-comparable. Show retained attempts, including a rate-limit failure, and that zero ballots means zero independent evidence. Finish with a judge-case link and the specific planning question it answers.

## Evidence to collect before claiming impact

- Run real Qloo fixtures covering ordinary names, ambiguity, absent geographic data and unfamiliar trend payloads. Preserve sanitized examples and verify their adapters.
- Ask real venue bookers to assess anonymized, paired slates using the same candidate pool and booking terms. Record the number of participants, rubric, preferences and objections, including unfavorable results.
- Compare a Qloo-grounded slate with a constraint-only baseline and a tool-free LLM baseline under the same brief. Do not turn agreement metrics into a correctness claim.
- Document whether the app saves planning time or surfaces useful artists with actual observed results. Ticket-sales or revenue impact requires separate evidence and is not currently established.

## Must complete before submission

- [x] Run the application with the supplied live Qloo credential. See the dated [validation record](live-validation.md); no claim is made about who submitted the original key request.
- [ ] Calibrate adapters against real Qloo outputs; keep unknown measurements unknown until their semantics are established.
- [ ] Complete real-booker testing or explicitly disclose that impact validation remains pending.
- [ ] Publish a working external demo and verify it is accessible end-to-end without private access.
- [x] Publish the complete source repository and reproducible setup instructions.
- [ ] Confirm appropriate distribution rights for the supplied visuals; [artwork provenance](../public/assets/SOURCES.md) is included, but the MIT code license does not assert ownership of them.
- [x] Verify that the MIT `LICENSE` file is visible in the public repository and recognized in its About/license area.
- [ ] Add the verified public demo link to this document and the README.
- [ ] Capture final screenshots and label the data mode honestly.
- [x] Check current official deadline, submission fields and API requirements (19 October 2026).
- [ ] Confirm the entrant's eligibility and asset permissions against the official rules.

The [official challenge page](https://qloo.devpost.com/), checked on 19 October 2026, lists **30 October 2026 at 11:45 p.m. EDT**, equivalent to **31 October at 9:15 a.m. India time**, as the deadline. It requires a functional externally hosted demo, public source and setup instructions, a description and an open-source license. A video is optional. Local/private-only access does not satisfy the demo requirement. The [official rules](https://qloo.devpost.com/rules) also require entrant eligibility and permission for third-party material; those personal and artwork facts are still unconfirmed. No award or placing is promised.

Public demo: pending. Public repository: [github.com/codewithanshuman/houselights](https://github.com/codewithanshuman/houselights). Live Qloo and Groq integration validation: recorded in docs/live-validation.md. Real-booker outcome evidence: pending.

## Current evidence status — 19 October 2026

Earlier London/Berlin controls produced five feasible lineups and one retained rate-limit failure. The new four-market evaluation produced six feasible controls across Manchester, Berlin and New York; incomplete Mumbai rankings prevented a comparable control. Both failed and unattempted cases remain visible. The prepared blind study has no human ballots. Native tool investigation, joint stress analysis, source review, planning gates, portfolio recovery and backup/restore are described in [advanced workflows](advanced-workflows.md). Public hosting, an external walkthrough, artwork rights and personal eligibility remain unverified. This document makes no winning, demand, causal uplift or commercial-outcome claim.
