# Organizer workspace

`/workspace.html` is a private workspace where a promoter plans a new event end to end. It requires the organizer token whenever the server is protected; local development without a token is open and clearly labelled. The public demonstration is a read-only recorded session at `/workspace.html#example`.

## Workflow

1. **Brief.** Enter:
   - event name, city (the Qloo market), venue, date, programming direction, target audience and objectives;
   - 1–3 audience reference artists (Qloo anchors, never booked);
   - artist budget, lineup size and maximum acts per genre;
   - 2–8 candidates. Each has a fee (or empty when unknown), a fee status (quoted / estimate), availability (confirmed / assumed / not confirmed / unavailable), a genre, and a lock or exclude flag;
   - optional commercial assumptions (capacity, ticket price, other costs), labelled unverified.

   Validation rejects missing fields, impossible dates, duplicate or anchor-as-candidate names, a fee status without an amount, locks without a fee and availability, and unknown fields.
2. **Qloo research.** The existing research agent runs once per research request, bounded to 24 workflow calls by default (`EVENT_RESEARCH_BUDGET`, at most 30). It resolves names, discovers related artists, ranks the pool against the references in the city, and checks local and audience evidence. Ambiguous names show Qloo's candidate matches. Choosing one saves a revision with that Qloo entity ID and marks the research stale.
3. **Decide.** Autopilot runs on any revision with 0 (plan from saved evidence), 4, 8 or 12 extra Qloo calls. Evidence a run gathers is merged into the event, so later revisions decide on everything learned. Receipt IDs are prefixed per run.
4. **Revise and compare.** Fee, availability, budget, lock and exclusion changes are saved as revisions and decided again on the same evidence, with no new research. Changing the city or references, adding a new artist, or changing a Qloo match requires research again; the workspace says which. Any two runs can be compared: brief changes, lineup change, fee and score deltas, plan continuity, and whether the runs used different amounts of evidence.
5. **Packet.** Export Markdown, print-ready HTML (strict CSP) or the full JSON run.

## Storage and access

Events live in the `organizer_events` SQLite table in `DATA_DIR`, with all revisions, the research snapshot and up to 20 decision runs. They never enter the public `snapshots` table, whose IDs are shareable bearer links. Every `/api/events` route, reads included, requires organizer access. Research counts against the paid-research quota. Decisions with extra calls have their own quota; zero-call planning does not.

| Route | Purpose |
|---|---|
| `GET/POST /api/events` | List or create events |
| `GET/DELETE /api/events/:id` | Read (briefs, research summary, run summaries) or delete |
| `POST /api/events/:id/revisions` | Save a revision `{ brief, note }` |
| `POST /api/events/:id/research` | Run bounded Qloo research for the latest revision |
| `POST /api/events/:id/autopilot` | Decide `{ revision, maxCalls }` |
| `GET /api/events/:id/runs/:runId[/packet?format=md]` | Full run or packet |
| `GET /api/events/:id/compare?a=&b=` | Compare two runs |

The tests check that saved events, research and decisions survive a real server restart, and that no anonymous route, including public run links, can read them.
