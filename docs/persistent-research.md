# Persistent research and decision proofs

The worker runs with `server/index.mjs` (`npm start` or the existing development launcher). `createApp()` alone registers HTTP routes but does not start the background worker, which lets tests and embedding callers control execution explicitly.

## Workflow and durability

`POST /api/research-runs` takes `{sourceId, kind, options}` and an `Idempotency-Key` header. Kinds are `festival`, `season`, and `proof`. The first two accept the same options as the existing GM research operations. `proof` uses saved evidence only and performs no provider calls.

Preflight checks the saved source, live/synthetic mode, scope and research budget before enqueueing. A matching key and identical input return the same run (HTTP 200); different input with that key returns 409. New jobs return 202 immediately. At most four unfinished jobs are accepted, one executes at a time across workers sharing the SQLite database, and persistent quotas cap new jobs at six/minute and 100/day. These limits are separate from the existing direct GM API quotas and are not a universal provider billing cap. The browser now uses durable runs for festival and season research; the older synchronous endpoints remain available.

Transitions: `queued → running → completed|failed`, `queued → canceled`, `running → cancel_requested → canceled`, or expired active work → `interrupted`. Cancellation uses `expectedRevision`. Provider calls already in flight may finish; their receipt is retained, and the next workflow does not start. The original decision is never mutated.

Every transition, workflow start, receipt, GM stage and proof step receives a sequence number, timestamp, prior-event hash and SHA-256 digest. This detects accidental modification against a trusted retained digest; it is not an externally signed or tamper-proof audit system. Sources and results are pinned for retention. Result snapshot creation and the terminal completion event share one database transaction.

Workers renew a 90-second lease every ten seconds. If execution dies, another worker marks the expired run interrupted and preserves its recorded evidence. Queued jobs remain eligible for execution after restart. Active calls are never automatically replayed. A fresh run is an explicit new research request and may incur provider usage. Persistent storage must be on a durable local volume; this is not a distributed cloud queue spanning separate databases.

## Read and reconnect

All run history, events and mutations require organizer access in protected deployments. Neither worker ownership nor credentials are returned to the browser.

- `GET /api/research-runs` lists the latest 20 runs.
- `GET /api/research-runs/:id` returns status, revision, request/source digests and eventual result ID.
- `GET /api/research-runs/:id/events?after=0` returns up to 100 events after that sequence, plus `nextCursor`, `hasMore` and current run state.
- `POST /api/research-runs/:id/cancel` takes `{expectedRevision}`.

The browser polls with a cursor, so reconnecting does not reissue completed research. Pending request IDs and inputs are held in session storage; organizer credentials remain in memory only. After reloading a protected deployment, unlock organizer access again and use **Reconnect last request** or **Refresh run history**. Exports include every currently recorded event, even when the run failed or was canceled. Old failed runs are not turned into successful results.

**Completed describes execution, not decision quality.** Inspect the saved proof's blockers and review findings before approving a plan. The deterministic tool agent remains identified as such; persistent execution does not turn it into a model-directed agent.

## Reference attribution

Theme Night GM's `src/lib/store.ts`, `src/lib/featured.ts`, `src/app/api/runs/[id]/route.ts` and agent replay approach provided the product pattern. PartDrop's `server/src/orders.ts` supplied the evidence-linked state-transition pattern. This implementation is original Node/SQLite code; it does not copy Redis or payment-provider code. Existing exact ports and licenses remain documented separately.
