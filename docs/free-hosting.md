# Free hosting for the current application

The selected cost constraint is **no paid hosting**. On 20 October 2026,
commit `30f86d59b7fa640fc73d016258f7ebd5d0cea4ed` was deployed at
[the public Houselights demo](https://houselights.80-225-218-239.sslip.io)
on the owner's existing Oracle Ubuntu 22.04 ARM VM. No cloud resource was
purchased or provisioned. The address uses free third-party DNS rather than an
owned domain. The account's billing and ongoing free eligibility have not been
verified.

The active deployment uses `shared.compose.yaml` with
`shared-public.override.yaml`; see the [shared-host runbook](shared-oracle-host.md).
Public HTTP and browser checks, live provider transport, application-container
recreation and server/off-host backup-restores passed. The [deployment record](live-validation.md#oracle-public-deployment--20-october-2026)
states their scope. This does not establish long-term uptime or recovery after
a VM reboot.

The existing application needs a continuously running Node process, child
process support and persistent SQLite storage. An existing free Linux VM is the
closest fit. Oracle Cloud's
[Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
include eligible compute and block storage in the account's home region.
Provisioning requires the owner's account and available capacity. Always Free
eligibility and remaining allowance must be confirmed in that account; a trial
credit balance is not evidence that a resource stays free.

Render's free instances cannot attach persistent disks, and Vercel Functions do
not provide the local persistent storage this version requires. Neither is
being presented as a complete free backend. The optional Vercel frontend package
remains available; the deployed demo currently serves its frontend directly.

For a VM already running a bot or livestream, use the
[shared-host capacity checks and bounded profile](shared-oracle-host.md).
The standalone profile below is an alternative for a dedicated VM. It binds
ports 80/443 and must not conflict with another service. Do not switch the
existing shared deployment to that separate Compose project.

## Requirements for a new deployment

- A free VM/account with SSH access, enough free capacity for the Docker build,
  and persistent storage. Do not paste SSH private keys or provider keys in chat.
- A hostname resolving to the VM's public IP. An existing free subdomain can be
  used; these files do not buy or register a domain.
- Network rules allowing HTTP/HTTPS on ports 80 and 443, with SSH restricted to
  the owner's address. Port 8080 stays internal to Docker.
- Confirmation of the exact free resources before any provisioning step. The
  account owner completes signup, identity checks and agreements.

## Launch on a dedicated VM

The VM must already have Git, Docker Engine and the Docker Compose plugin from
their official distributions. Use the tested Git commit from the release CI.
The Compose file supports the application and HTTPS proxy on one VM.

```sh
git clone https://github.com/codewithanshuman/houselights.git
cd houselights
git checkout FULL_TESTED_COMMIT
```

Create `/etc/houselights.env` with owner-only permissions, outside the checkout.
Configure these fields privately:

```dotenv
PUBLIC_HOSTNAME=your-free-hostname.example
RELEASE_COMMIT=full-checked-out-git-commit
QLOO_API_KEY=your-event-key
GROQ_API_KEY=your-groq-key
LLM_MODEL=openai/gpt-oss-120b
ORGANIZER_TOKEN=an-unpredictable-secret-of-at-least-32-characters
```

The `.example` hostname and descriptive values above are placeholders, not
working configuration. Never commit the completed file or print its contents
in a release report. The event Qloo host is explicitly configured in Compose.

```sh
docker compose --env-file /etc/houselights.env -f deploy/free-vm/compose.yaml up --build -d
docker compose --env-file /etc/houselights.env -f deploy/free-vm/compose.yaml exec -T houselights node scripts/verify-release.mjs https://YOUR_HOSTNAME --commit=FULL_TESTED_COMMIT --output=/var/data/houselights/release-http-check.json
```

The HTTPS proxy is the backend's only exposed ingress, so this profile sets one
trusted proxy hop. If another proxy is later added, recheck that configuration.
The public root opens the judge workspace. `/index.html` retains the complete
organizer interface; provider workflows require the organizer token.

Startup seeds four curated public cases into a separate persistent database.
No local private database, review invitation or commercial source document is
transferred. All capabilities remain in the application; UI redesign and the
five artwork replacements are deferred. The current organizer artwork remains
in the deployed build; replacement and confirmation of publication rights are
still outstanding. The judge page itself does not use those assets. Hosting
verification does not resolve those rights.

## Verify storage, jobs and recovery

The HTTP verifier checks protection, pages, case replay, budget changes,
evidence withdrawal and unchanged source cases. It does not call providers or
prove that a remote disk survives restart.

On the chosen VM, complete a bounded authenticated run, note its saved result
and job ID, then recreate the application container without deleting volumes:

```sh
docker compose --env-file /etc/houselights.env -f deploy/free-vm/compose.yaml up -d --force-recreate houselights
```

Confirm the same saved result, job events and idempotent reconnect remain
available. Never use `down -v` on the real deployment.

Create and verify a private backup:

```sh
docker compose --env-file /etc/houselights.env -f deploy/free-vm/compose.yaml exec -T houselights node scripts/backup.mjs create /var/data/houselights/backup-RELEASE
docker compose --env-file /etc/houselights.env -f deploy/free-vm/compose.yaml exec -T houselights node scripts/backup.mjs verify /var/data/houselights/backup-RELEASE /tmp/restore-RELEASE
```

Copy a verified backup to a separate private location. A backup on the same
disk does not protect against losing that disk. Repeat bounded real-provider
checks and an external-browser walkthrough after deployment changes. The
20 October deployment's completed checks are recorded separately from this
repeatable runbook.

## CI scope and cost

Run an isolated local process-restart rehearsal without Docker:

```sh
npm run release:rehearse -- artifacts/new-release-rehearsal
```

It creates a new directory, strips provider credentials from the child runtime,
disables model calls, seeds the public cases, tests HTTP access, completes a
proof job, restarts only its own child process, checks persistence and verifies
a backup/restore. It never stops the existing development server or touches
the original database. Reports distinguish a local rehearsal from a hosted test.

The release workflow uses standard Ubuntu x86 and native ARM64 GitHub Actions runners only when
the repository is public. GitHub documents that
[standard runners are free for public repositories](https://docs.github.com/en/billing/concepts/product-billing/github-actions).
The workflow uploads no artifacts, creates no package cache, publishes no image
and deploys no service. It uses synthetic runtime mode with the model disabled
and no provider credentials.

It builds the actual Linux image, tests protected public routes, completes a
zero-provider proof job, replaces the container while retaining its volume, and
checks decisions, events, idempotency and a backup/restore. Passing CI validates
that environment; it does not establish a live VM, DNS, TLS or public uptime.

On 20 October 2026, [release run 39469596796](https://github.com/codewithanshuman/houselights/actions/runs/39469596796)
passed every step on both architectures for the deployed commit
`30f86d59b7fa640fc73d016258f7ebd5d0cea4ed`, including all 233 tests.
CI used isolated storage and disabled provider calls. The separate Oracle
deployment supplied the public HTTPS and live-provider evidence. The earlier
`c95b534` attempt failed six API tests because the organizer fixture leaked into
the unit-test environment; scoping that fixture to container steps fixed the
failure before deployment.

Cloudflare Quick Tunnels are not treated as the final host: their URLs are
temporary, availability depends on the local PC, and
[they do not support server-sent events](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/),
which an existing memo workflow uses.
