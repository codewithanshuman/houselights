# Houselights

Current deployed commit and executed checks: [verified production release](docs/current-release.md). Historical validation logs retain their original checkpoint counts.

**Book the bill your city's fans will show up for.** A promoter names a city, an artist their audience loves, a budget and how many acts they need. Houselights:

- asks Qloo's taste graph which artists those fans love *in that city*, ranks them for that audience and checks where the fans are;
- runs an exact optimizer over every possible bill and books the best one that fits the budget and rules;
- links each claim to the saved Qloo response behind it, and lets you turn Qloo off to see what the same rules would book without it.

**Try it:** [Booking Desk](https://houselights.80-225-218-239.sslip.io/judge.html) (no sign-in) · **Source:** MIT · **Built for** the Qloo Agentic Hackathon 2026

## Try it in two minutes

1. **Open the Booking Desk.** It shows a saved live Qloo run: New York, fans of Leon Bridges, $14,500, 2 acts. Houselights books Michael Kiwanuka + Sault for $13,500.
2. **Turn Qloo off.** The same optimizer, candidates, fees and budget book Jordan Rakei + Hiatus Kaiyote for $9,000 instead. Qloo changes this decision in <!--claim:featuredNoise-->200 of 200<!--/claim--> random ±20% fee variations ([sensitivity](results/sensitivity.md)).
3. **Change the plan.** Cut the budget or drop a booked act; the optimizer rebooks instantly on the same saved evidence.
4. **See how solid it is.** Every plan reports how many of 500 random fee scenarios keep the same bill (estimated fees move across their Qloo popularity tier), a safer bill when one wins more often, the exact fee at which each booked act would flip it, and the budgets at which the bill changes. It also shows whether Qloo's affinities clearly separate each pick or leave it a coin flip, and which Qloo signal changes the decision on its own. A live plan also shows how the agent spent its Qloo calls: it checks the acts whose evidence could change the bill and skips those no result could change. All exact, from the same saved evidence.
5. **Open a receipt.** Each act links to the saved Qloo ranking with its row highlighted.
6. **Plan your own show.** Enter any city and up to three artists your audience loves. A live run makes up to 12 Qloo calls (usually under a minute) and returns a shareable plan. Qloo has no booking fees, so fees for new acts are estimates from Qloo popularity tiers, labelled as such.

The full lab with Autopilot, the original research timeline and the method comparisons is at [desk.html](https://houselights.80-225-218-239.sslip.io/desk.html).

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
| `npm test` | <!--claim:unitTests-->405<!--/claim--> unit-test definitions, including a 5,000-case independent optimizer reference. Executed totals are reported separately in release verification. |
| `npm run test:browser` | <!--claim:browserTests-->68<!--/claim--> defined Chromium scenarios. They include axe WCAG 2.1 AA checks on every page, and the judge subset also runs in Firefox and WebKit. |
| `npm run evaluate:autopilot` | The evidence-withdrawal result |
| `node scripts/evaluate-rank-vs-optimum.mjs` | Optimizer vs Qloo's top-ranked acts |
| `node scripts/evaluate-sensitivity.mjs` | Fee-noise and near-tie band sweeps |
| `npm run reproduce:shocks` | The shock study |
| `npm run reproduce:autopilot` | Exact replay of every pinned recording |

The visual tests compare against screenshots for each platform. Windows screenshots are made locally with `npx playwright test --project=chromium --grep @visual --update-snapshots`; the Linux ones are regenerated on GitHub by the [Linux visual baselines](.github/workflows/linux-baselines.yml) workflow whenever a change to the pages reaches `development`.

To run the app locally with synthetic Qloo data:

```bash
npm run dev
```

## More

- [Documentation index](docs/README.md): architecture, Autopilot, deployment, security, every report.
- [Claims audit](docs/claims-audit.md) and the [corrections we made to our own claims](docs/competition-changelog.md).
- [Feature overview and configuration](docs/feature-overview.md): the full product description and every setting.
- License: [MIT](LICENSE); artwork provenance in [SOURCES](public/assets/SOURCES.md).
