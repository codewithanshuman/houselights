# Security

Last reviewed 25 October 2026. This page covers the public demo and the private organizer tools.

## Access model

- **Public, read-only:** the Booking Desk and its zero-call experiments, the evidence page, the Qloo Proof Lab, published cases and recorded runs.
- **Private:** organizer events, research, studies and every write. These require a single organizer token of at least 32 characters, sent as a Bearer header. This is single-organizer access, not a multi-user account system.
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
- **Judge experiments:** 20 per IP and 60 in total per minute. Identical experiments are served from a server cache after the quota is counted.
- **Festival policy:** briefs above 2,500 combinations are rejected, because the policy runs synchronously.
- **429 responses** include `Retry-After`. Every error response is `{error, requestId}` and never includes stack traces or internals.
- **Tested:** a flood of forged ballots gets only 4xx responses, nothing is stored, and the per-IP limit engages (`tests/http-hygiene.test.mjs`).

## Secrets

- Provider keys and the organizer token live only in the server environment file (`/home/ubuntu/.config/houselights/release.env`, mode 600). They are never in the repository or the browser.
- **CI secret scan:** `scripts/secret-scan.mjs` runs in CI and checks every tracked file for private keys and known token formats. It passes on 377 files and catches a planted key.
- **Deploy check:** before every deployment, the checked-out source is scanned for the exact values in the environment file.

## Dependencies

- **CI audit:** `npm audit --omit=dev --audit-level=critical` runs in CI.
- **Current state:** 3 remaining advisories in runtime dependencies (1 high, 2 moderate), all reachable only through the official `@qloo/qloo-harness` and its bundled agent dependency (`undici`), with no fix available. The high-severity `undici` advisories concern EventSource parsing and SRI tokens, which Houselights does not use with untrusted servers. **Accepted risk until the harness updates.**
- **Fixed on 25 October:** `body-parser` (DoS via trailing bytes), `fast-uri` and `zod`.
- **Docker base image:** pinned by multi-arch digest (`node:24-slim@sha256:55fb5f5a…`).

## Proxy trust

`TRUST_PROXY=1` is correct only with exactly one trusted proxy hop in front of the app; production has one (Caddy). The live check is in [shared Oracle host](shared-oracle-host.md).

## Integrity of evidence

Receipts carry content digests, and published records carry manifests pinned in source (`server/autopilot-pins.mjs`). Qloo responses are unsigned, so these digests show that a record is unchanged since capture, not that Qloo produced it.
