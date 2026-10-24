# On 77 solvable shocks, 3/231 re-prompted LLM responses (1.3%) violated a hard constraint; Houselights proposed 0. On 7 unsolvable shocks Houselights abstained and all 21/21 LLM responses violated, because the prompt required a lineup.

| Group | Shocks | LLM responses returned / requested | LLM violating responses | LLM violation rate | Houselights violations | Houselights abstentions |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Shocks with at least one feasible lineup | 77 | 231/231 | 3 | 1.3% | 0 | 0 |
| Shocks with no feasible lineup | 7 | 21/21 | 21 | 100.0% | 0 | 7 |
| Synthetic 12-candidate case, solvable shocks only | 22 | 66/66 | 1 | 1.5% | 0 | 0 |
| All comparable shocks, pooled | 84 | 252/252 | 24 | 9.5% | 0 | 7 |
| Briefs without a comparable Qloo ranking | 9 | 0/27 | 0 | — | 0 | 0 |

- **Like-for-like comparison:** solvable shocks only, 3/231 (1.3%).
- **Unsolvable shocks:** The LLM prompt required a lineup and offered no way to report infeasibility, so every returned lineup on these shocks violates a constraint by construction. These responses measure the prompt design, not model judgment, and are excluded from the like-for-like rate.
- **Pooled figure:** Pooled over solvable and unsolvable shocks. Not a like-for-like comparison; do not quote it without the split.
- **Not comparable (Mumbai: why a comparison is unavailable):** Qloo did not rank every candidate in these briefs, so no comparable fit exists and the LLM control was not run. They are excluded from every comparison above.

Deterministic single shocks across public real-data seeds and clearly labeled synthetic 10- and 12-candidate stress cases. Each shock targets the union of both original lineups. Houselights re-optimizes through judgeExperiment; the static LLM replays its saved first-trial lineup; the re-prompted LLM has three independent tool-free captures of the shocked brief. Failure rate counts responses that propose a hard-constraint violation, including invalid artist IDs; provider failures and missing responses are excluded and counted separately. Synthetic fit, fees, availability and artists are invented. Acts changed counts IDs in the symmetric difference from that arm’s original lineup. Abstention is not a feasible lineup.

Houselights has zero proposed-lineup violations by construction: its exact optimizer only returns lineups that satisfy its constraints. This is an engineering property, not independent evidence of better attendance, revenue, or cultural demand.

Across 93 deterministic shocks, Houselights returned 86 feasible slates and explicitly abstained on 7; it proposed 0 hard-constraint violations.
The static first-trial lineup was feasible on 37/93 shocks; it is a fixed-selection diagnostic.

| Case | Candidates | Shock | Houselights | Static LLM violation / overage | Re-prompted feasible / returned | Re-prompted failure rate | Re-prompted budget-overage spread | Selection spread |
| --- | ---: | --- | --- | --- | ---: | ---: | --- | --- |
| SYNTHETIC · 12 candidates / 5 slots **(synthetic)** | 12 | Budget 90% | feasible · 6 IDs changed | feasible / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 0–2 |
| SYNTHETIC · 12 candidates / 5 slots **(synthetic)** | 12 | Budget 80% | feasible · 6 IDs changed | budget / 500.00 | 3/3 | 0.0% | 0.00–0.00 | 2–2 |
| SYNTHETIC · 12 candidates / 5 slots **(synthetic)** | 12 | Budget 70% | abstained | budget / 2650.00 | 0/3 | 100.0% | 0.00–0.00 | 5–5 |
| SYNTHETIC · 12 candidates / 5 slots **(synthetic)** | 12 | Cancel Static Bloom | feasible · 2 IDs changed | locks, exclusions / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 6–6 |
| SYNTHETIC · 12 candidates / 5 slots **(synthetic)** | 12 | Raise Static Bloom fee 15% | feasible · 4 IDs changed | feasible / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 4–4 |
| SYNTHETIC · 12 candidates / 5 slots **(synthetic)** | 12 | Mark Static Bloom unavailable | feasible · 4 IDs changed | availability / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 2–2 |
| SYNTHETIC · 12 candidates / 5 slots **(synthetic)** | 12 | Cancel Tidal Letters | feasible · 2 IDs changed | locks, exclusions / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 6–6 |
| SYNTHETIC · 12 candidates / 5 slots **(synthetic)** | 12 | Raise Tidal Letters fee 15% | feasible · 4 IDs changed | feasible / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 4–4 |
| SYNTHETIC · 12 candidates / 5 slots **(synthetic)** | 12 | Mark Tidal Letters unavailable | feasible · 4 IDs changed | availability / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 2–4 |
| SYNTHETIC · 12 candidates / 5 slots **(synthetic)** | 12 | Cancel Sunroom Ensemble | feasible · 2 IDs changed | locks / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 2–2 |
| SYNTHETIC · 12 candidates / 5 slots **(synthetic)** | 12 | Raise Sunroom Ensemble fee 15% | feasible · 4 IDs changed | feasible / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 2–4 |
| SYNTHETIC · 12 candidates / 5 slots **(synthetic)** | 12 | Mark Sunroom Ensemble unavailable | feasible · 4 IDs changed | feasible / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 2–4 |
| SYNTHETIC · 12 candidates / 5 slots **(synthetic)** | 12 | Cancel Golden Thread | abstained | locks, exclusions / 0.00 | 0/3 | 100.0% | 0.00–0.00 | 5–5 |
| SYNTHETIC · 12 candidates / 5 slots **(synthetic)** | 12 | Raise Golden Thread fee 15% | feasible · 4 IDs changed | feasible / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 0–4 |
| SYNTHETIC · 12 candidates / 5 slots **(synthetic)** | 12 | Mark Golden Thread unavailable | feasible · 4 IDs changed | availability / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 2–4 |
| SYNTHETIC · 12 candidates / 5 slots **(synthetic)** | 12 | Cancel Signal Poet | feasible · 2 IDs changed | locks / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 2–2 |
| SYNTHETIC · 12 candidates / 5 slots **(synthetic)** | 12 | Raise Signal Poet fee 15% | feasible · 4 IDs changed | feasible / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 0–4 |
| SYNTHETIC · 12 candidates / 5 slots **(synthetic)** | 12 | Mark Signal Poet unavailable | feasible · 4 IDs changed | feasible / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 0–0 |
| SYNTHETIC · 12 candidates / 5 slots **(synthetic)** | 12 | Cancel Tin Roof Trio | feasible · 0 IDs changed | locks, exclusions / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 4–4 |
| SYNTHETIC · 12 candidates / 5 slots **(synthetic)** | 12 | Raise Tin Roof Trio fee 15% | feasible · 0 IDs changed | feasible / 0.00 | 2/3 | 33.3% | 0.00–0.00 | 0–4 |
| SYNTHETIC · 12 candidates / 5 slots **(synthetic)** | 12 | Mark Tin Roof Trio unavailable | feasible · 0 IDs changed | availability / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 4–6 |
| SYNTHETIC · 12 candidates / 5 slots **(synthetic)** | 12 | Cancel Copper Lines | feasible · 0 IDs changed | locks, exclusions / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 4–4 |
| SYNTHETIC · 12 candidates / 5 slots **(synthetic)** | 12 | Raise Copper Lines fee 15% | feasible · 0 IDs changed | feasible / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 2–4 |
| SYNTHETIC · 12 candidates / 5 slots **(synthetic)** | 12 | Mark Copper Lines unavailable | feasible · 0 IDs changed | availability / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 4–4 |
| SYNTHETIC · 10 candidates / 4 slots **(synthetic)** | 10 | Budget 90% | feasible · 4 IDs changed | feasible / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 0–0 |
| SYNTHETIC · 10 candidates / 4 slots **(synthetic)** | 10 | Budget 80% | abstained | budget / 500.00 | 0/3 | 100.0% | 0.00–0.00 | 4–4 |
| SYNTHETIC · 10 candidates / 4 slots **(synthetic)** | 10 | Budget 70% | abstained | budget / 2050.00 | 0/3 | 100.0% | 0.00–0.00 | 4–4 |
| SYNTHETIC · 10 candidates / 4 slots **(synthetic)** | 10 | Cancel Silver Current | feasible · 2 IDs changed | locks / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 4–4 |
| SYNTHETIC · 10 candidates / 4 slots **(synthetic)** | 10 | Raise Silver Current fee 15% | feasible · 4 IDs changed | feasible / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 0–2 |
| SYNTHETIC · 10 candidates / 4 slots **(synthetic)** | 10 | Mark Silver Current unavailable | feasible · 4 IDs changed | feasible / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 0–2 |
| SYNTHETIC · 10 candidates / 4 slots **(synthetic)** | 10 | Cancel Velvet Signals | feasible · 2 IDs changed | locks / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 4–4 |
| SYNTHETIC · 10 candidates / 4 slots **(synthetic)** | 10 | Raise Velvet Signals fee 15% | feasible · 4 IDs changed | feasible / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 0–4 |
| SYNTHETIC · 10 candidates / 4 slots **(synthetic)** | 10 | Mark Velvet Signals unavailable | feasible · 4 IDs changed | feasible / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 2–2 |
| SYNTHETIC · 10 candidates / 4 slots **(synthetic)** | 10 | Cancel Blue Hour Quartet | feasible · 2 IDs changed | locks / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 4–4 |
| SYNTHETIC · 10 candidates / 4 slots **(synthetic)** | 10 | Raise Blue Hour Quartet fee 15% | feasible · 4 IDs changed | feasible / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 0–0 |
| SYNTHETIC · 10 candidates / 4 slots **(synthetic)** | 10 | Mark Blue Hour Quartet unavailable | feasible · 4 IDs changed | feasible / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 0–0 |
| SYNTHETIC · 10 candidates / 4 slots **(synthetic)** | 10 | Cancel Pocket Rhythm | abstained | locks, exclusions / 0.00 | 0/3 | 100.0% | 0.00–0.00 | 4–4 |
| SYNTHETIC · 10 candidates / 4 slots **(synthetic)** | 10 | Raise Pocket Rhythm fee 15% | feasible · 6 IDs changed | feasible / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 0–4 |
| SYNTHETIC · 10 candidates / 4 slots **(synthetic)** | 10 | Mark Pocket Rhythm unavailable | feasible · 6 IDs changed | availability / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 4–4 |
| SYNTHETIC · 10 candidates / 4 slots **(synthetic)** | 10 | Cancel Orbit Keys | feasible · 0 IDs changed | locks, exclusions / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 6–6 |
| SYNTHETIC · 10 candidates / 4 slots **(synthetic)** | 10 | Raise Orbit Keys fee 15% | feasible · 0 IDs changed | feasible / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 4–4 |
| SYNTHETIC · 10 candidates / 4 slots **(synthetic)** | 10 | Mark Orbit Keys unavailable | feasible · 0 IDs changed | availability / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 2–4 |
| SYNTHETIC · 10 candidates / 4 slots **(synthetic)** | 10 | Cancel Amber Radio | feasible · 0 IDs changed | locks, exclusions / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 6–6 |
| SYNTHETIC · 10 candidates / 4 slots **(synthetic)** | 10 | Raise Amber Radio fee 15% | feasible · 0 IDs changed | feasible / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 0–4 |
| SYNTHETIC · 10 candidates / 4 slots **(synthetic)** | 10 | Mark Amber Radio unavailable | feasible · 0 IDs changed | availability / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 2–2 |
| SYNTHETIC · 10 candidates / 4 slots **(synthetic)** | 10 | Cancel Mosaic Brass | feasible · 0 IDs changed | locks, exclusions / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 6–6 |
| SYNTHETIC · 10 candidates / 4 slots **(synthetic)** | 10 | Raise Mosaic Brass fee 15% | feasible · 0 IDs changed | feasible / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 0–0 |
| SYNTHETIC · 10 candidates / 4 slots **(synthetic)** | 10 | Mark Mosaic Brass unavailable | feasible · 0 IDs changed | availability / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 4–6 |
| Manchester: compare all three methods | 5 | Budget 90% | feasible · 0 IDs changed | feasible / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 2–2 |
| Manchester: compare all three methods | 5 | Budget 80% | feasible · 0 IDs changed | feasible / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 0–2 |
| Manchester: compare all three methods | 5 | Budget 70% | abstained | budget / 400.00 | 0/3 | 100.0% | 0.00–0.00 | 2–2 |
| Manchester: compare all three methods | 5 | Cancel Nubya Garcia | feasible · 2 IDs changed | exclusions / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 2–2 |
| Manchester: compare all three methods | 5 | Raise Nubya Garcia fee 15% | feasible · 0 IDs changed | feasible / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 0–2 |
| Manchester: compare all three methods | 5 | Mark Nubya Garcia unavailable | feasible · 2 IDs changed | availability / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 2–4 |
| Manchester: compare all three methods | 5 | Cancel Alfa Mist | feasible · 2 IDs changed | exclusions / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 2–2 |
| Manchester: compare all three methods | 5 | Raise Alfa Mist fee 15% | feasible · 0 IDs changed | feasible / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 0–2 |
| Manchester: compare all three methods | 5 | Mark Alfa Mist unavailable | feasible · 2 IDs changed | availability / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 2–2 |
| Berlin: compare all three methods | 5 | Budget 90% | feasible · 0 IDs changed | budget / 1250.00 | 3/3 | 0.0% | 0.00–0.00 | 2–2 |
| Berlin: compare all three methods | 5 | Budget 80% | feasible · 0 IDs changed | budget / 2500.00 | 3/3 | 0.0% | 0.00–0.00 | 4–4 |
| Berlin: compare all three methods | 5 | Budget 70% | abstained | budget / 3750.00 | 0/3 | 100.0% | 0.00–0.00 | 2–2 |
| Berlin: compare all three methods | 5 | Cancel Jon Hopkins | feasible · 2 IDs changed | locks / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 2–4 |
| Berlin: compare all three methods | 5 | Raise Jon Hopkins fee 15% | feasible · 0 IDs changed | feasible / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 0–2 |
| Berlin: compare all three methods | 5 | Mark Jon Hopkins unavailable | feasible · 2 IDs changed | feasible / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 2–4 |
| Berlin: compare all three methods | 5 | Cancel Floating Points | feasible · 2 IDs changed | locks / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 2–2 |
| Berlin: compare all three methods | 5 | Raise Floating Points fee 15% | feasible · 0 IDs changed | feasible / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 0–0 |
| Berlin: compare all three methods | 5 | Mark Floating Points unavailable | feasible · 2 IDs changed | feasible / 0.00 | 2/3 | 33.3% | 0.00–0.00 | 0–2 |
| Berlin: compare all three methods | 5 | Cancel Moderat | feasible · 0 IDs changed | locks, exclusions / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 4–4 |
| Berlin: compare all three methods | 5 | Raise Moderat fee 15% | feasible · 0 IDs changed | budget / 975.00 | 3/3 | 0.0% | 0.00–0.00 | 4–4 |
| Berlin: compare all three methods | 5 | Mark Moderat unavailable | feasible · 0 IDs changed | availability / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 4–4 |
| Berlin: compare all three methods | 5 | Cancel Bicep | feasible · 0 IDs changed | locks, exclusions / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 4–4 |
| Berlin: compare all three methods | 5 | Raise Bicep fee 15% | feasible · 0 IDs changed | budget / 900.00 | 3/3 | 0.0% | 0.00–0.00 | 2–2 |
| Berlin: compare all three methods | 5 | Mark Bicep unavailable | feasible · 0 IDs changed | availability / 0.00 | 2/3 | 33.3% | 0.00–0.00 | 4–4 |
| New York: compare all three methods | 5 | Budget 90% | feasible · 2 IDs changed | feasible / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 0–2 |
| New York: compare all three methods | 5 | Budget 80% | feasible · 2 IDs changed | feasible / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 0–0 |
| New York: compare all three methods | 5 | Budget 70% | feasible · 2 IDs changed | feasible / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 0–2 |
| New York: compare all three methods | 5 | Cancel Michael Kiwanuka | feasible · 2 IDs changed | locks, exclusions / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 2–2 |
| New York: compare all three methods | 5 | Raise Michael Kiwanuka fee 15% | feasible · 0 IDs changed | feasible / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 0–2 |
| New York: compare all three methods | 5 | Mark Michael Kiwanuka unavailable | feasible · 2 IDs changed | availability / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 2–4 |
| New York: compare all three methods | 5 | Cancel Sault | feasible · 2 IDs changed | feasible / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 0–0 |
| New York: compare all three methods | 5 | Raise Sault fee 15% | feasible · 2 IDs changed | feasible / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 4–4 |
| New York: compare all three methods | 5 | Mark Sault unavailable | feasible · 2 IDs changed | feasible / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 0–4 |
| New York: compare all three methods | 5 | Cancel Jordan Rakei | feasible · 0 IDs changed | locks, exclusions / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 2–2 |
| New York: compare all three methods | 5 | Raise Jordan Rakei fee 15% | feasible · 0 IDs changed | feasible / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 0–2 |
| New York: compare all three methods | 5 | Mark Jordan Rakei unavailable | feasible · 0 IDs changed | availability / 0.00 | 3/3 | 0.0% | 0.00–0.00 | 2–2 |
| Mumbai: why a comparison is unavailable | 5 | Budget 90% | feasible · 0 IDs changed | unavailable / — | 0/0 | — | — | — |
| Mumbai: why a comparison is unavailable | 5 | Budget 80% | feasible · 0 IDs changed | unavailable / — | 0/0 | — | — | — |
| Mumbai: why a comparison is unavailable | 5 | Budget 70% | feasible · 0 IDs changed | unavailable / — | 0/0 | — | — | — |
| Mumbai: why a comparison is unavailable | 5 | Cancel The Local train | feasible · 2 IDs changed | unavailable / — | 0/0 | — | — | — |
| Mumbai: why a comparison is unavailable | 5 | Raise The Local train fee 15% | feasible · 2 IDs changed | unavailable / — | 0/0 | — | — | — |
| Mumbai: why a comparison is unavailable | 5 | Mark The Local train unavailable | feasible · 2 IDs changed | unavailable / — | 0/0 | — | — | — |
| Mumbai: why a comparison is unavailable | 5 | Cancel Ankur Tewari | feasible · 2 IDs changed | unavailable / — | 0/0 | — | — | — |
| Mumbai: why a comparison is unavailable | 5 | Raise Ankur Tewari fee 15% | feasible · 0 IDs changed | unavailable / — | 0/0 | — | — | — |
| Mumbai: why a comparison is unavailable | 5 | Mark Ankur Tewari unavailable | feasible · 2 IDs changed | unavailable / — | 0/0 | — | — | — |

See `results/shocks.json` for every trial, violation code, overage and exact fixture key. Provider failures and the non-comparable Mumbai case are reported as missing, never counted as successes. The static LLM arm is a fixed-selection stress test, not a new model run.
