# Devpost draft — Houselights

## Inspiration

Talent buyers often know the room they want to fill. They still have to turn audience taste, artist availability, fees and programming rules into one bill they can defend. A popular artist can be a poor fit for a particular market, and a strong recommendation can fall apart as soon as a quote rises or a headliner cancels. Houselights treats the whole booking decision as the unit of work.

## What it does

Houselights books the bill your city's fans will show up for. A promoter names a city, an artist their audience loves, a budget and the number of acts. Houselights asks Qloo's taste graph which artists those fans love in that city, ranks them for that audience, checks where the fans are, and then runs an exact optimizer over every possible bill to book the best one that fits the budget and rules. Every claim links to the saved Qloo response behind it, and one switch turns Qloo off to show what the same rules would book without it.

**Try it in two minutes** on the public Booking Desk (no sign-in):

1. **A saved live Qloo run:** New York, fans of Leon Bridges, $14,500, 2 acts. Houselights books Michael Kiwanuka + Sault for $13,500.
2. **Turn Qloo off:** the same optimizer, pool, fees and budget book Jordan Rakei + Hiatus Kaiyote for $9,000. Qloo changes this decision in <!--claim:featuredNoise-->200 of 200<!--/claim--> random ±20% fee variations.
3. **Change the plan:** cut the budget or drop a booked act, and the optimizer rebooks instantly with no new provider calls.
4. **Open a receipt:** the saved Qloo ranking behind each act, with its row highlighted.
5. **Plan your own show:** any city and artist. A live run makes up to 12 Qloo calls (usually under a minute) and returns a shareable plan. Qloo has no booking fees, so fees for new acts are estimates from Qloo popularity tiers, labelled everywhere.

Beyond that path:

- **Autopilot:** given a brief, Autopilot finds the open evidence questions whose answers could change the bill. It spends a bounded number of Qloo calls only on those, compares strategies under one common set of disruption scenarios, and writes an organizer-ready packet. The packet carries receipts, fee and availability status, break points and approval-tagged next steps.
- **Organizer workspace (private):** create an event, research it with Qloo, revise the brief and compare decisions across revisions. Research that loses Qloo calls, or gets only partial answers, is labelled partial, never complete.
- **Integrity:** every published record carries content digests and an independently pinned manifest. Records replay under the scoring version that produced them. Qloo responses are unsigned, so provider authenticity is stated as unverifiable.

## How we built it

- **Backend:** Node.js 24 with the official Qloo MCP harness. The agent plans bounded Qloo workflows, and each call leaves a receipt recording its query, status and evidence.
- **Optimizer:** an exact optimizer enumerates every feasible bill under the budget, slot, fee, availability, lock, exclusion, discovery and genre rules, and reports infeasibility explicitly. Cultural fit uses Qloo affinity scores on a fixed scale, so tiny gaps stay tiny. Pairs within 0.002 are flagged as near-ties and handed to the promoter.
- **Models and storage:** optional Groq model calls supply tool-free baseline controls. SQLite persists events, decisions, traces and quotas.
- **Hosting:** the public demo runs on an existing free Oracle ARM VM behind HTTPS. Each deployment is backed up and rehearsed for rollback.

## What we tested

All figures below are reproduced offline by the commands named in the [claims audit](claims-audit.md).

- **Qloo influence (matched):** withdrawing the saved Qloo evidence changes the decision in <!--claim:withdrawal-->7 of 9<!--/claim--> feasible briefs with a complete Qloo ranking. Berlin and São Paulo do not change. Mumbai, Paris and Sydney are excluded because Qloo did not rank every candidate there. Evidence influences the decision; ticket sales are not measured; fees are illustrative. Under ±20% fee noise, withdrawal changes the decision in <!--claim:noiseMean-->71%<!--/claim--> of draws, and robustly in only <!--claim:noiseRobust-->1 of 9<!--/claim--> briefs, so "7 of 9" is a point estimate at the published fees.
- **What the optimizer adds over booking Qloo's top acts:** we ran <!--claim:scenarios-->3,600<!--/claim--> seeded scenarios with varied fees, availability and budgets.
  - Where Qloo's top-k acts were bookable, the optimizer chose differently in <!--claim:rankDiffers-->11.7%<!--/claim--> of cases (<!--claim:rankDiffersCount-->177 of 1,517<!--/claim-->), all in the one brief with a near-tie at the selection boundary. Evidence influences the decision; ticket sales are not measured; fees are illustrative.
  - Its main contribution is constraint handling. In <!--claim:unbookable-->58%<!--/claim--> of scenarios the top-k could not be booked: it found the best bookable bill in 1,380 and reported that none exists in 703.
  - With the older ordinal fit it never differed (<!--claim:rankDiffersOrdinal-->0%<!--/claim-->). We report that too.
- **Constraint safety (by construction):** an exact optimizer cannot propose a bill that breaks a hard rule. For comparison, <!--claim:shockViolations-->3/231<!--/claim--> re-prompted LLM responses (<!--claim:shockRate-->1.3%<!--/claim-->) did so on comparable solvable shocks. That shows a design property, not better judgement.
- **Research policy (synthetic):** Autopilot 2.0 does **not** show a statistically meaningful advantage over a simpler fixed-order policy. We report that as a negative finding.
- **Software:**
  - <!--claim:unitTests-->454<!--/claim--> unit-test definitions and <!--claim:browserTests-->86<!--/claim--> Chromium scenarios (execution totals are reported separately): an independent optimizer reference check over 5,000 seeded constraint combinations, axe WCAG 2.1 AA checks on every page, and the judge subset in Chromium, Firefox and WebKit;
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
