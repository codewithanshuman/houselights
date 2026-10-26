# Sharing an existing Oracle server

## Deployment of e21f563 — 26 October 2026

The public host runs `e21f563eff0fe035a31dcff472c15bbcb67bd74d`, and `/healthz` over public HTTPS reports it with `"diskOk":true`. The release is the purple and white redesign:
- every page except the landing page and the 404 page sits in one app sidebar shell, including the Slate studio, whose eight views are nested under its row;
- the recorded workspace session is a file-browser dashboard;
- the Booking Desk prints its decision on the owner's ticket art and has a new hero, nav and bridge footer;
- the 404 page is "Lost in music".

- **Before the switch:** the backup `pre-e21f563` passed an isolated restore (status verified, integrity ok), and a copy is held off-host. The running image was tagged `houselights-shared:pre-e21f563`. The rollback drill ran that image on a restored database copy: it reported `8a79b98`, served 12 cases and logged no errors, and it was removed afterwards. CI passed on the commit, including the regenerated Linux visual baselines.
- **Switch:** exact checkout, secret scan clean, only `RELEASE_COMMIT` changed, capped build. The Caddyfile is unchanged, so only the app container was recreated. Every other container and the livestream PID were unchanged. Disk use is 87%.
- **Checks:**
  - `release:verify` passed all 86 checks. Every page returns 200 and the 404 page returns 404. The sidebar is served on app pages, and the footer only on the landing page. Private routes still return 401.
  - In Chromium, Firefox and WebKit at phone and desktop sizes:
    - the Booking Desk shows the bill on the ticket and flips it with Qloo off;
    - the receipt sheet opens and closes on Escape;
    - the workspace folders open their steps;
    - the Slate studio lists its eight views;
    - no page overflows.
  - Two console messages in that run came from the script leaving pages mid-load: an aborted font download in Firefox and one refused stylesheet in WebKit. A settled per-page probe of five pages in WebKit and Firefox logged no errors.
  - **One live "Plan a show" run on production**, through the page: Austin, fans of Khruangbin, $25,000, 3 acts. It took 13.4 seconds and 11 Qloo calls. It booked SAULT + KOKOROKO + Arc De Soleil for $19,000 (estimated fees, $6,000 under budget). With Qloo off, the same rules book Mildlife + Common Saints + Robohands for $8,000. No console errors.

**Rollback:** tag `houselights-shared:pre-e21f563` as `houselights-shared:local`, set `RELEASE_COMMIT=8a79b989114ddbdbe5f4b0e93b9270ac94006271`, check out that commit, then run `up --no-build -d houselights` with both Compose files.

## Deployment of 8a79b98 — 25 October 2026

The public host runs `8a79b989114ddbdbe5f4b0e93b9270ac94006271`. When the Qloo-off comparison is refused, the Booking Desk now says so and lets the switch retry, and the switch no longer stays flipped over an unchanged bill.

- **Before the switch:** the backup `pre-8a79b98` passed an isolated restore (status verified, integrity ok), and a copy is held off-host. The running image was tagged `houselights-shared:pre-8a79b98`. The rollback drill reported `7a9b224`, served 12 cases and logged no errors. CI passed.
- **Switch:** exact checkout, secret scan clean, only `RELEASE_COMMIT` changed, capped build. Only the app container was recreated; every other container and the livestream PID were unchanged. Disk use is 86%.
- **Checks:** `release:verify` passed all 86 checks.
  - Right after it, with this address's experiment limit used up, the switch was refused and correctly stayed on.
  - A minute later, Chromium, Firefox and WebKit at phone and desktop sizes all showed the bill, flipped it with Qloo off and opened receipts, with no overflow and no console errors.

**Rollback:** tag `houselights-shared:pre-8a79b98` as `houselights-shared:local`, set `RELEASE_COMMIT=7a9b2241f8737cbff76fca3060a68f27c5ed8784`, check out that commit, then run `up --no-build -d houselights` with both Compose files.

## Deployment of 7a9b224 — 25 October 2026

The public host runs `7a9b2241f8737cbff76fca3060a68f27c5ed8784`, and `/healthz` over public HTTPS reports it with `"diskOk":true`. The release rebuilds the Booking Desk around "Plan a show", adds the public live-plan route `POST /api/plan`, and keeps the previous page as `/desk.html`.

- **Before the switch:**
  - The backup `pre-7a9b224` passed an isolated restore (status verified, integrity ok). A copy is held off-host.
  - The running image was tagged `houselights-shared:pre-7a9b224`.
  - Rollback drill: that image ran on a restored database copy. It reported `94deec6`, served 12 cases and logged no errors, and it was removed afterwards.
  - CI passed on the commit.
- **Switch:**
  - Exact checkout, secret scan clean, only `RELEASE_COMMIT` changed, capped build.
  - Only the app container was recreated, because the Caddyfile is unchanged.
  - Every other container and the livestream PID were unchanged. Disk use is 86%.
- **Checks:**
  - `release:verify` passed all 86 checks, including the new plan-form check. An immediate second run hit the per-IP limit of 20 experiments a minute, as before.
  - In Chromium, Firefox and WebKit, at phone and desktop sizes, the new Booking Desk shows the featured bill, and the Qloo switch changes it. The receipt drawer opens, nothing overflows and no page logs a console error.
  - Lighthouse on the live Booking Desk: 99 on mobile (LCP 1.7 s, CLS 0.014) and 100 on desktop. Accessibility scored 100 on both.
  - **One live "Plan a show" run on production**, through the page: Austin, fans of Khruangbin, $25,000, 3 acts. It took 13.7 seconds and 11 Qloo calls. It booked SAULT + Glass Beams + Common Saints for $17,500 (estimated fees). With Qloo off, the same rules book Mildlife + Common Saints + Robohands for $8,000.
- **Issue found:** the plan's first Qloo-off request was refused with 429, because the verification runs had just used this address's experiment limit. The note then stayed on "Checking…". The page now says the comparison could not load and lets the switch retry; fixed in `8a79b98` (above).

**Rollback:** tag `houselights-shared:pre-7a9b224` as `houselights-shared:local`, set `RELEASE_COMMIT=94deec6f6b022a6c94082041694d92413d97ec8a`, check out that commit, then run `up --no-build -d houselights` with both Compose files.

## Deployment of 94deec6 — 25 October 2026

The public host runs `94deec6f6b022a6c94082041694d92413d97ec8a`, and `/healthz` over public HTTPS reports it with `"diskOk":true`. The release fixes the regression found after `d997b60`: in-page jumps now land below the sticky step bar. On screens under 1,300 px tall, the experiment form now scrolls with the page instead of staying fixed.

- **Before the switch:** the backup `pre-94deec6` passed an isolated restore (status verified, integrity ok), and a copy is held off-host. The running image was tagged `houselights-shared:pre-94deec6`. The rollback drill ran that image on a restored database copy: it reported `d997b60`, served 12 cases and logged no errors, and it was removed afterwards. CI passed on the commit.
- **Switch:** exact checkout, secret scan clean, only `RELEASE_COMMIT` changed, capped build. Only the app container was recreated, because the Caddyfile is unchanged. Every other container, including Caddy, and the livestream PID were unchanged. Disk use is 85%.
- **Checks:** `release:verify` passed. zstd compression and HSTS are served, and the new CSS is live.
  - "Try a budget cut ↓" lands visible below the step bar in Chromium, Firefox and WebKit, at phone and desktop sizes, with and without reduced motion. That is 12 of 12 combinations, with no console errors.
  - At 1280×720 the cancellation cards are reachable, the Qloo switch changes the bill and the receipt drawer opens.
  - Lighthouse on the Booking Desk: desktop 100. Mobile ranged from 56 to 75 across runs (LCP 2.8–4.1 s). CLS was 0.005, except one run at 0.113, when the Plex 500/700 fonts arrived after first paint.
- **Residual risk:** below-the-fold sections are laid out on the first click or key press. A purely programmatic scroll before any interaction can land short of its target.

**Rollback:** tag `houselights-shared:pre-94deec6` as `houselights-shared:local`, set `RELEASE_COMMIT=d997b606307505dd44a3b6cecf592f1887169483`, check out that commit, then run `up --no-build -d houselights` with both Compose files.

## Deployment of d997b60 — 25 October 2026

The public host runs `d997b606307505dd44a3b6cecf592f1887169483`, and `/healthz` over public HTTPS reports it with `"diskOk":true`. The release adds the server-rendered navigation, the inlined claim table, deferred below-the-fold layout, subset fonts, the cached-experiment rate-limit fix, and the Caddyfile change (zstd/gzip compression and HSTS).

**Before the switch (backup, restore and rollback drill, redone on this release)**

- The online backup `pre-d997b60` passed an isolated restore: status verified, integrity ok. A copy is held off-host.
- The release environment, the service list and the livestream PID (1317979) were saved.
- The running image was tagged `houselights-shared:pre-d997b60`.
- Rollback drill: that image ran on a restored copy of the database at loopback port 18091. It reported `02f7228`, served 12 cases and `judge.html`, and logged no errors. The drill container was then removed.
- The new Caddyfile passed `caddy validate` in a throwaway `caddy:2` container with no network.

**Switch**

- Exact checkout with nothing modified. The tracked tree contains none of the provider keys or the organizer token. Only `RELEASE_COMMIT` changed in the release environment.
- Capped build, then the app container was recreated. The Caddy container was force-recreated so it reads the new Caddyfile (a file bind mount keeps the old file until then). Public HTTPS answered again within about 2 seconds, and the certificate was kept in the `caddy-data` volume.
- Every other container and the livestream PID were unchanged. Disk use is 85%.

**Checks after the deployment**

- `npm run release:verify` passed. HTML and JSON are served with zstd or gzip, stamped CSS and JS are immutable for a year, and HSTS is set.
- Private routes return 401. The 404 page has the navigation.
- Lighthouse on the live site, Booking Desk: 86 on mobile (LCP 2.7 s, CLS 0.005) and 99 on desktop (LCP 0.7 s). Evidence page: 81 on mobile and 99 on desktop. Accessibility scored 100 on all four runs.
- In headless Chromium, Firefox and WebKit on the live site, at phone and desktop sizes, the Qloo switch changes the bill, the receipt drawer opens and the Autopilot panel loads its styles lazily. No page logged a console error.
- **Regression found:** on this release, "Try a budget cut ↓" scrolls its button under the sticky step bar. On `02f7228` it landed mid-screen only because content above it moved afterwards. Focus still goes to the button. Fixed by `6590a3a`, deployed in `94deec6` (above).

**Rollback:** tag `houselights-shared:pre-d997b60` as `houselights-shared:local`, set `RELEASE_COMMIT=02f7228e0203bbc2b714a54f678c6b53a34e58b0`, check out that commit, then run `up --no-build -d houselights` with both Compose files. Then force-recreate the `https` service so Caddy reads that commit's Caddyfile.

## Deployments of 764824d and 02f7228 — 24 October 2026

The public host runs `02f7228e0203bbc2b714a54f678c6b53a34e58b0`, and `/healthz` over public HTTPS reports it.

- **`764824d`** added the four-step Booking Desk path, WebP/WOFF2 assets, demoted labs and the festival-policy cap.
- **`02f7228`** stops the sticky experiment form from covering opened receipts.

Both used the same procedure as below:

- a verified backup (`pre-764824d`, `pre-02f7228`);
- a rollback drill on the previous image;
- the exact checkout and secret scan;
- a capped build;
- an app-only container switch. Every other container and the livestream PID were unchanged.

**Checks after the deployment**

- `npm run release:verify` passed 84 checks.
- A second, immediate run failed only its experiment checks, with HTTP 429 from the per-IP limit of 20 experiments per minute. It passed 84/84 once the window reset.
- In real Chrome on the live site, the four steps ran end to end: Kiwanuka + Sault became Rakei + Hiatus Kaiyote, and receipt `r9 · rank · ok` opened.
- The opened receipt does not overlap the experiment form at 1280, 900 or 375 px. There was no page overflow and there were no page errors.
- The deployed optimizer rejects a 20 × 5 festival-policy brief in 1 ms.
- The uptime monitor's checks pass.
- Disk use is 84%.

**Rollback:** tag `houselights-shared:pre-02f7228` as `houselights-shared:local`, set `RELEASE_COMMIT=764824d7a3b2e9bf7ea2c437de80fbbedf2c130e`, check out that commit, then run `up --no-build -d houselights` with both Compose files.

## Deployment of bd376df — 24 October 2026

The public host runs `bd376df6285ddb1665a06f4826926e2ff939bf18`, the competition-quality milestone, and `/healthz` over public HTTPS reports that release. The same procedure as below was used:

- **Before the switch:** backups `pre-milestone-6da1532` and `pre-bd376df` were verified and copied off-host. Rollback drills ran on both previous images. Only the application container was recreated, and every other container and the livestream PID were unchanged.

`6da1532` was live briefly before `bd376df`. On `6da1532`, the first-screen with/without-Qloo comparison used the shared experiment quota and fell back to "could not be loaded" once that quota was spent. `bd376df` serves the comparison as a static file instead.

**Checks after the deployment**

- `npm run release:verify` passed 84 checks, including the new `qloo-contribution-published` check.
- Anonymous reads and writes, wrong tokens and the live Autopilot route are all refused.
- The deployed `researchOutcome` labels `partial` and `degraded` Qloo answers and timeouts as partial.
- In a real browser, the comparison loaded while my IP's experiment quota was exhausted.
- The log shows no errors.

**Disk cleanup (authorized by the owner)**

- **Removed:** 12 old `houselights-shared:pre-*` tags and 10 untagged Houselights builds, matched by the image's `/app` and `node server/index.mjs` signature.
- **Kept:** `local`, `pre-bd376df`, `pre-milestone-6da1532`, `pre-review4-62d4fc2`, `pre-audit-cb9ce4a` and every database backup.
- **Not touched:** the StudyLion images and containers.
- **Disk use:** 95% before the cleanup, 78% after it, and 81% after the build.

**Rollback:** tag `houselights-shared:pre-bd376df` as `houselights-shared:local`, set `RELEASE_COMMIT=6da153287a8c608609c403b7c34d15e6d23a582c`, check out that commit, then run `up --no-build -d houselights` with both Compose files.

## Deployment of 62d4fc2 — 24 October 2026

The public host runs application commit
`62d4fc2321d4fcab0bb4fbc44e3e93b8bb0124ab` (review 4 corrections), and `/healthz` over public HTTPS reports that release. It replaced `cb9ce4a`, using the same procedure as below.

**Before the switch**

- The online backup `backups/pre-review4-62d4fc2` passed an isolated restore with integrity ok. A copy is held off-host.
- The release environment, the service list and the livestream PID were saved.
- The running image was tagged `houselights-shared:pre-review4-62d4fc2`.
- A rollback drill started that image on the restored database in a separate, loopback-only container. It served all 12 cases and every page with no errors, and was then removed.

**Build and switch**

- The image was built in the capped builder, which was stopped afterwards.
- Only the application container was recreated. Every other container kept its ID, and the livestream PID was unchanged.

**Checks after the deployment**

- `npm run release:verify` against the public URL passed 83 checks.
- The deployed `researchOutcome` was called with simulated receipts:
  - `partial` and `degraded` Qloo answers and timeouts → `partial`.
  - `ok` and `empty` answers → `complete`.
  - Before this release, partial and degraded answers produced `complete`.
- The served workspace code contains the corrected warning and status line.
- In a real browser at 1366 px and 375 px:
  - The decision glance, the booking-desk budget cut and the zero-call Autopilot re-plan worked.
  - The organizer example rendered.
  - No page overflowed horizontally.
- An organizer session over HTTPS passed:
  - Anonymous and wrong-token requests were refused.
  - Live research completed with 5 of 24 calls, none incomplete.
  - Zero-call decisions on two revisions, the comparison and both packet formats worked.
- No table lost rows across the switch. The log had no errors, and the disk was 95% full (2.5 GB free).

**Not verified:** a real partial answer from Qloo (none occurred), load from concurrent users, and a VM reboot.

**Rollback:** tag `houselights-shared:pre-review4-62d4fc2` as `houselights-shared:local`, set `RELEASE_COMMIT=cb9ce4a8ff7b0fab377826146459c0668a6f9204`, check out that commit, then run `up --no-build -d houselights` with both Compose files.

## Deployment of cb9ce4a — 24 October 2026

The public host now runs application commit
`cb9ce4a8ff7b0fab377826146459c0668a6f9204`, and `/healthz` over public HTTPS reports that release. It replaced `c5028158`.

**Before the switch**

- An online SQLite backup passed an isolated restore: 22 tables, integrity ok. A copy is held off-host.
- The release environment and the service list were saved.
- The running image was tagged `houselights-shared:pre-audit-cb9ce4a`.
- A rollback drill started that image on the restored database in a separate, loopback-only container. It served all cases and pages with no errors, and was then removed.

**Build and switch**

- The image was built in the existing capped builder (0.5 CPU / 2 GiB), which was stopped afterwards.
- Only the application container was recreated. Every other container kept its ID, and the livestream process ID was unchanged.

**Checks after the deployment**

- `npm run release:verify` against the public URL passed 83 checks.
- HTTPS uses a Let's Encrypt certificate, valid until 18 January 2027, and HTTP redirects to HTTPS.
- In a real browser at 1366 px and 375 px:
  - The decision glance, the booking-desk budget cut and the zero-call Autopilot re-plan all worked.
  - The organizer example rendered.
  - No page overflowed horizontally, and there were no console errors.
- An organizer session over HTTPS passed:
  - It created an event and ran live research: complete, 16 of 24 Qloo calls, none failed.
  - Zero-call decisions on two revisions, the comparison, and Markdown and HTML packets all worked. The HTML packet has a strict CSP.
  - Anonymous and wrong-token requests were refused.
- No table lost rows across the switch.

**Not verified**

- Partial labelling with a real Qloo failure: Qloo answered every call during the check. Partial labelling is covered by unit tests and by the earlier local captures, where Qloo failed.
- Load from concurrent users.
- A VM reboot.

**Rollback**

1. Tag `houselights-shared:pre-audit-cb9ce4a` as `houselights-shared:local`.
2. Set `RELEASE_COMMIT=c5028158e7c6cf7094fe03b2ee609d3ada15decf`.
3. Check out that commit.
4. Run `up --no-build -d houselights` with both Compose files.

If the data must also be restored, use `backups/pre-audit-cb9ce4a`.

## Deployment — 22 October 2026

[Houselights is publicly available](https://houselights.80-225-218-239.sslip.io)
from the existing Ubuntu 22.04 ARM A1 VM with 2 OCPUs and 12 GB RAM. The
22 October public evidence release was deployed from application commit
`a247916edf490ca03abfc9e91f80c9e342b43780`. The deployment uses
`shared.compose.yaml` with `shared-public.override.yaml`: the application is
limited to 0.5 CPU/1536 MiB and its separate Caddy HTTPS proxy to
0.1 CPU/128 MiB. The actual Docker build ran in a separately limited
0.5-CPU/2-GiB builder, which was stopped afterward.

No cloud resources were purchased or provisioned, and no Oracle console or
firewall changes were needed. The existing bot, livestream and tunnel were not
stopped or reconfigured. The five original container IDs/start times and the
existing ffmpeg process ID remained unchanged after deployment. That confirms
process continuity, not independently measured livestream quality.

Public HTTP and browser checks, earlier bounded live Qloo/Groq requests, saved proof
data after application-container recreation, and server/off-host
backup-restores passed. The hostname relies on free third-party DNS and the
VM retaining its public IP. Account billing/free eligibility, long-term uptime
and VM-reboot recovery remain unverified; no VM reboot was performed.
See the [deployment evidence](live-validation.md#public-evidence-release--22-october-2026).

## Capacity requirements

Houselights can share a Linux VM with existing workloads if measurements show
enough spare capacity. A 2-OCPU, 12-GB A1 configuration alone does not establish
that capacity. Oracle's [current Always Free documentation](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
lists that allocation for A1; confirm remaining allowance in the account before
creating another instance. Do not resize the active livestream server merely to
make room for a second VM.

## Inspect before changing the server

From an existing SSH session, run the read-only script from a reviewed checkout:

```sh
sh scripts/host-capacity.sh
```

It reports architecture, CPU count, memory, disk space, a short CPU/I/O sample,
listening TCP endpoints and Docker availability. It does not install software,
read credentials, restart services, print process arguments or change the host.
Review the VM's normal and peak livestream metrics as well; five samples cannot
establish peak headroom.

The existing web proxy and port ownership must be identified before choosing
ingress. A public IP and instance list do not supply SSH access. Use an existing
SSH alias or the owner's login and local key file; keep key contents private.
Only inspect explicitly provided connection configuration.

## Deployment profile

`deploy/free-vm/shared.compose.yaml` contains the application only. It binds to
`127.0.0.1:18080`, leaves ports 80/443 available for a separately configured
proxy, and uses its own Compose project and named data volume. It sets initial
runtime limits of 0.5 CPU, 1536 MiB RAM, no extra swap allowance, 256
processes/threads and three 10-MB container log files. These are starting limits
to validate under load, not measured production requirements or a guarantee of
no interference. The database and Docker image storage are not limited by log
rotation.

Use the private configuration described in [free-hosting.md](free-hosting.md).
After inspecting headroom, the runtime command is:

```sh
docker compose --env-file /etc/houselights.env -f deploy/free-vm/shared.compose.yaml up --build -d
```

**The runtime limits do not limit the image build.** Schedule the build during
confirmed spare capacity or load an image built for the same architecture off
the live server, then use `up --no-build -d`. A dedicated Docker-container
BuildKit builder can also cap its own CPU and memory; verify those limits before
building. Do not prune existing Docker images or volumes to make space without
identifying their owners.

For public access, a host HTTPS proxy or an existing named tunnel must route a
dedicated Houselights hostname to `127.0.0.1:18080`. For a Caddy process running
directly on the host, the additional site block is:

```caddyfile
houselights.YOUR_DOMAIN {
    reverse_proxy 127.0.0.1:18080
}
```

This is a separate site block, not a replacement for existing configuration.
Validate the complete configuration before a graceful reload. If the existing
proxy runs inside Docker, its loopback is not the host loopback; inspect its
network and prepare the appropriate route instead of applying this snippet.
Keep streaming responses unbuffered and preserve Authorization headers. Proxy
trust is configured for one ingress hop; verify the actual chain.

If ports 80/443 are unused, `shared-public.override.yaml` adds a separate,
bounded Caddy container without modifying an existing tunnel:

```sh
docker compose --env-file /etc/houselights.env -f deploy/free-vm/shared.compose.yaml -f deploy/free-vm/shared-public.override.yaml up --no-build -d
```

This is the active public profile. Retain both Compose files when maintaining
the deployment. The Caddy container has separate certificate/config volumes,
a 0.1 CPU limit, 128 MiB RAM with no extra swap, 64 PIDs and bounded logs.

For a demo without an owned domain, [sslip.io/nip.io](https://nip.io/) can resolve
a hostname containing the server's public IP. Set `PUBLIC_HOSTNAME` to that
hostname only after confirming its DNS resolution. This relies on a third-party
DNS service and on the server keeping that IP; it is not domain ownership.
Certificate issuance needs external reachability and remains subject to the
CA's limits. Verify both the VM's firewall and OCI security lists/network
security groups. Do not open the application or database ports to the internet.

Run the release HTTP, saved-job restart and backup/restore checks from the
free-hosting runbook using `shared.compose.yaml` in every command. Also confirm
that the bot and livestream still behave normally during a bounded Houselights
run. No source-controlled command logs into, resizes or restarts an existing
Oracle instance automatically.

## ARM verification

The release workflow runs on standard public-repository x86 and native ARM64
GitHub runners. [Run 39469596796](https://github.com/codewithanshuman/houselights/actions/runs/39469596796)
passed every step on both architectures for the deployed commit, including
233 tests, image builds, actual container limits and loopback binding, a
completed proof job, retained volume contents and backup/restore. Provider
calls were disabled in CI. Separate Oracle/public checks established DNS,
HTTPS, provider transport and application-container persistence for this
deployment; neither set of checks proves long-term host capacity or uptime.
