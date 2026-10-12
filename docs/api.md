# Operational API

All routes use a saved run ID from the `saved` server-sent event produced by `POST /api/memo`. Saved-run and pipeline endpoints are bearer resources: possession of an ID grants access to its planning data. Responses use JSON except the iCalendar text embedded in a booking-packet response.

## Decision dossier

```http
GET /api/dossier/:savedRunId
```

Returns the optimizer decision, selected-artist evidence coverage, planning-relationship matrix, city-scoped evidence status, contingency summary, risks, opportunities, receipt index and a Markdown rendering.

```http
POST /api/dossier/:savedRunId/ask
Content-Type: application/json

{ "question": "Which cancellation has no fallback?" }
```

Supported topics are selected artists, budget and fees, risks, cancellation resilience, geographic evidence and receipts. The result contains `grounding: "saved_dossier_only"`, supporting `facts` and any relevant `receiptIds`. Unsupported questions return a boundary response rather than a generated guess.

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
| `approve_pitch` | `artistId` | `research_complete` → `pitch_approved` |
| `send_outreach` | `artistId` | `pitch_approved` → `sent`; schedules Day 3/7/14 follow-ups |
| `complete_follow_up` | `artistId`, `day` (`3`, `7` or `14`) | Marks one scheduled follow-up complete |
| `record_response` | `artistId`, `responseType` | Records `accepted`, `negotiating`, `objection`, `declined`, `information` or `no_response` |
| `update_logistics` | `artistId`, `checklist` | Updates allowlisted checklist booleans and derives the secured/logistics/show stage |
| `add_note` | `artistId`, `note` | Adds a server-timestamped planning note |

An accepted response may include `agreedRate`. An objection may include `objection` and any response may include a bounded `note`. A real response cancels pending follow-ups. Pipeline analytics are recomputed after every accepted event.

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
