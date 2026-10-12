# Deployment runbook

## Runtime contract

Deploy as a long-running **Node.js 22.19+ server or Docker container** with outbound HTTPS, child-process support and a writable filesystem. The official Qloo harness runs as a local stdio process. An isolate-only runtime such as Cloudflare Workers cannot run this integration as written.

Render, Fly.io or a comparable service can be considered when configured for this runtime contract. This runbook describes the application's requirements; it does not claim that a particular hosting plan or platform configuration has been verified.

## Prepare

1. Run `npm ci` and `npm test` from a clean checkout.
2. Set `QLOO_API_KEY` through the hosting provider's secret mechanism. Leave `QLOO_MODE` unset for a live deployment.
3. If enabling model features, also set `ANTHROPIC_API_KEY` and `LLM_MODEL`. Without both, the deterministic planner and writer remain available.
4. Set `DATA_DIR` to a dedicated mounted persistent directory, for example `/var/data/houselights`. The service must be able to create and write files there. This preserves share links across restarts and releases.
5. Set `PORT` to the port expected by the host. The default is `8080`; use `/healthz` as the HTTP health-check path. For a hosted Node service, set `HOST=0.0.0.0`; the local default is loopback-only `127.0.0.1`. The Dockerfile already sets `HOST=0.0.0.0`.
6. Choose explicit `CALL_BUDGET`, `INTELLIGENCE_CALL_BUDGET` and `DAILY_MEMO_CAP` values compatible with the API allowance. Both call budgets count harness workflow attempts, not individual provider HTTP requests; the intelligence budget cannot exceed 60.
7. Leave proxy trust disabled unless the host has one trusted proxy hop in front of the app; in that configuration set `TRUST_PROXY=1`. Confirm client IP handling matches the actual deployment path before relying on per-IP throttling.

For a plain Node service, install with `npm ci --omit=dev` and start with `npm start`. For a Docker service, build the included `Dockerfile`; inject secrets and mount storage at runtime. Do not bake `.env` or keys into the image. The Docker command starts Node directly and expects injected environment variables.

## Verify the release

- Confirm `/healthz` responds and reports `mock: false`. `keyed: true` means a key is configured; it is not proof that the key works.
- Run one real, bounded memo and inspect successful Qloo receipts. Check entity resolution, ranking, city scope and unfamiliar shapes with the live probe.
- Verify selected artists have buyer-entered fees and confirmed availability. Check that unknown fees, unsupported evidence and impossible constraints are visible.
- Change the budget, lock or exclude an artist, and confirm the displayed slate and diagnostics respond to the constraint.
- Run budget and fee stress cases. Confirm locked artists remain locked, unknown fees remain ineligible, and the original slate's continued feasibility is distinguished from finding a replacement.
- Generate a contingency report for a saved run. Confirm each cancellation excludes the canceled act, preserves every survivor and either supplies one replacement or declares infeasibility. Inspect the robust slate's utility sacrifice and cancellation coverage.
- Generate a dossier and ask it about risks, costs, geography and receipts. Confirm an unsupported forecast question is refused and supported answers return saved receipt IDs.
- Generate an operational packet with an explicit date. Validate every hold draft's number guard and import the returned iCalendar payload into a calendar client.
- Move one selected artist through pitch approval and outreach. Confirm Day 3/7/14 follow-ups, revision-conflict handling, response cancellation of reminders and the logistics gate.
- Run a three-market intelligence request. Confirm its child snapshot, namespaced receipts, artist-market matrix, pair comparisons, exact route diagnostics and unverified venue leads. Then read the campaign report and verify its negotiation ceiling and cancellation replacement against the saved budget and contingency output.
- Qualify at least one Qloo place lead per route stop with a demonstrably sourced capacity and test both `per_stop` and `whole_route` artist-fee modes. Confirm out-of-band rooms remain labeled, unknown place IDs are rejected and stop allocations reconcile to the route total.
- Save a named scenario, open it in a fresh session, and verify its parent link, edited terms and unchanged source receipts. Confirm the source run itself is unchanged.
- Open a saved share link in a fresh browser session, restart the service, and confirm it remains available from persistent storage.
- Confirm no server key appears in browser network responses, generated snapshots, source control or logs.
- Test the public URL without an account or private network, as the supplied hackathon brief requires a functional externally published demo.
- Capture screenshots only after completing the public live workflow. Label any synthetic screenshots clearly.
- Check the responsive layout and reduced-motion behavior. Confirm that the approximately 18.3 MB decorative GIF loads only when the user opts into motion.

## Operational limits

Share links expose the stored memo and inputs to anyone with the link. Use invented booking terms in a public demonstration; do not load confidential artist offers until suitable account access controls exist. Keep the dedicated snapshot directory out of source control and backups intended for public release.

The cache, per-IP throttling and daily cap are process-local and reset on restart. Multiple replicas do not share quotas. For the first public release, use one instance, establish a provider-level spend/quota limit, and check the application's proxy trust setting against the host's actual proxy path. A larger deployment needs shared quota state and stronger abuse controls.

Receipts retain compact evidence rather than raw provider responses. Back up the persistent snapshot directory if share-link continuity matters; old snapshots are removed when retention is reached. A healthy web server and a configured key are insufficient to certify the Qloo integration: retain evidence of an actual successful end-to-end live run.

## Release record

Record the deployed commit, public URL, runtime version, test result, live probe date, Qloo response-shape notes and persistence check when the release is complete. These are currently publication tasks, not completed deployment claims.
