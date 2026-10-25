# Houselights

**Constraint-correct, auditable booking decisions for live events, with Qloo receipts.** A promoter gives Houselights a brief: the city, the artists whose audience they want, candidate acts, fees, availability and booking rules. Houselights:

- uses Qloo audience affinity to rank the candidates;
- finds the best bill that satisfies every rule;
- links each conclusion to the saved Qloo response behind it.

**Try it:** [Booking Desk](https://houselights.80-225-218-239.sslip.io/judge.html) (no sign-in) · **Source:** MIT · **Built for** the Qloo Agentic Hackathon 2026

## The two-minute path

The Booking Desk opens straight into four steps:

1. **The brief.** New York: 2 slots for fans of Leon Bridges, a $14,500 artist budget and 8 candidates with illustrative fees.
2. **The bill.** Book Michael Kiwanuka + Sault for $13,500. Every booking rule passes. A Sault/Jordan Rakei near-tie (0.9580 vs 0.9579 Qloo affinity) is drawn and handed to the promoter: "coin flip, your call".
3. **Withdraw Qloo evidence.** One switch turns the saved Qloo evidence off. The same optimizer, candidates, fees and budget then book Jordan Rakei + Hiatus Kaiyote for $9,000: −$4,500, with the acts leaving and entering shown. There are zero provider calls.
4. **Check the receipt.** Open the saved Qloo rank response behind each act. You see the act's row highlighted, its digests, and whether it matches the independently pinned manifest.

The first screen is built from the published record at build time, so it renders even if the API is down.

## What is measured, and what is not

Every number below is generated from a results file in [`results/`](results/) and checked in CI (`npm run claims:check`).

| Finding | Limit |
|---|---|
| Withdrawing Qloo evidence changes the decision in <!--claim:withdrawal-->7 of 9<!--/claim--> briefs with a complete Qloo ranking ([evaluation](results/autopilot-evaluation.md)). | Evidence influences the decision; ticket sales are not measured; fees are illustrative. Under ±20% fee noise, withdrawal changes the decision in <!--claim:noiseMean-->71%<!--/claim--> of draws, and robustly in only <!--claim:noiseRobust-->1 of 9<!--/claim--> briefs ([sensitivity](results/sensitivity.md)). |
| Where Qloo's top-ranked acts are bookable, the optimizer still chooses differently in <!--claim:rankDiffers-->11.7%<!--/claim--> of <!--claim:scenarios-->3,600<!--/claim--> seeded scenarios (<!--claim:rankDiffersCount-->177 of 1,517<!--/claim-->). With the old ordinal fit the figure is <!--claim:rankDiffersOrdinal-->0%<!--/claim--> ([rank vs optimum](results/rank-vs-optimum.md)). | Evidence influences the decision; ticket sales are not measured; fees are illustrative. All the differences come from one near-tie brief. |
| In <!--claim:unbookable-->58%<!--/claim--> of those scenarios the top-ranked acts cannot be booked at all. The optimizer either finds the best bookable bill or says that none exists. | This is the main contribution: handling constraints, not re-ranking Qloo. |
| On comparable solvable shocks, <!--claim:shockViolations-->3/231<!--/claim--> re-prompted LLM responses (<!--claim:shockRate-->1.3%<!--/claim-->) broke a hard rule; Houselights broke none ([shocks](results/shocks.md)). | True by construction: an exact optimizer cannot break a hard rule. This is not evidence of better judgement. |
| No ticket sales, attendance or profit improvement. No blind reviews. No usability sessions. No real quotes. | None of this has been measured or collected. See the [claims audit](docs/claims-audit.md). |

## Reproduce

Requires Node.js 24 or newer.

```bash
npm ci
```

```bash
npm run verify:all
```

`verify:all` reruns every claim in the audit and prints a pass/fail table. Run it with no provider calls and no keys. The individual commands:

| Command | Reproduces |
|---|---|
| `npm test` | <!--claim:unitTests-->335<!--/claim--> unit tests, including a 5,000-case independent optimizer reference |
| `npm run test:browser` | <!--claim:browserTests-->44<!--/claim--> browser tests in Chromium. They include axe WCAG 2.1 AA checks on every page, and the judge path also runs in Firefox and WebKit. |
| `npm run evaluate:autopilot` | The evidence-withdrawal result |
| `node scripts/evaluate-rank-vs-optimum.mjs` | Optimizer vs Qloo's top-ranked acts |
| `node scripts/evaluate-sensitivity.mjs` | Fee-noise and near-tie band sweeps |
| `npm run reproduce:shocks` | The shock study |
| `npm run reproduce:autopilot` | Exact replay of every pinned recording |

To run the app locally with synthetic Qloo data:

```bash
npm run dev
```

## More

- [Documentation index](docs/README.md): architecture, Autopilot, deployment, security, every report.
- [Claims audit](docs/claims-audit.md) and the [corrections we made to our own claims](docs/competition-changelog.md).
- [Feature overview and configuration](docs/feature-overview.md): the full product description and every setting.
- License: [MIT](LICENSE); artwork provenance in [SOURCES](public/assets/SOURCES.md).
