# Supplied archive gap audit

This is the file-level traceability record for the four user-supplied ZIP archives. Archive code and documents were inspected as reference data. Houselights reimplements compatible product mechanisms around its own saved-evidence model; it does not execute archive code or treat embedded prompts as instructions.

| Archive source inspected | Mechanism | Houselights status | Concrete implementation or reason omitted |
|---|---|---|---|
| Routed `lib/agent/cities.ts`, `lib/geo/markets.ts`, `lib/qloo.ts` | Heatmap tiles use one response scale; strongest tile maps to a touring market | Implemented with a stricter boundary | `server/intelligence.mjs` no longer compares affinity percentiles from separate city responses. `server/activation.mjs` chooses a hotspot only within one market response. Cross-market routing uses evidence coverage. |
| Routed `lib/agent/local.ts` | Neighborhood hotspot, poster shops/cafes and aftershow places within 2.5 km | Implemented | `POST /api/activation/:id` produces coordinate-gated poster and aftershow plans. Missing coordinates remain unknown. |
| Routed `lib/agent/audience.ts`, `lib/agent/rooms.ts` | Audience themes, opener discovery, smaller-than-headliner rule and room sizing | Implemented | Activation retains shared comparison themes and enforces the popularity rule only with comparable returned fields. `server/venues.mjs` applies the sourced 60%–250% room-fit band. |
| Routed `lib/agent/plan.ts`, `lib/geo/route.ts`, `lib/ics.ts` | Bounded exact route, travel/off scheduling and full-tour calendar | Implemented | `server/intelligence.mjs` enumerates every allowed ordered route; `GET /api/tour-calendar/:id` exports every show, transfer and inserted day off. |
| Routed `lib/agent/evidence.ts`, `lib/agent/pitch.ts` | Source-bound prose and unsupported-number rejection | Implemented | `server/operations.mjs` builds unsent drafts from the claim ledger and strikes unsupported numbers. |
| Scaena `agents/agent1_market_research.py`, `agent2_pitching.py` | Prospect research feeds a personalized pitch and records pitch strategy | Implemented within slate scope | Selected artists carry an approved pitch angle, venue segment and bounded draft before outreach can be recorded. Houselights does not import Scaena's fabricated fallback venues or follower-derived prices. |
| Scaena `agents/agent3_tracking.py` | Track replies and learn by venue type and pitch angle | Implemented descriptively | Pipeline analytics group actual recorded outreach, responses, acceptances and objections by pitch angle and venue segment. Feedback labels this as observed history, not causation. |
| Scaena `agents/agent4_followup.py` | Repeated follow-up, objection handling, negotiation and booking logistics | Implemented | Day 3/7/14 checkpoints, categorized objections, complete counteroffer history, budget ceilings and logistics gates are persisted. External email automation and unsupervised sending are deliberately absent. |
| Alloy `services/react_agent.py`, `services/report_generator.py`, `api/v1/reports.py` | Source events, report lifecycle, risk/opportunity sections and report-scoped follow-up | Implemented in the saved snapshot model | Receipts stream during memo creation; immutable snapshots contain dossier risks/opportunities, scoped analyst answers and standalone HTML. Houselights omits invented compatibility scores and ungrounded web synthesis. |
| GeoTaste `src/components/Map.jsx`, `VISUALIZATION_README.md` | City map, place analysis and geographic comparison | Core data model implemented | Intelligence stores explicit market coordinates, artist-market evidence, route stops and place leads. Simulated ratings, density, seasonality and trend claims were rejected because the supplied project did not ground them in source evidence. |

## Remaining gaps that require external facts

- Live calibration needs the event-issued Qloo credential. Synthetic fixtures exercise contracts but do not validate live response shapes or market conclusions.
- Place capacity, poster permission, opening hours, contact details, road mileage, availability and final terms need sourced buyer or venue input.
- Automated email sending remains outside the current product boundary; the pipeline records a send only after it occurred through an external channel.
- Real booking outcomes are required before pitch-angle or venue-segment history can support any decision beyond a descriptive review.

The exact archive hashes and licensing boundaries are recorded in [`reference-feature-audit.md`](reference-feature-audit.md) and [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md).
