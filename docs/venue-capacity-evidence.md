# Venue capacity evidence from Routed

Re-inspected on 14 October 2026: `D:\A - Download\routed-main.zip`, SHA-256 `FB65AA28A12EC4BA045BABAE8349DE2FDC7C90EA4A834968EDC516F814A68A0B`.

The original `lib/agent/capacity.ts` is preserved in `server/routed/capacity.mjs` with TypeScript types removed and its MIT license retained. The original parser recognizes multilingual capacity phrases, grouped numbers, venue names and some side-room/future-building exclusions. Its actual numeric bound is 50–120,000; the source comment saying 25,000 is stale and retained as part of the port. The original majority/tie-break picker remains available, but Houselights does not use it to resolve conflicting claims automatically.

## Review and qualify

Start with a saved feasible route containing Qloo venue leads. Submit organizer-supplied source text with its declared source URL:

```json
{
  "venues": [{
    "market": "London",
    "venueId": "<saved-Qloo-venue-id>",
    "pages": [{
      "url": "https://venue.example/technical",
      "text": "Aurora Hall seated capacity 500. Standing capacity 800."
    }]
  }]
}
```

This is an illustrative fixture, not a verified venue fact. Use `npm run venues -- capacity-review <route-id> review.json`, or `POST /api/venues/:id/capacity-review`. Set `HOUSELIGHTS_URL` to the running server (for example `http://127.0.0.1:8082`). The CLI reads `ORGANIZER_TOKEN` when configured. The response supplies the new saved child ID.

Review records retain each distinct capacity, supporting quote, declared URL, content SHA-256 and document ID. Repeating a value on one page counts once. Duplicate URLs are rejected. Different URLs are counted as sources, not independent publishers. No matching claim is `unresolved`; exactly one value is `consistent`; multiple values are `conflict`, regardless of majority. Full input text is not retained. This operation never fetches a URL, and a hash identifies supplied text rather than proving its authenticity.

Qualify using that saved review:

```json
{
  "expectedCrowd": 400,
  "ticketPrice": 20,
  "artistFeeMode": "per_stop",
  "qualifications": [{
    "market": "London",
    "venueId": "<saved-Qloo-venue-id>",
    "useCapacityEvidence": true,
    "capacity": 500,
    "capacityDecisionReason": "Use the seated configuration for this event.",
    "available": true,
    "venueCost": 1000
  }]
}
```

Use `npm run venues -- qualify <review-child-id> qualification.json`, or `POST /api/venues/:id/qualify`. A conflict requires both a supported capacity value and a decision reason. A consistent review can supply its single value when capacity is omitted. The opt-in is explicit; manual capacity/source entry still works. Availability remains a separate organizer declaration and is never inferred from capacity text. The selected quote, alternatives and decision reason persist into venue economics and the dossier's JSON; Markdown and HTML include the source review. This is scenario arithmetic, not an attendance forecast or a confirmed booking.

Limits: 1–20 routed venues, 1–5 documents each, 25,000 characters/document and 100,000 total source-text characters/request, within the existing 160 KB HTTP body limit. HTTP(S) URLs only, without embedded credentials. Social sources and unrelated venue names are excluded. The source parser cannot establish all room configurations or sentence-level attribution; buyers still need to verify the appropriate event setup. Rerunning market/route research clears old capacity and qualification results. New capacity reviews and venue qualifications clear prior venue-linked local activation, while preserving the parent snapshot.

The feature is available through API/CLI and dossier exports. No venue evidence collection UI or autonomous web retrieval is claimed. Routed's full agent loop and streaming replay are not migrated by this change.
