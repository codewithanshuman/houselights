# Final production hardening — 28 October 2026

Scope: stability fixes on `development`, starting from `7a8d2d1`. No redesign, new product workflow, scoring-weight changes, evaluation-fixture changes or deployment. Untracked `.claude/` work is preserved.

## Confirmed defects and permanent regressions

| Defect | Fix | Regression |
| --- | --- | --- |
| Independent snapshot deletion orphaned inherited operational evidence. | `server/store.mjs` removes eligible snapshot/evidence pairs in the same transaction as the new save. | `tests/retention.test.mjs`: pair retirement and forced-trigger rollback. |
| Retained children and persisted reports could lose their source ancestors. | Cleanup protects pinned records, 500 recent unpinned roots, references in persisted domain records and their transitive dependencies. | Repeated pruning, separate-process restart, SQLite backup/restore and concurrent writers. |
| Anonymous visitor plans accumulated indefinitely. | `server/judge.mjs` expires unreferenced visitor plans after seven days. Curated records and externally referenced plans remain unchanged. | `tests/live-plan.test.mjs`: expiry, retained evaluation, immutable curated case, transaction rollback. |
| Public HTTP cache could return an expired visitor plan. | `server/http-hygiene.mjs` excludes temporary plans from the read cache. | Fresh-read then expiry test, real HTTP 410 and mobile expired-link recovery. |
| UI called hypothetical acts “Booked.” | Existing labels say “Selected”; fees and assumed availability are disclosed. | Booking Desk browser assertions, including live-plan disclosures. |
| One-act input did not explain its two-candidate comparison requirement. | Preserve one requested act; explain the minimum comparison pool in the form and failure response. | One-act HTTP success, singleton projection rejection and visible browser disclosure. |
| `expected_profit` ignored a supplied CVaR ceiling. | Every policy filters eligibility by the ceiling, comparing integer minor units. | `tests/financial-simulation.test.mjs`: all objectives, no feasible choice, exact penny boundary. |
| Changed financial semantics could masquerade as an exact old-model replay. | Version is now `financial-scenario-v1.1`; old reports remain readable and the existing version guard rejects replay with 409. | `tests/financial-integration.test.mjs`: unchanged legacy report and rejected incompatible replay. |
| Parse errors could log private persisted content; operational write failures exposed internal errors as 400. | `server/app.mjs`, `server/judge.mjs`, `server/live-plan.mjs` log safe context; operational writes return generic 500 on unexpected failure. | Private marker absent from response/log, forced SQLite write failure, no partial evidence row. |
| Saved non-USD briefs were rendered in USD. | `public/plan.js` uses the saved brief's currency. | Real Manchester brief displays £4,600 in Chromium, Firefox and WebKit. |
| Booking Desk opened the first rank receipt rather than the candidate-bound receipt. | Prefer the explicitly bound rank receipt; missing declared evidence stays unavailable. | Real saved Manchester receipt opens `v1`, rather than earlier `r9`. Eleven saved briefs exercise differing bindings. |
| Delayed earlier case fetch could replace the latest chosen brief. | Case request generation guards result, error and background-comparison updates. | Deliberately delayed Manchester response after Berlin; reproduction failed before fix. |
| Overlapping budget calculations could replace a newer infeasible result with an unaffordable old lineup. | Calculation generations reject obsolete success/error responses and prevent stale callbacks from rolling back controls or moving focus. | Delayed $13,050-budget response after a $5,800 infeasible result; reproduction showed a $10,000 lineup before the fix. |

## Retention and compatibility

The 500-record rule is a **disposable cache-root limit**, not a hard total-database limit. Protected ancestors and referenced records may exceed it. Original private documents and distinct review histories remain retained, including legacy records whose pin was removed. Only unchanged inherited copies may be retired with otherwise unreferenced snapshots. Hiding an example does not retire its operational evidence. Studies, investigations, financial reports and other persisted domain records retain their referenced sources. Provider caches and quota rows are not evidence roots.

Previously orphaned private rows are not automatically deleted or assigned invented parents. They remain forensic evidence pending explicit recovery from a verified backup or authorized retirement. The default local database was inspected read-only: 80 snapshots, zero orphan evidence rows and zero missing parent links. This is not an inspection of production storage.

Unpublished anonymous plans expire seven days after their original creation time unless referenced. Their payload is replaced atomically with a small tombstone, returning HTTP 410 for thirty days after expiry; afterward the link returns 404. Curated records never receive this policy. Existing visitor records use their original timestamp without rewriting their evidence; invalid legacy dates are left for review. There is no new background worker: existing reads/saves perform cleanup. Unreadable persisted references stop cleanup rather than authorize deletion. Malformed legacy storage needs operator repair from backup.

No schema reset or production migration was executed. The implementation uses existing SQLite tables and JSON fields. Existing immutable snapshots, case IDs, receipt digests, original captures, evaluation inputs and historical financial-demo output are unchanged. The financial replay version change is intentional and does not modify old reports.

## Verification and limits

Command outputs are retained under `artifacts/hardening-*`. Final exact counts and release verdict are reported with the delivered revision, after all checks finish. Early failures are retained rather than relabeled as passes: dependency installation temporarily prevented imports; independent operational scenarios consumed a shared test quota; the flood test could cross a minute; the delayed-case browser reproduction demonstrated the race. Quota setup was isolated and the flood clock fixed without removing real requests or weakening assertions.

No live Qloo/LLM calls, production data changes or deployments are needed for these regressions. Mock provider runs test failure/control paths; saved genuine evidence tests deterministic decisions, not current provider availability. Qloo receipts are not provider-signed. Fees remain illustrative/estimated, availability assumed, and commercial uplift unmeasured. No genuine blinded reviews or first-time physical-phone sessions were added.

Docker is not installed in this Windows environment. A local Node process rehearsal does not establish Linux container startup, signals or hosted-volume persistence. Those checks need the existing Docker CI/authorized environment. The proposed release must still be authorized and checked against the deployed commit; an older hosted commit is not verification of these changes.

The npm audit reports one high and two moderate transitive advisories through the official harness/terminal-agent dependency chain, with no fix offered by the audit. The built canonical adapter manifest has 666 inputs and contains neither npm `undici` nor the terminal agent; Node's separate built-in fetch uses its bundled Undici. This narrows the observed execution scope but is not a blanket exploitability assessment or a clean audit. Dependency changes were not forced. Remaining artwork permissions are owner attestations recorded in `public/assets/SOURCES.md`, not independently authenticated licenses.
