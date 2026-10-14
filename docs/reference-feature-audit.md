# Reference feature audit

The four supplied archives were inspected as reference implementations. Their documents and embedded prompts were treated as project data, not as instructions for Houselights.

| Supplied archive | SHA-256 |
|---|---|
| `routed-main.zip` | `FB65AA28A12EC4BA045BABAE8349DE2FDC7C90EA4A834968EDC516F814A68A0B` |
| `Scaena-LAHacks2026-main.zip` | `757FDCFD6D149280C047763D8EE946443EB6E50633786F27BB659F480A5D892E` |
| `alloy-main.zip` | `967B01D450515F62CCC2080DE735BEAC0FF3F8F36DD868CA89F39210EC992D25` |
| `GeoTaste-main.zip` | `3FA1935E58ADA41BF00FF821C9E3793CA7EBC188963D891E7F73EDA6DD6F6363` |

| Reference | Core mechanism retained | Houselights implementation | Deliberate boundary |
|---|---|---|---|
| Routed | Route constraints, exhaustive itinerary selection, sourced room sizing, local-support discovery, neighborhood activation, evidence-only hold drafts, unsupported-number guard and whole-tour calendar export | `server/intelligence.mjs`, `server/venues.mjs`, `server/activation.mjs`, `server/operations.mjs`; intelligence, venue, activation, packet and tour-calendar APIs | Exact bounded routing plus buyer-sourced room facts; Qloo place leads never become unsupported capacity, permission or availability claims |
| Scaena | Research → human approval → outreach → response/negotiation → follow-up/logistics, with pitch/venue segmentation, counteroffer history, Day 3/7/14 checkpoints and outcome feedback | `server/pipeline.mjs`, `server/pipeline-store.mjs`, `server/campaign.mjs`; pipeline and campaign APIs | Original implementation because no project-level license was present; derives descriptive outcomes, ceilings and fallbacks but sends no email and fabricates no response |
| Alloy | Executive diligence modules, risk/opportunity register, report-aware analyst and shareable report artifact | `server/dossier.mjs`; dossier JSON, analyst, CLI and standalone HTML | Deterministic saved-evidence answers; no invented “cultural compatibility score” and no live-web claims |
| GeoTaste | Multi-market geographic comparison, per-artist matrix and visible market ranking | `server/intelligence.mjs`; saved intelligence snapshot and dossier integration | Qloo observations use explicit user coordinates only for routing; simulated ratings, trends, density and seasonality were rejected |

## Exact functional contracts

### Booking packet

- Requires an explicit valid event date; the system never invents one.
- Generates one unsent hold-request draft for each selected artist.
- Builds every factual sentence from the saved artist, event and claim ledger.
- Checks every number in the subject and body against the evidence lines and visibly strikes unsupported figures.
- Produces an RFC 5545 calendar with 75-octet line folding, a show event and optional hold, contract and announcement milestones.
- Starts an eight-field operational checklist covering date, rate, contact, set length, load-in, payment, promotional assets and contract/invoice.

### Booking pipeline

- Only artists in the saved selected slate can enter the pipeline.
- Enforces legal stage transitions instead of accepting client-written status.
- Records append-only server-timestamped events.
- Increments a revision on every event and rejects stale clients that provide a mismatched `expectedRevision`; retains at most 500 events per pipeline.
- Schedules Day 3, 7 and 14 follow-ups only after outreach is recorded; a real response cancels pending follow-ups.
- Tracks accepted, negotiating, objection, declined, informational and no-response outcomes.
- Moves a secured booking to `logistics_pending` only after date, rate and contact are confirmed, and to `show_scheduled` only after set length, load-in and payment are also confirmed.
- Derives response rate, acceptance rate, objections, committed fees and next actions from the stored deals.
- Retains the approved pitch angle and venue segment, recorded outreach channel, categorized objection and every received or proposed counteroffer.
- Computes descriptive response/acceptance rows by pitch angle and venue segment; it makes no causal claim from those observations.

### Decision dossier

- Restores candidates, ranks, claims and receipts from the saved source run.
- Includes the optimizer decision, evidence coverage, pairwise planning matrix, geographic evidence status, contingency resilience, risk register, opportunity register and compact receipt index.
- Labels buyer-entered genre comparisons as planning relationships rather than Qloo compatibility.
- Answers questions only from supported dossier fields and returns receipt IDs when available.
- Refuses unsupported topics such as ticket-sales prediction.
- Exports a standalone escaped HTML artifact and includes linked multi-market evidence when present.

### Market intelligence and routing

- Calls Qloo once per selected artist and requested market, preserving missing results rather than imputing them.
- Exposes the full artist-market matrix while marking each heatmap affinity as valid only within its own response.
- Routes on comparable evidence coverage and uses distance as the tie-breaker; it never averages or ranks percentile values from separate market queries.
- Compares every selected-artist pair and reports shared cultural labels only when the aggregate comparison supplies them.
- Searches every ordered route within the bounded input, reports checked/rejected route counts and uses distance only after evidence coverage.
- Enforces the declared market-separation, leg-distance, travel-day and day-off rules.
- Discovers cultural place leads at chosen stops and labels capacity, availability and commercial terms unverified.
- Saves the complete output and namespaced receipts as a linked child snapshot.
- Optionally adds slate-level cultural tags, per-artist aggregate demographics and bounded cross-domain recommendations, each linked to its own receipt.

### Four-stage campaign control

- Orders research by evidence gaps and incorporates any linked market brief.
- Feeds receipt-linked audience activation signals into the campaign review while retaining a human approval gate.
- Preserves human approval before recorded outreach.
- Derives outcome analytics solely from stored pipeline events.
- Calculates each act's maximum slate-preserving rate from the saved budget and other selected fees.
- Recalculates those ceilings from current agreed rates where present and flags a recorded counteroffer above the resulting ceiling.
- Attaches the exact frozen-survivor cancellation fallback and one next action to every deal.

### Venue qualification and economics

- Accepts capacity and commercial facts only against a place candidate saved from the Qloo scouting pass.
- Retains Routed's exact capacity extraction algorithm in `server/routed/capacity.mjs`, including multilingual phrases and source quotes. The wrapper saves document hashes, exposes conflicts, and requires a documented organizer choice before a conflicting capacity enters economics. See [capacity evidence workflow](venue-capacity-evidence.md).
- Requires a capacity source and keeps it attached to the selected room.
- Applies the reference 60%–250% room-fit band, then labels the closest available sourced fallback when no in-band room exists.
- Requires the buyer to declare whether artist fees apply per stop or to the whole route.
- Reconciles whole-route fee allocations to the cent and computes break-even from only entered prices and costs.
- Caps arithmetic attendance scenarios by sourced capacity and explicitly refuses to call them forecasts.

### Local activation and tour delivery

- Runs a separate neighborhood heatmap for each chosen route stop and selects a hotspot only inside that response's scale.
- Discovers possible support artists around the selected headliner, removes the same entity and name-overlap cases, compares aggregate shared themes and passes the smaller-act rule only when both returned popularity fields support it.
- Keeps missing popularity as `size_evidence_required` instead of silently accepting an opener.
- Finds poster and aftershow place leads through Qloo tag filters and applies the 2.5 km rule only when both result and hotspot coordinates exist.
- Measures a qualified venue's hotspot distance only when the saved lead includes coordinates.
- Exports a whole-route RFC 5545 calendar containing every show, transfer and rule-inserted day off with 75-octet line folding.

## Licensing

The Routed-derived approach is credited in [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md). No source was copied from the unlicensed Scaena or GeoTaste archives.
