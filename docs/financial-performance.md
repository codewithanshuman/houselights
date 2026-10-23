# Financial Risk Lab performance check

Run `npm run benchmark:financial` on Node 24 or newer. This executes complete synthetic financial decisions: exact shortlist, pilot and final Monte Carlo simulation, break-even calculations, five stress scenarios, and explanations. It prints elapsed time and result counts for a 5,000-capacity case at 10,000 and 100,000 draws, plus a 100,000-capacity case at 10,000 draws with no break-even point. Inputs are illustrative assumptions, not event forecasts.

On 2026-10-23, this Windows workspace using Node v24.21.0 produced these observed runs:

| Case | Exhaustive break-even, before | Bounded search, after | Finalists / simulated outcomes |
| --- | ---: | ---: | ---: |
| 5,000 capacity; 10,000 draws | 3,022 ms | 3,256 ms | 5 / 50,000 |
| 5,000 capacity; 100,000 draws | 6,631 ms | 7,443 ms | 5 / 500,000 |
| 100,000 capacity; 10,000 draws; no break-even | 13,800 ms | 3,994 ms | 6 / 60,000 |

These are single sequential process measurements, not a latency guarantee. A later standalone after-run measured 8,306 ms, 17,986 ms, and 4,996 ms for the same cases; timing on this machine varies substantially. An after-run executed concurrently with release rehearsal measured 5,611 ms, 12,963 ms, and 5,104 ms respectively. The no-break-even case is the targeted regression: its break-even results remain `null`, while the complete job avoids the exhaustive 100,000-volume scan. The restored accounting oracle tests 240 diverse tier, tax, and fee scenarios against exhaustive search, including non-monotone profit cases. The bounded search still checks each surviving candidate with the exact accounting ledger.
