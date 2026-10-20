# Deployment runbook

The current hosting budget is zero. The [public demo](https://houselights.80-225-218-239.sslip.io) runs on the owner's existing Oracle Ubuntu 22.04 ARM VM at commit `30f86d59b7fa640fc73d016258f7ebd5d0cea4ed`, deployed on 20 October 2026. It uses `deploy/free-vm/shared.compose.yaml` and `shared-public.override.yaml`, persistent storage and Caddy HTTPS. No cloud resource was purchased or provisioned; account billing eligibility remains unverified. See the [free VM runbook](free-hosting.md), [shared-host procedure](shared-oracle-host.md) and [actual deployment record](live-validation.md#oracle-public-deployment--20-october-2026). `JUDGE_CASES_FILE` seeds curated public cases atomically at startup, and `npm run release:verify -- https://host` checks public HTTP behavior without provider calls or organizer credentials.

## Runtime contract

Deploy the backend as a long-running **Node.js 24+ server or Docker container** with outbound HTTPS, child-process support and a writable filesystem. The official Qloo harness runs as a local stdio process. An isolate-only runtime such as Cloudflare Workers cannot run this integration as written. The deployed Oracle container satisfies this contract. Vercel frontend preparation is available below; no Vercel deployment has been performed.

Render, Fly.io or a comparable service can be considered when configured for this runtime contract. This runbook describes the application's requirements; it does not claim that a particular hosting plan or platform configuration has been verified.

## Optional Vercel frontend

The existing SQLite database and background research worker need a persistent backend. Vercel's [SQLite guidance](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel) explains why local SQLite storage cannot serve this role in Functions. Host the backend under the runtime contract above, then run:

```sh
npm run deploy:prepare-vercel -- https://your-backend.example.com artifacts/vercel-release
```

This creates a **new** directory containing `public/` and `vercel.json`; it never uploads anything. It copies only public assets, rejects hidden files and symbolic links, and refuses an existing output directory. Deploy that generated directory as a Vercel project, with the framework set to Other. The root repository is not an all-in-one Vercel deployment.

The generated [external rewrites](https://vercel.com/docs/project-configuration/vercel-json#rewrites) proxy `/api/*` and `/healthz` to the configured backend and serve `/m/:id` through `index.html`. Reviewer links use `review.html`; hands-on judge cases use `judge.html`. No provider keys or organizer token belong in Vercel frontend configuration. Confirm API responses remain uncached and organizer Authorization headers pass through on the actual deployment. Benchmark batches now use the same durable worker and short polling requests as research. The Node backend must remain running on its persistent volume; an HTTP 202 is not proof of a working hosted worker.

Proxy trust must match the backend's real ingress chain; do not automatically increase it because Vercel was added. Start with trust disabled, verify forwarded addresses on the chosen host, and retain global quotas regardless of IP handling. Test both the direct backend and Vercel URLs for protected mutations, reviewer access, saved-report persistence and a real research run. Generating this package does not verify hosted storage, artwork rights or public accessibility.

## Prepare

1. Run `npm ci` and `npm test` from a clean checkout.
2. Set `QLOO_API_KEY` through the hosting provider's secret mechanism. Leave `QLOO_MODE` unset for a live deployment. For the verified event credential, configure both `QLOO_BASE_URL` and `QLOO_TRUSTED_BASE_URL` as `https://hackathon.api.qloo.com`; the production host rejected that key. Endpoint choice is explicit, never an automatic fallback.
3. For Groq, set `LLM_PROVIDER=groq`, `GROQ_API_KEY`, and a supported `LLM_MODEL` (`openai/gpt-oss-120b` passed local and hosted transport checks). The shared free-VM profile explicitly configures Groq. For a different deployment using Anthropic, forward `LLM_PROVIDER=anthropic`, `ANTHROPIC_API_KEY`, and an accessible model ID through its runtime configuration. Without valid model configuration, exact optimization and saved-evidence proofs remain usable; genuine controls and investigations are unavailable.
4. Set `DATA_DIR` to a dedicated mounted persistent directory, for example `/var/data/houselights`. The service stores `houselights.sqlite` and its WAL files there. Legacy JSON snapshots migrate on first read. Use a local disk volume, not a network filesystem shared between replicas.
5. Set `PORT` to the port expected by the host. The default is `8080`; use `/healthz` as the HTTP health-check path. For a hosted Node service, set `HOST=0.0.0.0`; the local default is loopback-only `127.0.0.1`. The Dockerfile already sets `HOST=0.0.0.0`.
6. Choose explicit `CALL_BUDGET`, `INTELLIGENCE_CALL_BUDGET` and `DAILY_MEMO_CAP` values compatible with the API allowance. Both call budgets count harness workflow attempts, not individual provider HTTP requests; the intelligence budget cannot exceed 60.
7. Leave proxy trust disabled unless the host has one trusted proxy hop in front of the app; in that configuration set `TRUST_PROXY=1`. Confirm client IP handling matches the actual deployment path before relying on per-IP throttling.
8. Set `NODE_ENV=production`, `PUBLIC_DEMO=1`, and a randomly generated `ORGANIZER_TOKEN` of at least 32 characters. Startup fails closed without that token. All API mutations and pipeline/campaign/study reads require it, except reviewer ballots authenticated by their invitation token. Shared decision reports remain readable by link. This is single-organizer access, not multi-user account management.

For a plain Node service, build with `npm ci && npm run build:worker`, then optionally run `npm prune --omit=dev` and start with `node server/index.mjs` using injected environment variables. Retain `build/` and `package-lock.json` in the deployment. Development `npm start`, `npm run dev` and `npm test` rebuild the official Qloo adapter before running and need development dependencies. The bundle reduces module-loading overhead without replacing official tool schemas or trust checks; a missing or stale bundle falls back to the installed adapter and may start slowly. The included Dockerfile builds the bundle in a separate stage and starts Node directly; inject secrets and mount storage at runtime. Do not bake `.env` or keys into the image.

The [esbuild Node bundling API](https://esbuild.github.io/api/#platform) packages the installed official adapter and TypeBox dependencies. Generated files are ignored by Git, record their lockfile digest, and include third-party license notices. Rebuild after dependency changes. [Release CI for `30f86d5`](https://github.com/codewithanshuman/houselights/actions/runs/39469596796) passed 233 tests, actual Linux builds and container persistence checks on x86 and native ARM64. A separate recreation on the Oracle host retained its saved source, proof result and event journal. Repeat those checks after deployment changes.

`compose.yaml` supplies a named persistent volume, non-root Node runtime, init process, health check and restart policy. The active shared-host profile additionally limits application CPU and memory; use its exact Compose files for maintenance rather than creating another project with the generic command. DNS and HTTPS were verified for the deployed third-party hostname. The application runs at 0.5 CPU/1536 MiB and its separate Caddy proxy at 0.1 CPU/128 MiB. Runtime limits do not constrain image builds; the actual build used a separately capped 0.5-CPU/2-GiB builder, which was stopped afterward. Enter the organizer token in Festival GM only on that trusted origin; it stays in tab memory and clears on reload.

## Verify the release

- Confirm `/healthz` responds and reports `mock: false`. `keyed: true` means a key is configured; it is not proof that the key works.
- Run `npm run validate:live`; retain the ignored `artifacts/live-validation.json` report. Then run one real, bounded memo and the Festival GM workflow, inspecting successful Qloo receipts. The smoke test checks core resolution/ranking and records unsupported auxiliary workflows; it does not certify every feature or real market relevance.
- Verify selected artists have buyer-entered fees and confirmed availability. Check that unknown fees, unsupported evidence and impossible constraints are visible.
- Change the budget, lock or exclude an artist, and confirm the displayed slate and diagnostics respond to the constraint.
- Run budget and fee stress cases. Confirm locked artists remain locked, unknown fees remain ineligible, and the original slate's continued feasibility is distinguished from finding a replacement.
- Generate a contingency report for a saved run. Confirm each cancellation excludes the canceled act, preserves every survivor and either supplies one replacement or declares infeasibility. Inspect the robust slate's utility sacrifice and cancellation coverage.
- Generate a dossier and ask it about risks, costs, geography and receipts. Confirm an unsupported forecast question is refused and supported answers return saved receipt IDs.
- Approve a current Decision Room proof before generating an operational packet with an explicit date and `expectedDecisionRevision`. Validate every hold draft's number guard and import the returned iCalendar payload into a calendar client. Changed source reviews or negotiated fees must invalidate the old approval.
- Move one selected artist through pitch approval and outreach. Confirm Day 3/7/14 follow-ups, revision-conflict handling, response cancellation of reminders and the logistics gate.
- Run a three-market intelligence request. Confirm its child snapshot, namespaced receipts, artist-market matrix, pair comparisons, exact route diagnostics and unverified venue leads. Then read the campaign report and verify its negotiation ceiling and cancellation replacement against the saved budget and contingency output.
- Inspect the audience profile's group tags, per-artist demographic rows and each configured cross-domain category. Confirm all rows carry intelligence receipt IDs and that disabling the profile reduces the preflight workflow count.
- Qualify at least one Qloo place lead per route stop with a demonstrably sourced capacity and test both `per_stop` and `whole_route` artist-fee modes. Confirm out-of-band rooms remain labeled, unknown place IDs are rejected and stop allocations reconcile to the route total.
- Save a named scenario, open it in a fresh session, and verify its parent link, edited terms and unchanged source receipts. Confirm the source run itself is unchanged.
- Open a saved share link in a fresh browser session, restart the service, and confirm it remains available from persistent storage.
- Confirm no server key appears in browser network responses, generated snapshots, source control or logs.
- Test the public URL without an account or private network, as the supplied hackathon brief requires a functional externally published demo.
- Capture screenshots only after completing the public live workflow. Label any synthetic screenshots clearly.
- Check the responsive layout and reduced-motion behavior. Confirm that the approximately 18.3 MB decorative GIF loads only when the user opts into motion.

## Operational limits

Share links expose the stored memo and inputs to anyone with the link. Use invented booking terms in a public demonstration; do not load confidential artist offers until suitable account access controls exist. Keep the dedicated snapshot directory out of source control and backups intended for public release.

Global API quotas persist transactionally in SQLite: 180 requests per IP per minute, plus six paid research requests per IP per minute and 100 globally per UTC day. Existing route-specific caps remain additional process-local limits. These count requests, not provider HTTP calls or currency spent. Workflow budgets also cap each research run. The Qloo cache remains in memory. Use one instance with a persistent volume, establish a provider-level quota, and verify proxy handling. Multiple independent disks do not share quotas.

Receipts retain compact evidence rather than raw provider responses. Retention keeps at most 500 unpinned snapshots; pinned judge examples and study sources survive that pruning. Pin intended examples through Festival GM. Back up the database with a SQLite-aware backup tool, or stop the service before copying the entire data directory including WAL files; do not copy only a live main database file. Test a restore before launch. Pipelines, studies and ballots are durable and do not currently have automatic retention. A healthy server and configured key are insufficient to certify live Qloo behavior.

## Backup and restore commands

`npm run backup -- create <new-backup-directory>` uses SQLite's online backup API, checks database integrity, and writes schema/content digests for every table. The backup contains private documents and review invitations; keep it outside public assets and source control. Existing destinations are never overwritten.

`npm run backup -- verify <backup-directory> <new-restore-directory>` validates the manifest, restores into an isolated new directory, and compares every table's digest. It never replaces the running database. Stop the service before intentionally switching `DATA_DIR` to a verified restore. The 20 October Oracle backup and isolated restore matched all 13 tables after application-container recreation, including four judge cases, two snapshots, one proof job and four events. The private off-host download also passed a separate restore and all table-digest checks. Human-review and commercial-evidence tables were empty. This verifies the tested stored contents, not VM-reboot recovery; retain and refresh the separately stored private backup.

## Release record

The [20 October Oracle release record](live-validation.md#oracle-public-deployment--20-october-2026) identifies the deployed commit and public URL, successful CI and 33 public HTTP checks, a public browser budget-replay check, bounded Qloo/Groq transport, retained proof data and verified server/off-host backup-restores. No VM reboot was performed. Long-term uptime, account free-tier billing eligibility, actual livestream quality, independent human judgments and genuine commercial evidence remain unverified. Artwork replacement and UI redesign remain deferred; hosting work removed no features.
