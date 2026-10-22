# Persistent research and decision proofs

The worker runs with `server/index.mjs` (`npm start` or the existing development launcher). `createApp()` alone registers HTTP routes but does not start the background worker, which lets tests and embedding callers control execution explicitly.

## Workflow and durability

`POST /api/research-runs` takes `{sourceId, kind, options}` and an `Idempotency-Key` header. Kinds are `festival`, `season`, `proof`, `investigation`, and `benchmark`. The first two accept the same options as the existing GM research operations. `proof` uses saved evidence only and performs no provider calls. `investigation` uses a configured LLM to choose bounded local tools and optional Qloo research; its behavior is described below. `benchmark` takes `{trials: 1..5}` and records real model-only controls.

Preflight checks the saved source, live/synthetic mode, scope and research budget before enqueueing. A matching key and identical input return the same run (HTTP 200); different input with that key returns 409. New jobs return 202 immediately. At most four unfinished jobs are accepted, one executes at a time across workers sharing the SQLite database, and persistent quotas cap new jobs at six/minute and 100/day. These limits are separate from the existing direct GM API quotas and are not a universal provider billing cap. The browser now uses durable runs for festival and season research; the older synchronous endpoints remain available.

Transitions: `queued → running → completed|failed`, `queued → canceled`, `running → cancel_requested → canceled`, or expired active work → `interrupted`. Cancellation uses `expectedRevision`. Provider calls already in flight may finish; their receipt is retained, and the next workflow does not start. The original decision is never mutated.

Every transition, workflow start, receipt, GM stage and proof step receives a sequence number, timestamp, prior-event hash and SHA-256 digest. This detects accidental modification against a trusted retained digest; it is not an externally signed or tamper-proof audit system. Sources and results are pinned for retention. Result snapshot creation and the terminal completion event share one database transaction.

Workers renew a 90-second lease every ten seconds. If execution dies, another worker marks the expired run interrupted and preserves its recorded evidence. Queued jobs remain eligible for execution after restart. Active calls are never automatically replayed. A fresh run is an explicit new research request and may incur provider usage. Persistent storage must be on a durable local volume; this is not a distributed cloud queue spanning separate databases.

## Read and reconnect

### Durable benchmark contract

`POST /api/benchmarks` takes `{sourceId,trials}` and an `Idempotency-Key`. It returns HTTP 202 with `{run,batch,reused:false}`; an identical retry returns HTTP 200 and the same IDs. The former GM shortcut, `POST /api/gm/:id/benchmark`, uses this contract too (default three trials); the GM browser button explicitly requests one trial. Neither route waits for model completion. All three enqueue paths share the two-batches/minute and twenty-batches/day limits.

Poll the research run and `GET /api/benchmarks/:id`. Each completed trial, its immutable source snapshot, and its journal event are committed together. `run.status: completed` may accompany a `batch.status: partial` after provider rate limiting or a non-comparable source; inspect the batch summary. Trial one remains the predeclared review source, even if a later result is more favorable. Canceling during a call retains that call's returned trial before stopping. An expired lease during a call records an `unknown` outcome separately from `notAttempted`; no automatic retry can silently add another model sample.

The Independent Evaluation view has reconnect, cancellation and full-batch export controls. Research history also retains benchmark runs. The campaign CLI saves request keys before submission and supports `npm run evaluate:campaign -- --resume artifacts/evaluation-UUID.json`. It rejects changed briefs and cannot resume artifacts created before durable request keys were recorded.

All run history, events and mutations require organizer access in protected deployments. Neither worker ownership nor credentials are returned to the browser.

- `GET /api/research-runs` lists the latest 20 runs.
- `GET /api/research-runs/:id` returns status, revision, request/source digests and eventual result ID.
- `GET /api/research-runs/:id/events?after=0` returns up to 100 events after that sequence, plus `nextCursor`, `hasMore` and current run state.
- `POST /api/research-runs/:id/cancel` takes `{expectedRevision}`.

The browser polls with a cursor, so reconnecting does not reissue completed research. Pending request IDs and inputs are held in session storage; organizer credentials remain in memory only. After reloading a protected deployment, unlock organizer access again and use **Reconnect last request** or **Refresh run history**. Exports include every currently recorded event, even when the run failed or was canceled. Old failed runs are not turned into successful results.

**Completed describes execution, not decision quality.** Inspect the saved proof's blockers and review findings before approving a plan. Festival and season workflow orchestration remains deterministic; the separate `investigation` kind is model-directed. A completed investigation job may have saved partial evidence with `model_unavailable` or `step_limit`; check its saved investigation status as well as the job status.

## Bounded model-directed jobs

Investigation options include a `question` of 1–2,000 characters, 1–4 permitted `markets`, `maxSteps` of 3–10 (default 8), and `maxQueries` of 0–4 (default 3). The saved pool must contain 1–10 candidates. Model configuration is checked before enqueueing. With new Qloo queries enabled, the source mode and configured Qloo connection must also match. `maxQueries: 0` prevents fresh Qloo research; model calls still occur.

The application records every model attempt, tool rejection, successful observation and provider wait in the same event journal. It validates IDs, arguments and budgets before running an action. Inspecting a receipt or proof and testing hypothetical budgets/locks/exclusions use saved evidence. Market ranking and artist geography/demographics consume the separate Qloo query allowance. The provider cannot directly approve a decision, contact artists or mutate the source.

Native function-call responses select one action per step. Provider token-reset headers can pause the next request for up to 60 seconds. A valid Retry-After permits at most two retained rate-limit retries, each consuming a step; cancellation remains active during waits. The research deadline is ten minutes for investigation instead of the normal two-minute workflow deadline. Provider errors remain visible and are never filled with synthetic findings.

Final interpretations must cite successful observations; citations establish traceability, not correctness of the model's reasoning. A preferred scenario must reference a feasible server-executed scenario. `POST /api/investigation/:id/apply` validates the stored proposal and its source digest, recomputes the scenario, and saves an unapproved child decision with a new proof. It does not accept client-supplied replacement terms as the model's result. See [advanced workflows](advanced-workflows.md) for the organizer controls and [live validation](live-validation.md) for the current live end-to-end status.

## Reference attribution

The owner-supplied festival research reference's `src/lib/store.ts`, `src/lib/featured.ts`, `src/app/api/runs/[id]/route.ts` and agent replay approach provided the product pattern. PartDrop's `server/src/orders.ts` supplied the evidence-linked state-transition pattern. This implementation is original Node/SQLite code; it does not copy Redis or payment-provider code. Existing exact ports and licenses remain documented separately.
