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
| Routed | Evidence-only hold drafts, unsupported-number guard, operational calendar export | `server/operations.mjs`; `POST /api/packet/:id` | One venue event and its milestones rather than tour routing; no unsupported demand or venue-capacity claim |
| Scaena | Research → approval → outreach → response → negotiation → secured logistics; Day 3/7/14 follow-ups; outcome feedback | `server/pipeline.mjs`, `server/pipeline-store.mjs`; pipeline API | Original implementation because no project-level license was present; no email is sent and no response is fabricated |
| Alloy | Executive diligence modules, risk/opportunity register, report-aware analyst | `server/dossier.mjs`; dossier API and CLI | Deterministic saved-evidence answers; no invented “cultural compatibility score” and no live-web claims |
| GeoTaste | Geographic comparison as a decision input | `marketEvidence` in the dossier | Only observed city-scoped Qloo evidence status and receipt IDs; simulated coordinates, ratings, trends and seasonality were rejected |

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

### Decision dossier

- Restores candidates, ranks, claims and receipts from the saved source run.
- Includes the optimizer decision, evidence coverage, pairwise planning matrix, geographic evidence status, contingency resilience, risk register, opportunity register and compact receipt index.
- Labels buyer-entered genre comparisons as planning relationships rather than Qloo compatibility.
- Answers questions only from supported dossier fields and returns receipt IDs when available.
- Refuses unsupported topics such as ticket-sales prediction.

## Licensing

The Routed-derived approach is credited in [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md). No source was copied from the unlicensed Scaena or GeoTaste archives.
