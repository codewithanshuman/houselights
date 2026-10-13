# Operational API

All routes use a saved run ID from the `saved` server-sent event produced by `POST /api/memo`. Saved-run and pipeline endpoints are bearer resources: possession of an ID grants access to its planning data. Responses use JSON except the iCalendar text embedded in a booking-packet response.

## Decision dossier

```http
GET /api/dossier/:savedRunId
```

Returns the optimizer decision, selected-artist evidence coverage, planning-relationship matrix, city-scoped evidence status, contingency summary, risks, opportunities, receipt index and a Markdown rendering.

```http
GET /api/dossier/:savedRunId/report
```

Returns the same supported decision record as a standalone escaped HTML document with print styling and an attachment filename. When the run contains multi-market intelligence, the report includes requested-market scores and the exact route.

```http
POST /api/dossier/:savedRunId/ask
Content-Type: application/json

{ "question": "Which cancellation has no fallback?" }
```

Supported topics are selected artists, budget and fees, risks, cancellation resilience, geographic evidence and receipts. The result contains `grounding: "saved_dossier_only"`, supporting `facts` and any relevant `receiptIds`. Unsupported questions return a boundary response rather than a generated guess.

## Multi-market cultural intelligence

```http
POST /api/intelligence/:savedRunId
Content-Type: application/json

{
  "origin": { "name": "London", "lat": 51.5074, "lon": -0.1278 },
  "markets": [
    { "name": "London", "lat": 51.5074, "lon": -0.1278 },
    { "name": "Paris", "lat": 48.8566, "lon": 2.3522 },
    { "name": "Berlin", "lat": 52.52, "lon": 13.405 }
  ],
  "stopCount": 2,
  "startDate": "2026-11-20",
  "includeAudienceProfile": true,
  "profileTargets": ["brand", "movie", "podcast"]
}
```

The request accepts two to eight uniquely named candidate markets. Coordinates and the start date are explicit routing inputs supplied by the caller; they are not Qloo observations. `stopCount` is an integer from two to eight and cannot exceed the market count; the default remains at most five.

For each selected artist in each requested market, the server records one `where_popular` receipt. It compares every selected-artist pair with `compare_audiences`, then requests cultural place candidates in every chosen stop. The market policy score is `70 × mean observed affinity + 30 × evidence coverage`; missing affinity lowers coverage and is never replaced with a guessed value. Shared comparison labels are reported as cultural themes, not unique-audience overlap or cannibalization.

The route engine searches every ordered route of the requested length. It rejects routes whose selected markets are less than 150 km apart or whose legs exceed 1,800 km, maximizes total market policy score, and uses total distance then market names as deterministic tie-breakers. Travel days use a declared 700 km-per-day rule. The response reports the number of routes checked and rejected, every scheduled leg, a chart-ready market/artist matrix, venue leads and all supporting receipt IDs.

Audience profiling is enabled by default. It adds one group `entity_tags` workflow, one `audience_demographics` workflow per selected artist and one `recommend` workflow per requested cross-domain target. Supported targets are `book`, `brand`, `movie`, `podcast`, `tv_show` and `videogame`, with at most five in one run. The default targets are brand, movie and podcast. Set `includeAudienceProfile` to `false` to omit this module and its calls. Returned labels are aggregate activation context; they do not identify people, establish protected traits or predict attendance or conversion.

The route stores a new immutable child snapshot and returns its ID. The source snapshot is unchanged. Before calling Qloo, the server counts `markets × selected artists + selected-artist pairs + route stops`, plus the enabled profile calls described above. An analysis is rejected when that count exceeds `INTELLIGENCE_CALL_BUDGET`, capped at 60. The endpoint also allows three runs per IP per minute and 50 per process-day. These process-local controls are quota safeguards rather than authentication.

## Venue qualification and route economics

```http
POST /api/venues/:savedIntelligenceRunId/qualify
Content-Type: application/json

{
  "expectedCrowd": 400,
  "ticketPrice": 45,
  "variableCostPerAttendee": 5,
  "travelCostPerKm": 0.5,
  "artistFeeMode": "whole_route",
  "qualifications": [{
    "market": "Paris",
    "venueId": "qloo-place-id-from-intelligence",
    "capacity": 500,
    "capacitySource": "Venue technical sheet, checked 2026-10-12",
    "available": true,
    "venueCost": 1000,
    "otherFixedCost": 250
  }]
}
```

Every qualification must refer to a Qloo place candidate stored in the intelligence snapshot, and each capacity needs an explicit caller-provided source. Qloo remains the cultural discovery source; capacity, availability and commercial facts remain caller-supplied. The engine will not attach facts to an unknown place ID.

A room is in-band when its sourced capacity is from 60% to 250% of the entered expected crowd. The engine prefers available in-band rooms, then the closest capacity ratio, lower venue cost and stable name order. If no in-band room is available, it labels the closest sourced option `fallback_out_of_band`; if no candidate is qualified, the stop remains `needs_verified_venue`.

`artistFeeMode` is required because an entered artist fee may mean a per-show guarantee or one whole-route amount. `per_stop` repeats the selected-slate fee total at every stop. `whole_route` allocates it across stops and assigns any rounding remainder to the final stop so totals reconcile to the cent. Break-even divides declared fixed costs by ticket price minus per-attendee cost and rounds up to a whole ticket. The 50%, 70%, 90% and 100% attendance rows are arithmetic scenarios, capped by sourced capacity; they are not forecasts.

The result saves another child snapshot and becomes part of its campaign report, dossier JSON and printable HTML. Venue-plan saves are limited to twelve per IP per minute and 200 per process-day.

## Booking packet

```http
POST /api/packet/:savedRunId
Content-Type: application/json

{
  "event": {
    "name": "Autumn Room",
    "date": "2026-11-20",
    "city": "London",
    "venue": "Venue TBC",
    "contactName": "Talent buyer",
    "contactEmail": "buyer@example.com",
    "holdDeadline": "2026-10-20",
    "contractDeadline": "2026-10-30",
    "announcementDate": "2026-11-01",
    "notes": "Internal planning note"
  }
}
```

`date` is required and must be a real `YYYY-MM-DD` date. Milestones are optional and use the same format. The response contains one unsent evidence-bound hold draft per selected artist, an initial logistics checklist and `calendarIcs`. No communication is transmitted by this route.

For a saved feasible route, `GET /api/tour-calendar/:savedRunId` downloads an RFC 5545 calendar containing every routed show, transfer and rule-inserted day off. Qualified venue names are included where available. Great-circle distance is explicitly labeled as planning distance.

## Booking pipeline

```http
GET /api/pipeline/:savedRunId
```

Creates the pipeline on first access and returns it thereafter. Every deal begins at `research_complete`. State changes use the event route:

```http
POST /api/pipeline/:savedRunId/events
Content-Type: application/json

{
  "type": "approve_pitch",
  "artistId": "provider-artist-id",
  "expectedRevision": 0
}
```

`expectedRevision` is optional. When supplied, a stale value rejects the write instead of overwriting a newer event.

| Event type | Required fields | Valid effect |
|---|---|---|
| `approve_pitch` | `artistId`; optional `pitchAngle`, `venueSegment`, `draft` | `research_complete` → `pitch_approved` and stores the approved strategy |
| `send_outreach` | `artistId`; optional `channel`, `recipient`, `externalMessageId` | `pitch_approved` → `sent`; records external-send metadata and schedules Day 3/7/14 follow-ups |
| `complete_follow_up` | `artistId`, `day` (`3`, `7` or `14`) | Marks one scheduled follow-up complete |
| `record_response` | `artistId`, `responseType` | Records `accepted`, `negotiating`, `objection`, `declined`, `information` or `no_response`; negotiating/objection responses may include `counterofferRate` |
| `record_counteroffer` | `artistId`, `direction`, `amount` | Appends a received or proposed counteroffer while the deal is negotiating |
| `update_logistics` | `artistId`, `checklist` | Updates allowlisted checklist booleans and derives the secured/logistics/show stage |
| `add_note` | `artistId`, `note` | Adds a server-timestamped planning note |

An accepted response may include `agreedRate`. An objection may include `objection`, `objectionCategory` and `counterofferRate`; any response may include a bounded `note`. A real response cancels pending follow-ups. Pipeline analytics are recomputed after every accepted event, including descriptive outcome rows by approved pitch angle and venue segment.

The logistics checklist accepts only:

- `dateConfirmed`
- `rateConfirmed`
- `contactConfirmed`
- `setLengthConfirmed`
- `loadInConfirmed`
- `paymentConfirmed`
- `promoAssetsSent`
- `contractInvoiceSent`

The first three move a secured deal to `logistics_pending`. The first six move it to `show_scheduled`; promotional assets and contract/invoice completion remain separately visible.

## Campaign controller

```http
GET /api/campaign/:savedRunId
```

Returns a deterministic four-stage control report over the saved evidence and current persistent pipeline:

- `research` orders artists by missing evidence and includes the linked market/route brief when available.
- When present, `research.audienceActivation` exposes receipt-linked tags, demographic labels and cross-domain names for human review before campaign language is approved.
- `pitching` counts approved, waiting and sent deals while retaining the human-approval gate.
- `analytics` exposes recorded response, acceptance, objection, fee and next-action metrics.
- `followup` combines Day 3/7/14 due work with an artist-specific maximum rate that keeps the current slate inside its declared budget.

Every deal also includes its current stage, next action, evidence gaps, negotiation headroom, checklist and the exact contingency replacement produced when that artist is canceled and all other selected artists stay fixed. A ceiling is a budget-preservation calculation, not an estimate of artist market value. This route derives a report; it does not send outreach, accept an offer or book a venue.

## Local activation

```http
POST /api/activation/:savedIntelligenceRunId
Content-Type: application/json

{
  "headlinerId": "selected-provider-id",
  "marketNames": ["London", "Paris"],
  "maxOpeners": 3,
  "posterTags": ["record store", "bookshop", "cafe"],
  "aftershowTags": ["bar"]
}
```

This route requires a feasible saved intelligence route. It runs a market-local headliner heatmap, discovers possible support artists, checks shared aggregate themes, and searches tagged poster and aftershow place leads. Same-entity and name-overlap acts are excluded. The smaller-act rule passes only when both headliner and candidate have returned popularity values and the candidate is lower; missing values yield `size_evidence_required`.

The response stores a linked child snapshot under `localActivation`. Its 2.5 km checks run only when both hotspot and place coordinates exist. `coordinates_unavailable` never counts as nearby. All Qloo calls receive collision-free `l…` receipt IDs even when activation is rerun from an earlier activation child.
