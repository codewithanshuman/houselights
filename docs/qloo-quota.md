# Qloo provider request limits

On 28 October 2026 the organizer supplied Qloo Support's default hackathon-key limits: **10 HTTP requests per second** and **50,000 requests per 30 days**. A bounded live request returned HTTP 200 and confirmed `x-month-ratelimit-limit: 50000`. The key's remaining balance is observed from `x-month-ratelimit-remaining`, with a timestamp; it is never a permanently valid number copied into the UI.

## Three different units

- Visitor limits admit public plans (currently 40/day globally, with stricter visitor caps).
- `Run` budgets and `DAILY_QLOO_WORKFLOW_CAP` count tool/workflow attempts, including retries. A canonical workflow can make several HTTP requests.
- The provider transport guard counts authenticated HTTP attempts made by the installed official Qloo adapter. Each SDK retry and internal request is metered separately. Cached evidence makes no new provider request.

The existing admission and workflow protections remain. There is no new dashboard or booking feature.

## HTTP enforcement and accounting

`server/qloo-worker.mjs` installs a transport wrapper before the canonical adapter constructs its client. The wrapper uses the credential actually present in the official client's `X-Api-Key` header, covering both environment and SDK config-file credentials. The SDK's tools, schemas, endpoint configuration and trust checks remain unchanged. No raw credential is persisted or returned by quota telemetry.

All workers sharing `DATA_DIR` use the existing SQLite database and transaction mechanism. `qloo_http_requests` stores hashed credential scope, random request ID, start time and completion time only. `qloo_http_state` stores numeric quota observations and conservative balance estimates. These counters do not reference source snapshots and are excluded from snapshot-retention scans.

Requests are spaced at least 105 ms apart at the default rate, providing modest scheduling headroom below 10 requests/second. SDK retries are subject to the same guard. Automatic redirects are rejected so they cannot introduce unmetered requests or forward credentials elsewhere. A valid provider `Retry-After` delays other workers sharing the key.

The HTTP spend is committed before dispatch. A separate, short serialized handoff records the clock after the native fetch invocation, so slow reservation commits cannot bunch transport starts together. HTTP responses are awaited outside the database lock. An interrupted handoff expires after 30 seconds; recovery fences the old owner and waits another full rate window before admitting a replacement. Its uncertain attempt remains spent.

Local HTTP attempts are limited to 50,000 in a rolling 30-day window, or a lower observed provider limit. A canceled wait has not started a request and consumes nothing. Once admitted, failed/aborted network attempts remain spent locally: the app cannot prove the provider did not receive them. Expired ledger rows are retired after the rolling window. The guard does not guess a calendar-month reset.

Valid monthly headers are recorded separately from the conservative allowance used for admission. Missing or malformed headers stay unknown and do not overwrite a good observation. Overlapping attempts are conservatively subtracted because responses can arrive out of order; even an operator refresh cannot restore an overlapping completed request. The conservative balance may therefore be lower than the raw last-observed header. Calls made by other installations are visible only through later provider headers; this database is not a universal meter of every client using the key.

When the allowance is exhausted, uncached workflows return a local `PROVIDER_QUOTA` failure. Recent cached evidence, saved proofs and deterministic re-optimization remain available. A failed plan refunds its plan reservation as before, but spent HTTP attempts are never refunded.

## Private operator checks

Read the local persisted status without any provider request:

```sh
npm run quota:qloo
```

Explicitly verify current headers with **one** metered request to the official API-information endpoint:

```sh
npm run quota:qloo -- --refresh
```

The refresh retains only status and numeric quota metadata; it cancels the response body. It can check for replenishment after a previous zero balance, but never clears the rolling ledger or bypasses its limit or rate guard. It does not enable unlimited public probes. If the SDK credential is held only in its config file, configure the environment credential for this Houselights operator command; the worker still meters the actual SDK credential either way.

`GET /api/qloo/quota` returns the same private status. Protected deployments require organizer authorization and return `Cache-Control: no-store`; anonymous requests receive 401. Responses contain no API key, credential hash, request URLs or provider response bodies.

## Verification scope

Regressions cover cross-process request pacing, monthly-window boundaries, header parsing, out-of-order responses, explicit probes, cache access at exhaustion, cancellation, failed writes, retry accounting, redirect rejection and private telemetry. The installed SDK is tested against a clearly synthetic local HTTP service with its real retry behavior and both credential sources. Those fixture requests are not live Qloo evidence. Live header verification is recorded separately in ignored operator artifacts.

A subsequent hosted live-plan check completed with 13 receipts: eight cached and five uncached workflows, which made 15 HTTP requests. Its incomplete affinity evidence correctly produced a provisional API result. The Booking Desk now exposes that limitation in the decision heading and warning, and does not claim a meaningful affinity comparison for incomplete rankings. A synthetic browser regression covers this state at desktop and phone widths in all three browser engines. The FAQ explicitly labels the 12-attempt live-plan budget as uncached workflows, not provider HTTP requests. These are conditional wording corrections; styling, images and fully supported decision wording are preserved.
