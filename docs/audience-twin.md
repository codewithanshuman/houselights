# Audience Twin: a scenario simulator, not a customer model

Audience Twin is the organizer-only simulation inside Demand Lab. It uses **the same artist pool, city and Qloo `rank` endpoint** for each organizer-defined taste seed. Every returned rank must be complete and receipt-backed before a twin is saved. Each rank is converted into a 0–1 **relative position within that fixed pool**, never an affinity percentage, fan count or purchase probability. Changing the artist pool or city requires new Qloo research. A Qloo failure or partial ranking produces `insufficient_qloo_evidence`, not filled-in scores.

Organizers enter 2–5 taste-seed hypotheses with 1–3 artist IDs from a saved Qloo source each. They also enter weights summing to one, an assumed reachable audience pool, base ticket-purchase intent, price elasticity, competition loss and fan-overlap strength. These are **explicit scenario assumptions**. No real customer profile or personal data is generated. Qloo does not provide segment sizes, intent, elasticity or measured buyer overlap. Qloo can omit an artist ranked against itself; any seed artist also entered as a lineup candidate is explicitly excluded from the fixed ranked pool and twin-driven lineup choices. At least two non-seed candidates and enough acts to fill the slots must remain.

## What each engine does

1. **Segmentation:** Complete-link clustering groups taste seeds whose fixed-pool Qloo rank vectors have root-mean-square distance at most 0.18. If all seeds have similar ranks, one cluster is the honest result. Cluster weights and assumptions are weighted averages of their input seeds.
2. **Synthetic profiles:** A cluster is one weighted synthetic scenario profile. Its weight comes from the organizer, not Qloo demographics. The `synthetic` flag identifies a mock source; live Qloo receipts remain inspectable in a private saved twin.
3. **Artist matching:** Each profile retains its Qloo rank vector, per-artist relative utility, receipt IDs and organizer-defined price/intent settings.
4. **Overlap:** The model transforms relative ranks onto an illustrative 20–80% artist-response scale. A within-profile union avoids adding the same hypothetical buyer twice. `overlapAssumption=0` uses an independent-appeal union; `1` uses only the strongest artist. This is sensitivity, not observed fanbase overlap. Organizer-supplied aggregate buyer-overlap observations remain a separate evidence type in Demand Lab.
5. **Synergy:** `incrementalCoverage` is the scenario difference between the lineup and its strongest single artist under the overlap assumption. It is not net-new unique buyers.
6. **Price response:** Each profile applies its buyer-entered elasticity to 80%, 90%, 100%, 110% and 120% of the brief price. This is not a causal elasticity estimate.
7. **Migration:** Comparing a selected slate with another and adding competing events recomputes each profile. The result is a change in scenario interest, not tracked individual migration.
8. **UI:** Demand Lab shows segment weights, rank receipts, lineup coverage, price curves, sensitivity ranges and an alternative-slate/competition comparison.
9. **Optimization:** Exact feasible slates can be ranked by **assumed scenario operating margin**. The result mode is `synthetic_audience_scenario`. A genuinely backtested paid-ticket forecast, if later available, retains precedence. Hard booking constraints are unchanged.
10. **Validation:** An immutable pre-event twin scenario is saved with the plan. After a sourced paid-ticket total is recorded, `/api/demand/twin-validation` reports event-total mean absolute error and how often outcomes fell inside its *assumption sensitivity* range. Synthetic Qloo fixtures and retrospectively assembled scenarios are excluded. The range has **no confidence or coverage claim**. Segment-level validation requires separately sourced segment observations and is currently unavailable.

The scenario calculation starts with `audiencePool × segmentWeight × baseIntent`. It multiplies a lineup coverage proxy, `(price / briefPrice) ^ priceElasticity`, and `max(0, 1 − competitionLoss × competingEvents)`, then caps the event total at venue capacity. The displayed lower/upper stress uses 25% lower/higher base intent plus maximal-overlap/independent-appeal bounds. Financial outputs are arithmetic on assumed paid tickets and organizer costs. These settings should be changed deliberately and compared; they are not trained from the supplied Pollstar records.

The 40 publisher-reported historical records contain paid tickets sold, but no pre-event segment ranks, audience-pool weights or timestamped price/competition inputs. Therefore **zero historical observations currently validate this twin**. The UI and endpoint say so. A score or range from Audience Twin must not be presented as a demand forecast or a measured market size.

## API and provenance

- `POST /api/demand/twins`: Submit the normal Demand Lab brief, candidates, constraints and source ID, plus `audiencePool`, `overlapAssumption` and `segmentSeeds`. This endpoint performs bounded Qloo research, caches through the shared quota system and saves a private immutable twin only if every rank completes.
- `GET /api/demand/twins/:id`: Organizer-only twin, assumptions and receipts.
- `POST /api/demand/plan` with `twinId`: Search the exact feasible lineup set using that twin. The source ID, city and candidate IDs/order must match the saved research.
- `POST /api/demand/twins/:id/compare`: Supply the same brief and pool, `originalIds`, `changedIds` and `competitionIncrease` from 0–10.
- `GET /api/demand/twin-validation`: Organizer-only matched-outcome count, event-total error and sensitivity-range hit rate. Zero matched outcomes is reported explicitly.

Example seed fields:

```json
{"label":"Indie-adjacent","anchorIds":["qloo-artist-id"],"weight":0.5,"baseIntent":0.4,"priceElasticity":-1.2,"competitionLoss":0.08}
```

The full request has 2–5 seeds whose weights sum to one, plus `audiencePool` and `overlapAssumption`. See [Demand Lab](demand-model.md) for the historical paid-ticket model. The two models answer different questions: Audience Twin explores *assumption sensitivity* now; the paid-ticket model will estimate outcomes only after prospective data passes the chronological backtest gates.
