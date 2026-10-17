# PartDrop integration audit — 17 October 2026

Source: user-supplied `D:\A - Download\partdrop-main.zip`.
SHA-256: `8673638A20E184C8C9274CCB077403A5306FE587E25ED1F83F4B963E7865EC99`.

Inspected the archive README, license, quote agent, order/ledger lifecycle, inspection gate and resource scheduler. The archive was read as reference data; its scripts, credentials, example certificates, recordings and installation instructions were not executed.

## Applied to Houselights

| PartDrop source | Original behavior | Houselights implementation |
| --- | --- | --- |
| `server/src/store.ts`, `nextSlot` | Find the first available machine interval | Adapted in `server/resource-schedule.mjs`; conflicting event-room reservations receive an explicit suggested gap. It never moves an event or asserts new availability automatically. |
| `server/src/quote.ts` | Model selects a server-calculated estimate; it cannot write the price | Portfolio calculations use the existing exact slate evaluator and server-held snapshots. Client-supplied scores and candidate pools do not enter the optimizer. |
| `server/src/inspect.ts` | Deterministic inspection and model observation must agree; disagreements hold | Portfolio readiness separately checks exact joint feasibility and selected rank provenance. Missing, ambiguous or synthetic evidence prevents a live-evidence readiness claim. The final status authorizes organizer review only. |
| `server/src/orders.ts` | Evidence accompanies every money-state transition | Portfolio output contains a cent-reconciled planned cash timeline, source fingerprints and immutable recovery scenarios. Entries are explicitly `planned_not_paid`. The existing Decision Room still records organizer approval transitions. |

Only the resource gap algorithm is a code adaptation. The other rows are independently implemented applications of the inspected engineering patterns. The MIT notice is preserved in `licenses/partdrop-MIT.txt`, including the source archive's original third-party notes. No manufacturing, CAD, medical, PayPal, trial-licensed Gantt, or fabricated payment integration was imported. PartDrop's reported live inspection outcomes were not reproduced and are not Houselights validation.

## Portfolio contract

Open **Event portfolio**. Supply 2–6 events with saved source IDs, explicitly zoned start/end times, shared venue/resource labels, fixed costs, deposit percentages/dates and priority weights. All sources must use the same currency. Individual slate constraints remain unchanged. Dates and availability are organizer declarations, not fresh research.

The solver enumerates feasible slates for each event using the existing evaluator, then searches their joint combinations with cost and objective bounds. Hard rules include total budget, maximum artist bookings, minimum rest between appearances, non-overlapping shared resources, and optional cumulative cash checkpoints. It retains unrounded objective components and uses fee/ID tie-breaks. Priority weights aggregate policy utility; they do not turn ordinal affinities from different markets into a calibrated demand forecast.

The default search ceiling is 250,000 visited nodes or examined extensions, whichever is reached first. Counting rejected extensions also bounds work on heavily conflicting inputs. `optimal` and `certifiedOptimal: true` are returned only when the search completes with a feasible result. At the ceiling, the result is `search_limit`, even when an incumbent exists. A root relaxation upper bound is supplied; no false optimality certificate is issued. A completed search with no joint solution is `infeasible`. Resource conflicts include suggested free slots from the PartDrop adaptation, with a warning to recheck artist and room availability.

Cash calculations round artist fees to cents, then split the total fee into deposit and remaining balance without losing a cent. Fixed costs are due at event start. A cash checkpoint caps cumulative gross outflows through that timestamp. No ticket sales, refunds, credit or cancellation charges are inferred.

Cancellation rehearsal forks the saved portfolio, excludes the selected canceled artist for the chosen event, and locks all surviving selections across every event. It reruns the same shared constraints. The original portfolio and all source snapshots remain unchanged. This is replacement planning, not a claim that a canceled fee is refundable.

API: `POST /api/portfolios`, `GET /api/portfolios/:id`, `POST /api/portfolios/:id/recover`. All writes require organizer access in protected mode and share a persistent computation quota. Sources are retained. JSON exports include inputs, digests, search diagnostics, selections, readiness and the cash timeline.
