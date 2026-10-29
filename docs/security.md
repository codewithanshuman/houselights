# Security

Last reviewed 28 October 2026. This page covers the public demo and the private organizer tools.

## Access model

- **Public, read-only:** the Booking Desk and its zero-call experiments, the evidence page, the Qloo Proof Lab, published cases and recorded runs.
- **Public, live research:** `POST /api/plan` ("Plan a show") runs capped Qloo research (at most 12 uncached workflow attempts, 120-second deadline) for a visitor's city, artist, budget and act count. One workflow can issue multiple HTTP requests; the separate HTTP guard meters each actual attempt. Input is validated and cleaned before research. The result is saved as a live plan that is never listed with the published cases.
- **Private:** organizer events, research, studies and writes outside the explicit public plan, saved judge-experiment/replay and invitation-ballot routes. These require a single organizer token of at least 32 characters, sent as a Bearer header. This is single-organizer access, not a multi-user account system.
- **Shared decision reports** are readable by anyone who has the link (bearer links). Do not put confidential offers into a public demo.
- **Blind-review ballots** are authenticated by a per-reviewer invitation token. A token can submit only once ("already submitted"), and the review page does not link to the evidence pages, so blinding is preserved.

## HTTP headers (application)

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
X-Request-Id: <per request>
```

- **Scripts:** there are no inline scripts and no third-party origins. `style-src-attr 'unsafe-inline'` permits dynamic `style=""` attributes only.
- **Framing:** `frame-ancestors 'none'` blocks the site from being framed.
- **HSTS:** set by the Caddy proxy (see [deployment](deployment.md)).

## Rate limits and abuse

- **Persistent per-IP quotas** are stored in SQLite: 180 API requests a minute. Paid research is limited to 6 a minute per IP and 100 a day.
- **Judge experiments:** 20 per IP a minute. Identical experiments are served from a server cache; only new calculations count toward the global cap of 60 a minute.
- **Live plans:** 3 per visitor every 10 minutes, 10 per visitor a day and a shared daily cap (`PUBLIC_PLAN_DAILY_CAP`, default 40). IPv6 visitors share their /64 prefix; IPv4-mapped addresses use the same bucket as IPv4. These post-validation plan limits are separate from the organizer paid-research bucket. Runs still consume the shared Qloo workflow allowance. Unsuccessful runs refund only their original plan reservations; spent workflow attempts are not refunded. Shared-VM Compose forwards the public cap explicitly.
- **Provider HTTP requests:** Qloo Support supplied 10 requests/second and 50,000 per 30 days; a live response confirmed this key's 50,000 limit. The canonical SDK transport now meters actual authenticated HTTP attempts across SQLite-sharing workers, including internal retries. A rolling 30-day ledger, header observations and request pacing enforce the separate HTTP budget; timestamps distinguish last-observed from conservative remaining quota. Cached evidence remains usable at exhaustion. The private `/api/qloo/quota` endpoint requires organizer access. See [provider quota accounting](qloo-quota.md) for refresh behavior and scope limits.
- **Festival policy:** briefs above 2,500 combinations are rejected, because the policy runs synchronously.
- **429 responses** include `Retry-After`. Every error response is `{error, requestId}` and never includes stack traces or internals.
- **Tested:** a flood of forged ballots gets only 4xx responses, nothing is stored, and the per-IP limit engages (`tests/http-hygiene.test.mjs`).

## Secrets

- Provider keys and the organizer token live only in the server environment file (`/home/ubuntu/.config/houselights/release.env`, mode 600). They are never in the repository or the browser.
- **CI secret scan:** `scripts/secret-scan.mjs` checks tracked files for private keys and known token formats. Git-free exports use a labeled filesystem-source inventory that skips runtime/private directories and symlinks. Regression tests catch a planted key without printing its value. Original-source verification separately reports when Git exclusion cannot be established.
- **Deploy check:** before every deployment, the checked-out source is scanned for the exact values in the environment file.

## Dependencies

- **CI audit:** `npm audit --omit=dev --audit-level=high` rejects high and critical runtime dependency advisories.
- **Dependency follow-up, 28 October:** the locked-tree audit reports zero known vulnerabilities after updating the existing scoped Undici override from `8.10.2` to `8.12.2`. Previously, the harness → terminal-agent dependency chain produced one high and two moderate findings. The audit's `fixAvailable: false` did not mean no patched release existed: the project's explicit override prevented automatic remediation. The [upstream security release](https://github.com/nodejs/undici/releases/tag/v8.12.2) addresses the reported decompression, redirect/cache, TLS, WebSocket, EventSource and SRI advisories. No other package version changed. Node 24 satisfies the package's `>=22.19.0` engine requirement. Node's built-in fetch uses its separately bundled Undici; updating this npm package does not update Node itself. See [hardening scope and limits](production-hardening.md).
- **Fixed on 25 October:** `body-parser` (DoS via trailing bytes), `fast-uri` and `zod`.
- **Docker base image:** pinned by multi-arch digest (`node:24-slim@sha256:55fb5f5a…`).
- **Runtime verification:** both pinned Linux platform configurations contain Node `24.22.1`, whose [security release](https://nodejs.org/en/blog/release/v24.22.1) updates bundled Undici to `7.30.1`. The actual CI container check asserts that bundled-library minimum separately from the installed npm `8.12.2` pin. Use the patched Node 24 runtime for release verification; a clean npm audit does not cover Node's bundled dependencies. Local follow-up validation uses a checksum-verified, project-local binary without replacing the system Node installation.

## Proxy trust

`TRUST_PROXY=1` is correct only with exactly one trusted proxy hop in front of the app; production has one (Caddy). The live check is in [shared Oracle host](shared-oracle-host.md).

Checked live on 25 October 2026 (release `02f7228`): 200 requests to `/api/judge/cases` within one minute, each with a different forged `X-Forwarded-For`, returned 180 × 200 then 20 × 429. The per-address limit (180 a minute) applied to the real client address, so a forged header cannot dodge rate limits.

## Integrity of evidence

Receipts carry content digests, and published records carry manifests pinned in source (`server/autopilot-pins.mjs`). Qloo responses are unsigned, so these digests show that a record is unchanged since capture, not that Qloo produced it.
