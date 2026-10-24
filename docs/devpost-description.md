# Devpost draft — Houselights

## Inspiration

Talent buyers often know the room they want to fill. They still have to turn audience taste, artist availability, fees and programming rules into one lineup they can defend. A popular artist can be a poor fit for a particular market, and a strong recommendation can fall apart as soon as a quote rises or a headliner cancels. Houselights treats the whole booking decision as the unit of work.

## What it does

Houselights makes constraint-correct, auditable booking decisions with Qloo receipts. A promoter gives it a city, the artists whose audience they want, candidate acts, fees, availability and booking rules. It uses Qloo audience affinity to rank the candidates, finds the best lineup that satisfies every rule, and links each conclusion to the saved Qloo response behind it.

**The two-minute path.** The public Booking Desk (no sign-in) opens straight into it:

1. **The brief:** New York, 2 slots for listeners of Leon Bridges, a $14,500 artist budget and 8 candidates.
2. **The optimized slate:** Michael Kiwanuka + Sault ($13,500), with every booking rule passing, the near-tie flagged and the promoter's decision named.
3. **Withdraw Qloo evidence:** the same optimizer, pool, fees and budget now book Jordan Rakei + Hiatus Kaiyote ($9,000). The decision changes, with zero provider calls.
4. **Check the receipt:** open the saved Qloo rank response behind the change.

Beyond that path:

- **Autopilot:** given a brief, Autopilot finds the open evidence questions whose answers could change the bill. It spends a bounded number of Qloo calls only on those, compares strategies under one common set of disruption scenarios, and writes an organizer-ready packet. The packet carries receipts, fee and availability status, break points and approval-tagged next steps.
- **Organizer workspace (private):** create an event, research it with Qloo, revise the brief and compare decisions across revisions. Research that loses Qloo calls, or gets only partial answers, is labelled partial, never complete.
- **Integrity:** every published record carries content digests and an independently pinned manifest. Records replay under the scoring version that produced them. Qloo responses are unsigned, so provider authenticity is stated as unverifiable.

## How we built it

- **Backend:** Node.js 24 with the official Qloo MCP harness. The agent plans bounded Qloo workflows, and each call leaves a receipt recording its query, status and evidence.
- **Optimizer:** an exact optimizer enumerates every feasible lineup under the budget, slot, fee, availability, lock, exclusion, discovery and genre rules, and reports infeasibility explicitly. Cultural fit uses Qloo affinity scores on a fixed scale, so tiny gaps stay tiny. Pairs within 0.002 are flagged as near-ties and handed to the promoter.
- **Models and storage:** optional Groq model calls supply tool-free baseline controls. SQLite persists events, decisions, traces and quotas.
- **Hosting:** the public demo runs on an existing free Oracle ARM VM behind HTTPS. Each deployment is backed up and rehearsed for rollback.

## What we tested

All figures below are reproduced offline by the commands named in the [claims audit](claims-audit.md).

- **Qloo influence (matched):** among the 9 feasible briefs with a complete Qloo ranking, withdrawing the saved Qloo evidence changes the decision in 7. Berlin and São Paulo do not change. Mumbai, Paris and Sydney are excluded because Qloo did not rank every candidate there.
- **What the optimizer adds over booking Qloo's top acts:** we ran 3,600 seeded scenarios with varied fees, availability and budgets.
  - Where Qloo's top-k acts were bookable, the optimizer chose differently in 11.7% of cases, all in the one brief with a near-tie at the selection boundary.
  - Its main contribution is constraint handling. In 58% of scenarios the top-k could not be booked: it found the best bookable lineup in 1,380 and reported that none exists in 703.
  - With the older ordinal fit it never differed (0%). We report that too.
- **Constraint safety (by construction):** an exact optimizer cannot propose a lineup that breaks a hard rule. For comparison, 3 of 231 re-prompted LLM responses (1.3%) did so on comparable solvable shocks. That shows a design property, not better judgement.
- **Research policy (synthetic):** Autopilot 2.0 does **not** show a statistically meaningful advantage over a simpler fixed-order policy. We report that as a negative finding.
- **Software:**
  - 331 unit tests and 31 real-browser tests, including an independent reference check of the optimizer over 600 seeded constraint combinations;
  - a release rehearsal;
  - hosted verification of 83 public checks on the deployed commit.

None of this establishes better ticket sales, attendance or profit. No promoter has evaluated a packet yet.

## Challenges

- **Missing evidence stays missing.** Missing Qloo evidence must not become a guessed fit score.
- **Near-ties are disclosed.** A decision that rests on a near-tie has to say so. Our own recorded run does: Autopilot's research removed an evidence gap and left a 0.00014 affinity gap deciding the bill.
- **Corrections stay visible.** We corrected several of our own claims during the competition, including an inflated shock headline and a scoring scale that exaggerated small differences. The [changelog](competition-changelog.md) lists them all.

## What's next

- First-time usability sessions with five users and two working bookers. The protocol is ready; no session has run.
- Real quotes and availability.
- Prospective decisions paired with real ticketing outcomes.

## Links

- Public demo (Booking Desk): https://houselights.80-225-218-239.sslip.io/judge.html
- Source and setup: https://github.com/codewithanshuman/houselights
- License: MIT for project code. The provenance of the supplied artwork is documented separately.
