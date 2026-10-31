# Sharing an existing Oracle server

## Deployment of 06e4950 — 31 October 2026

The public host runs `06e4950`, and `/healthz` over public HTTPS reports it. This release changes the interface only. The backup `pre-06e4950` was verified and copied off-host, the rollback drill reported `65cbb72` with 12 cases and no errors, other containers and the stream were unchanged, and all 90 release checks passed. Houselights keeps `pre-06e4950` and `pre-65cbb72`. Disk is at 83%.

**Rollback:** tag `houselights-shared:pre-06e4950` as `houselights-shared:local`, set `RELEASE_COMMIT` to the full `65cbb72` commit, and recreate only the Houselights service.

## Deployment of 65cbb72 — 31 October 2026

The public host runs `65cbb72`, and `/healthz` over public HTTPS reports it. Releases `f305b6b`, `0861b9d`, `8fcc4ad`, `70a4cff`, `e1e45d0` and `1b30b52` went out earlier the same night, each with the same procedure. Together they add the MusicBrainz act check, the budget-aware Qloo search through Insights, rooms to book, Tell the agent, why-not answers and the overrule, and the money on the promoter brief.

- **Before the switch:** the backup `pre-65cbb72` passed an isolated restore, and a copy is held off-host. The rollback drill reported `1b30b52`, served 12 cases and logged no errors.
- **Switch:** only `RELEASE_COMMIT` changed in the release file. The other containers and the stream process were unchanged.
- **After the switch:** all 90 release checks passed from outside. A fresh Delhi plan on real Qloo removed Sidhu Moose Wala with 10 of 10 acts checked, and listed rooms and the money on the brief, with no page errors. The previous release passed Chromium, Firefox and WebKit at both widths and the content-security probe.
- **Found on real services only:** three in ten MusicBrainz requests from this host return 503, Qloo place results carry no coordinates, and the language model's answer was not being unpacked. Fixtures showed none of these.
- **Disk:** Houselights keeps `pre-65cbb72` and `pre-1b30b52`. Disk is at 83% (7.7 GB free).

**Rollback:** tag `houselights-shared:pre-65cbb72` as `houselights-shared:local`, set `RELEASE_COMMIT` to the full `1b30b52` commit from `git rev-parse 1b30b52`, check out that commit, then run `up --no-build -d houselights` with both Compose files.

## Deployment of 2a78395 — 31 October 2026

The public host runs `2a78395`, and `/healthz` over public HTTPS reports it. Visitors can now use the Demand Lab, Audience Twin, event portfolio and Festival GM from a real saved plan, with no token or pasted ID. The outcomes ledger, LLM control, themed-night research, Proof Lab experiments and the organizer workspace stay locked. `dabe11f` went out first; on real Qloo its Festival GM still returned 401 because research went through the queued runs route, which the mock tests did not show.

- **Before the switch:** the backup `pre-2a78395` passed an isolated restore, and a copy is held off-host. The rollback drill reported `dabe11f`, served 12 cases and logged no errors.
- **Switch:** only `RELEASE_COMMIT` changed in the release file. The other containers and the stream process were unchanged.
- **After the switch:** all 90 release checks passed from outside. As a visitor on real Qloo, the Demand Lab, Audience Twin, a two-night portfolio and a Festival GM run all completed, and the locked routes still returned 401.
- **Disk:** `pre-a85ab39` was removed, keeping `pre-2a78395` and `pre-dabe11f`. Disk is at 82% (8.6 GB free).

**Rollback:** tag `houselights-shared:pre-2a78395` as `houselights-shared:local`, set `RELEASE_COMMIT=dabe11fa7d5df6d0a6783b01476863288b73e6ac`, check out that commit, then run `up --no-build -d houselights` with both Compose files.

## Deployment of a85ab39 — 30 October 2026

The public host runs `a85ab39`, and `/healthz` over public HTTPS reports it. It fixes five bugs from a sweep of the live site: a re-plan now works to the budget in force, changing currency moves an untouched budget, each currency has its own default ticket price, place names show each part once, and the 404 page returns to the landing page.

- **Before the switch:** the backup `pre-a85ab39` passed an isolated restore, and a copy is held off-host. The rollback drill reported `5fcd49a`, served 12 cases and logged no errors.
- **Switch:** only `RELEASE_COMMIT` changed in the release file. The other containers and the stream process were unchanged.
- **After the switch:** all 90 release checks passed from outside. Chromium, Firefox and WebKit passed at 1440 and 390 wide with no overflow, and the content-security probe was clean. A fresh Qloo plan for Nashik in rupees completed with its re-plan, brief and finance run, and a re-plan at 80% of the budget stayed within it.
- **Disk:** `pre-5985709` was removed, keeping `pre-a85ab39` and `pre-5fcd49a`. Disk is at 82% (8.2 GB free).

**Rollback:** tag `houselights-shared:pre-a85ab39` as `houselights-shared:local`, set `RELEASE_COMMIT=5fcd49a8e8fe854e0a132ae4d6ea66335cad6ef0`, check out that commit, then run `up --no-build -d houselights` with both Compose files.

## Deployment of 5fcd49a — 30 October 2026

The public host runs `5fcd49a`, and `/healthz` over public HTTPS reports it. It adds the agent re-plan for a cancelled act, the one-page promoter brief, plans in USD, INR, EUR or GBP (rates from Frankfurter), and the clean gradient call to action. Releases `5d64157` and `5985709` went out earlier the same evening; the re-plan failed on real Qloo in both, refusing with "could not rank every candidate" and showing nothing wrong. Qloo ranks at most ten options and leaves a signal out of its own ranking. Both limits are now respected and the mock enforces them.

- **Before the switch:** the backup `pre-5fcd49a` passed an isolated restore, and a copy is held off-host. The rollback drill reported `5985709`, served 12 cases and logged no errors.
- **CI:** CI passed on the commit.
- **Switch:** exact checkout, secret scan clean, capped build before the switch, only `RELEASE_COMMIT` changed, only the app container recreated, every other container and the livestream PID unchanged.
- **Checks:** `release:verify` passed all 90 checks; Chromium, Firefox and WebKit at phone and desktop sizes showed the featured bill with no overflow; the settled console probe logged no errors. One live plan (Nashik, fans of Arijit Singh, ₹1,500,000, 2 acts) booked Shreya Ghoshal + Amit Trivedi for ₹762,160 at 1 USD = 95.27 INR, with the location confirmed. Dropping Shreya Ghoshal rebooked Amit Trivedi + Ankit Tiwari through a live Qloo search, and the brief and Financial Risk ran on the same plan, with no console errors.
- **Disk:** old Houselights rollback images were removed, keeping `pre-5fcd49a` and `pre-5985709`. Disk went from 90% to 82% (8.3 GB free).

**Rollback:** tag `houselights-shared:pre-5fcd49a` as `houselights-shared:local`, set `RELEASE_COMMIT=59857092e0934f6658be46427c5c402a7f98f082`, check out that commit, then run `up --no-build -d houselights` with both Compose files.

## Deployment of 5d86308 — 30 October 2026

The public host runs `5d86308`, and `/healthz` over public HTTPS reports it. The main call to action is now a plain solid purple button with a small arrow that nudges on hover. The 404 page keeps its hand-drawn button.

- **Before the switch:** the backup `pre-5d86308` passed an isolated restore, and a copy is held off-host. The running image was tagged `houselights-shared:pre-5d86308`. The rollback drill reported `a133b80`, served 12 cases and logged no errors.
- **CI:** CI passed on the commit, including the Linux visual baselines.
- **Switch:** exact checkout, secret scan clean, capped build before the switch, only `RELEASE_COMMIT` changed, only the app container recreated, every other container and the livestream PID unchanged.
- **Checks:** `release:verify` passed all 90 checks. Chromium, Firefox and WebKit at phone and desktop sizes showed the featured bill with no overflow, and the settled console probe logged no errors.

**Rollback:** tag `houselights-shared:pre-5d86308` as `houselights-shared:local`, set `RELEASE_COMMIT=a133b80ff3db2958a35ced567926b7597e3d7f69`, check out that commit, then run `up --no-build -d houselights` with both Compose files.

## Deployment of a133b80 — 30 October 2026

The public host runs `a133b80`, and `/healthz` over public HTTPS reports it. The main call to action is now a ticket whose stub tears on hover and press (the 404 page keeps its button), the ticket's stats sit clear of the band, and the landing fallback is back to the real 18 Qloo calls.

- **Before the switch:** the backup `pre-a133b80` passed an isolated restore, and a copy is held off-host. The running image was tagged `houselights-shared:pre-a133b80`. The rollback drill reported `a8bc041`, served 12 cases and logged no errors.
- **CI:** CI passed on the commit. The previous commit, `366cc26`, failed one browser test on one of two CI machines: a layout test read the ticket's position before it had rendered. That was a timing race in the test, which has since been hardened, not a site fault.
- **Switch:** exact checkout, secret scan clean, capped build before the switch, only `RELEASE_COMMIT` changed, only the app container recreated, every other container and the livestream PID unchanged.
- **Checks:** `release:verify` passed all 90 checks. Chromium, Firefox and WebKit at phone and desktop sizes showed the featured bill with no overflow, and the settled console probe logged no errors.

**Rollback:** tag `houselights-shared:pre-a133b80` as `houselights-shared:local`, set `RELEASE_COMMIT=a8bc041c8a8cef09595af741bae50c5a3974f335`, check out that commit, then run `up --no-build -d houselights` with both Compose files.

## Deployment of a8bc041 — 30 October 2026

The public host runs `a8bc041c8a8cef09595af741bae50c5a3974f335`, and `/healthz` over public HTTPS reports it. Each plan now has Why this bill (sentences from the saved plan, citation chips that open receipts, a confidence meter, real alternatives), a bill difference for the Qloo switch and any change, and agent calls that open to what Qloo returned.

- **Before the switch:** the backup `pre-a8bc041` passed an isolated restore, and a copy is held off-host. The running image was tagged `houselights-shared:pre-a8bc041`. The rollback drill reported `d360eec`, served 12 cases and logged no errors.
- **CI:** CI passed on the commit, including the Linux visual baselines.
- **Switch:** exact checkout, secret scan clean, capped build before the switch, only `RELEASE_COMMIT` changed, only the app container recreated, every other container and the livestream PID unchanged.
- **Checks:** `release:verify` passed all 90 checks. Chromium, Firefox and WebKit at phone and desktop sizes showed the featured bill with no overflow, and the settled console probe logged no errors. One live plan (Pune, fans of Prateek Kuhad, $20,000, 2 acts) booked The Local Train + Anuv Jain for $3,000, with the location confirmed, 4 citations, the bill difference and 5 expandable agent calls, and no console errors.

**Rollback:** tag `houselights-shared:pre-a8bc041` as `houselights-shared:local`, set `RELEASE_COMMIT=d360eece7a9e78ee4ea0aece348c2d4756d6be1d`, check out that commit, then run `up --no-build -d houselights` with both Compose files.

## Deployment of d360eec — 30 October 2026

The public host runs `d360eece7a9e78ee4ea0aece348c2d4756d6be1d`, and `/healthz` over public HTTPS reports it. The main call to action is now a dark bar with a purple square and a dot-matrix arrow; on hover the square slides across and a row of arrows ripples. The 404 page keeps its hand-drawn button.

- **Before the switch:** the backup `pre-d360eec` passed an isolated restore, and a copy is held off-host. The running image was tagged `houselights-shared:pre-d360eec`. The rollback drill reported `2f693d0`, served 12 cases and logged no errors.
- **CI:** CI passed on the commit, including the Linux visual baselines.
- **Switch:** exact checkout, secret scan clean, capped build before the switch, only `RELEASE_COMMIT` changed, only the app container recreated, every other container and the livestream PID unchanged.
- **Checks:** `release:verify` passed all 90 checks. Chromium, Firefox and WebKit at phone and desktop sizes showed the featured bill with no overflow. The settled console probe logged no errors. The button was checked on the live site at rest and on hover.

**Rollback:** tag `houselights-shared:pre-d360eec` as `houselights-shared:local`, set `RELEASE_COMMIT=2f693d0274e0b004c7e31b19269a496e7887a3b2`, check out that commit, then run `up --no-build -d houselights` with both Compose files.

## Deployment of 2f693d0 — 30 October 2026

The public host runs `2f693d0274e0b004c7e31b19269a496e7887a3b2`, and `/healthz` over public HTTPS reports it. The landing page (`home.html`, served at `/`) is split from the product (`judge.html`, the Booking Desk), so shared `?plan=` and `#case` links keep working. Live plans confirm the place on OpenStreetMap before any Qloo call and measure Qloo's location data against it; a tile over 75 km away cannot count as local fans. Each real plan links to Financial Risk on that plan.

- **Before the switch:** the backup `pre-2f693d0` passed an isolated restore, and a copy is held off-host. The running image was tagged `houselights-shared:pre-2f693d0`. The rollback drill reported `f792410`, served 12 cases and logged no errors.
- **CI:** CI passed on the commit, including the Linux visual baselines.
- **Switch:** exact checkout, secret scan clean, capped build before the switch, only `RELEASE_COMMIT` changed, only the app container recreated, every other container and the livestream PID unchanged.
- **Checks:**
  - `release:verify` passed all 90 checks (two new: the landing page exists and holds no planner). `/` redirects to `/home.html`.
  - Chromium, Firefox and WebKit at phone and desktop sizes showed the featured bill with no overflow; the settled console probe logged no errors.
  - **Live location runs on production:** "Tiny Village Nowhere" was refused before any Qloo call. Akole, Maharashtra: nearest of 40 location results 114 km away, status `elsewhere`, 0 of 8 acts claimed local fans. Hallstatt, Austria: 1 of 20 results within 75 km, status `partly`, 1 of 8 acts claimed local fans. Sangamner, Maharashtra: 40 of 40 results within 75 km (median 11 km), status `this-place`.

**Rollback:** tag `houselights-shared:pre-2f693d0` as `houselights-shared:local`, set `RELEASE_COMMIT=f79241078039945280b102258fd8a44d4dfedf93`, check out that commit, then run `up --no-build -d houselights` with both Compose files.

## Deployment of f792410 — 30 October 2026

The public host runs `f79241078039945280b102258fd8a44d4dfedf93`, and `/healthz` over public HTTPS reports it. Features that were organizer-only or synthetic are now real for every visitor:
- **Slate studio:** anyone can build a live Qloo slate, re-optimize, stress-test and save a scenario (2 runs a minute, 40 a day shared; visitor runs are saved unpinned).
- **Financial Risk:** the synthetic "Pop A / Jazz A" illustration and `financial-demo.json` are removed. Every public scenario runs on a real Booking Desk plan's candidates, Qloo fit and fees, with stated venue, ticket, sell-through and cost assumptions. Identical runs are reused; free-form scenarios stay private.
- **Autopilot:** fresh research with live Qloo is public, capped at 10 calls and 1 run a minute (30 a day).

- **Before the switch:** the backup `pre-f792410` passed an isolated restore (status verified, integrity ok), and a copy is held off-host. The running image was tagged `houselights-shared:pre-f792410`. The rollback drill reported `997ebea`, served 12 cases and logged no errors.
- **CI:** CI passed on the commit, including the Linux visual baselines.
- **Switch:** exact checkout, secret scan clean, capped build before the switch, only `RELEASE_COMMIT` changed, only the app container recreated, every other container and the livestream PID unchanged.
- **Checks:**
  - `release:verify` passed all 88 checks (three checks now verify the new access rules: free-form financial jobs stay private, Autopilot fresh research is public, and the financial scenario runs on a published plan).
  - Chromium, Firefox and WebKit at phone and desktop sizes showed the featured bill with no overflow; the settled console probe logged no errors.
  - **As an anonymous visitor on production:** Financial Risk ran the New York plan (Michael Kiwanuka, Sault, Jordan Rakei, Hiatus Kaiyote…) through 10,000 scenarios in 17 seconds with no console errors. The Slate studio's London example built a live slate in 20.8 seconds (Caribou + BADBADNOTGOOD + Japanese Breakfast; 35 events). Autopilot fresh research made 6 live Qloo calls in 7 seconds and confirmed Michael Kiwanuka + Sault; a second run within the minute was refused with 429.

**Rollback:** tag `houselights-shared:pre-f792410` as `houselights-shared:local`, set `RELEASE_COMMIT=997ebea4b4d1bf346111b7f3dfde44bff067035c`, check out that commit, then run `up --no-build -d houselights` with both Compose files.

## Deployment of 997ebea — 30 October 2026

The public host runs `997ebea4b4d1bf346111b7f3dfde44bff067035c`, and `/healthz` over public HTTPS reports it (`"diskOk":true`). On the crowd map, a lead whose split between the booked acts is within two points of even now reads "Even split across the bill" instead of "Leans X · 50%".

- **Before the switch:** the backup `pre-997ebea` passed an isolated restore (status verified, integrity ok), and a copy is held off-host. The running image was tagged `houselights-shared:pre-997ebea`. The rollback drill reported `58cc22e`, served 12 cases and logged no errors.
- **CI:** CI passed on the commit, including the Linux visual baselines.
- **Switch:** exact checkout, secret scan clean, capped build completed before any change to the running service, only `RELEASE_COMMIT` changed. The Caddyfile is unchanged, so only the app container was recreated. Every other container and the livestream PID were unchanged.
- **Checks:** `release:verify` passed all 88 checks. Chromium, Firefox and WebKit at phone and desktop sizes showed the featured bill with no overflow. The settled per-page console probe logged no errors. The featured plan's saved crowd map shows the new labels.

**Rollback:** tag `houselights-shared:pre-997ebea` as `houselights-shared:local`, set `RELEASE_COMMIT=58cc22ebd46b2517a6957e9eee373752b61ee0b9`, check out that commit, then run `up --no-build -d houselights` with both Compose files.

## Deployment of 58cc22e — 30 October 2026

The public host ran `58cc22ebd46b2517a6957e9eee373752b61ee0b9`. It adds **Who this bill reaches**: after the optimizer books a bill, three Qloo calls use the booked acts as the signal and return sponsor leads (brands), places in the city and podcasts, with Qloo's explainability giving each booked act's share of every lead. The map is stored in a new `audience_reach` table beside the case, never inside its record. It is made once per plan, rate limited (3 per visitor every 10 minutes, 60 per day overall), and each lead links to its own Qloo receipt. A fresh live plan maps its crowd automatically; saved plans offer a button.

- **Before the switch:** 25 unused Houselights image tags were removed first (disk 97% to 81%); `pre-4f82269` and `pre-4c3a7cd` were kept, and nothing belonging to the other project on the host was touched. The backup `pre-58cc22e` passed an isolated restore, and a copy is held off-host. The rollback drill reported `4f82269`, served 12 cases and logged no errors.
- **CI:** CI passed on the commit.
- **Switch:** exact checkout, secret scan clean, capped build before the switch, only `RELEASE_COMMIT` changed, only the app container recreated, every other container and the livestream PID unchanged.
- **Checks:**
  - `release:verify` passed all 88 checks; the three engines showed the featured bill with no overflow; the settled console probe was clean.
  - **One live "Plan a show" run on production:** Austin, fans of Khruangbin and Leon Bridges, $30,000, 2 acts. It took 14.9 seconds and 12 Qloo calls and booked Black Pumas + Michael Kiwanuka for $21,000 (estimated fees); with Qloo off, Brittany Howard + The Teskey Brothers for $8,000. The crowd map appeared 1.9 seconds later: sponsor leads Patagonia, Discogs, Noon Pacific; places ACL Live, the Blanton Museum of Art and Cathedral of Junk (each mostly driven by Black Pumas); podcasts led by 2 Dope Queens. No console errors.
  - The featured New York plan was mapped once (3 Qloo calls): Vice, Noon Pacific and Rains as sponsor leads; the Hotel Chelsea and Chelsea Flea among places; Song Exploder among podcasts.

**Rollback:** tag `houselights-shared:pre-58cc22e` as `houselights-shared:local`, set `RELEASE_COMMIT=4f82269f3e15511cc9921409e7a7496d16aa6522`, check out that commit, then run `up --no-build -d houselights` with both Compose files. The `audience_reach` table is ignored by older releases.

## Deployment of 4f82269 — 29 October 2026

The public host runs `4f82269f3e15511cc9921409e7a7496d16aa6522`, and `/healthz` over public HTTPS reports it. It includes `2ac8104` (the research trail says "in the bill before checks" instead of "booked") and makes the analysis readable at a glance:
- a one-line verdict above "How solid is this bill?", each item linking to and opening its card;
- findings on each booked act (clear pick or coin flip with its rival, fee headroom, whether it was checked in depth), and the entry fee for every other candidate;
- the value-of-information choice shown in the agent card during a live run and on replay;
- flip points as a compact table, budget breakpoints drawn on the slider track, cards folded to their headline on phones, and the result dimmed while rebooking;
- hero and planner copy that say "up to three artists".

- **Before the switch:** the backup `pre-4f82269` passed an isolated restore (status verified, integrity ok), and a copy is held off-host. The running image was tagged `houselights-shared:pre-4f82269`. The rollback drill reported `4c3a7cd`, served 12 cases and logged no errors.
- **CI:** CI passed on the commit.
- **Switch:** exact checkout, secret scan clean, capped build completed before any change to the running service, only `RELEASE_COMMIT` changed. The Caddyfile is unchanged, so only the app container was recreated. Every other container and the livestream PID were unchanged.
- **Checks:**
  - `release:verify` passed all 88 checks.
  - Chromium, Firefox and WebKit at phone and desktop sizes passed the ticket, Qloo switch, receipt, workspace, Slate studio and 404 checks, with no overflow. As before, the fast multi-page script logged transient Firefox font and WebKit stylesheet messages while moving between pages; the settled per-page probe logged no console errors on any page in WebKit or Firefox.
  - **One live "Plan a show" run on production:** Seattle, fans of Fleet Foxes and The Head and the Heart, $35,000, 3 acts. It took 14.4 seconds and 12 Qloo calls. It booked Bon Iver + Noah Gundersen + Hey Marseilles for $35,000 (estimated fees). With Qloo off, the same rules book Noah Gundersen + Hey Marseilles + Langhorne Slim for $19,000. During the run the agent card showed that 3 acts could change the bill and were checked first, 2 were skipped and 3 were not checked for lack of calls. The verdict strip read: holds in 51% of fee scenarios, one coin-flip pick (Bon Iver, against Blind Pilot), audience ranking decides it, bill changes at $35,000 · $44,000 · $65,000, agent checked 3 of 8 acts. No console errors.
- **Watch:** disk use is 97% after the build (1.6 GB free), and `/healthz` reports `"diskOk":false`. The next build is unlikely to fit without pruning older rollback images, keeping at least the last two.

**Rollback:** tag `houselights-shared:pre-4f82269` as `houselights-shared:local`, set `RELEASE_COMMIT=4c3a7cd6175c61bc2d00624604f774455c51f77e`, check out that commit, then run `up --no-build -d houselights` with both Compose files.

## Deployment of 4c3a7cd — 29 October 2026

The public host runs `4c3a7cd6175c61bc2d00624604f774455c51f77e`, and `/healthz` over public HTTPS reports it. When no bill fits, a plan now names the first budget that books one, with a button that goes there, and shows the research trail, including that no deep Qloo checks were made when none could make a bill fit.

- **Before the switch:** the backup `pre-4c3a7cd` passed an isolated restore (status verified, integrity ok), and a copy is held off-host. The running image was tagged `houselights-shared:pre-4c3a7cd`. The rollback drill reported `20b6df8`, served 12 cases and logged no errors.
- **CI:** CI passed on the commit.
- **Switch:** exact checkout, secret scan clean, capped build completed before any change to the running service, only `RELEASE_COMMIT` changed. The Caddyfile is unchanged, so only the app container was recreated. Every other container and the livestream PID were unchanged.
- **Checks:**
  - `release:verify` passed all 88 checks.
  - Chromium, Firefox and WebKit at phone and desktop sizes passed the ticket, Qloo switch, receipt, workspace, Slate studio and 404 checks, with no overflow. The fast multi-page script again logged transient Firefox (an aborted image load or font download) and WebKit stylesheet messages while moving between pages; the settled per-page probe logged no console errors on any page in WebKit or Firefox.
  - On the earlier Minneapolis live plan, the new section names $27,000 as the first budget that books a bill and explains that no deep checks were made; its button books Lord Huron + Lucius + Rainbow Kitten Surprise for $27,000. No console errors.
  - **One live "Plan a show" run on production:** Atlanta, fans of Leon Bridges and Durand Jones & The Indications, $40,000, 3 acts. It took 14.0 seconds and 12 Qloo calls. It booked Lady Wray + Brittany Howard + St. Paul & The Broken Bones for $12,500 (estimated fees). With Qloo off, the same rules book Lady Wray + YEBBA + Charlotte Day Wilson for $9,000. The bill holds in all 500 fee scenarios; St. Paul & The Broken Bones is a likely pick against YEBBA under affinity noise (78%). The agent checked 3 of 8 acts by value of information. No console errors.
- **Watch:** disk use is 96% after the build (2.2 GB free), and `/healthz` reports `"diskOk":false`. The next build may not fit; older rollback images can be pruned, keeping at least the last two.

**Rollback:** tag `houselights-shared:pre-4c3a7cd` as `houselights-shared:local`, set `RELEASE_COMMIT=20b6df83c89f85f97eef256175841145602bc9bd`, check out that commit, then run `up --no-build -d houselights` with both Compose files.

## Deployment of 20b6df8 — 29 October 2026

The public host runs `20b6df83c89f85f97eef256175841145602bc9bd`, and `/healthz` over public HTTPS reports it. The release deepens the plan analysis:
- **Research by value of information:** before its deep Qloo checks, a live plan tries all 16 results each check could return for every act against the exact optimizer. Acts whose result could change the bill are checked first, booked acts are verified next, and acts no result could change are skipped. The reasons are saved with the plan. Other agent runs keep their allocation, so pinned recordings replay exactly.
- **Budget ladder:** every budget at which the bill changes, marked on the slider and listed as steps that rebook there.
- **Fee robustness:** estimated fees move across their Qloo popularity tier, and a safer bookable bill is shown when it wins more scenarios.
- **Does Qloo separate the picks?** Affinities move within the near-tie band, through the scaling that produced the saved fits, and each booked act is shown as a clear pick, a likely pick or a coin flip.

- **Before the switch:** the backup `pre-20b6df8` passed an isolated restore (status verified, integrity ok), and a copy is held off-host. The running image was tagged `houselights-shared:pre-20b6df8`. The rollback drill reported `4860c7a`, served 12 cases and logged no errors.
- **CI:** CI passed on the commit, including five unretried WebKit runs of the live-plan pointer journey.
- **Switch:** exact checkout, secret scan clean, only `RELEASE_COMMIT` changed, capped build. The Caddyfile is unchanged, so only the app container was recreated. Every other container and the livestream PID were unchanged.
- **Checks:**
  - `release:verify` passed all 88 checks. The featured plan's analysis over HTTPS matches the local result: 80% fee robustness, a three-step ladder, and Sault a coin flip with Jordan Rakei (affinity 0.9580 vs 0.9579).
  - Chromium, Firefox and WebKit at phone and desktop sizes passed the ticket, Qloo switch, receipt, workspace, Slate studio and 404 checks, with no overflow. As on the last release, the fast multi-page script logged a Firefox font download and a WebKit stylesheet message while moving between pages; the settled per-page probe logged no console errors on any page in WebKit or Firefox.
  - On the public page, the affinity card and ladder render, and choosing the $10,000 step rebooks Michael Kiwanuka + Jordan Rakei for $10,000. No console errors.
  - **One live "Plan a show" run on production:** Minneapolis, fans of Bon Iver and Hippo Campus, $25,000, 3 acts. It took 9.9 seconds and 5 Qloo calls, and correctly found no bookable bill: the three cheapest estimated fees total $27,000. No check result could make a bill fit, so the agent skipped every deep check. The ladder on that plan offers $27,000 and $37,000. An experiment at $27,000 (no Qloo calls) books Lord Huron + Lucius + Rainbow Kitten Surprise, with popularity-tier fee robustness, a four-step ladder and fixed-span affinity checks all returned.
- **Watch:** disk use is 94% after the build, and `/healthz` reports `"diskOk":false`. Older rollback images can be pruned, keeping at least the last two.

**Rollback:** tag `houselights-shared:pre-20b6df8` as `houselights-shared:local`, set `RELEASE_COMMIT=4860c7af527f7c25243435d50c1eff19d7b5f07f`, check out that commit, then run `up --no-build -d houselights` with both Compose files.

## Deployment of 4860c7a — 29 October 2026

The public host runs `4860c7af527f7c25243435d50c1eff19d7b5f07f`, and `/healthz` over public HTTPS reports it. It is the feature upgrade `dffe507` plus one layout fix:
- **`dffe507`:** every plan, saved or live, shows "How solid is this bill?": the share of 500 seeded ±20% fee scenarios that keep the bill, the exact fee at which each booked act would change it and what replaces it, the cut that would bring another act in, and which class of Qloo evidence changes the decision on its own. "Plan a show" accepts up to three artists, and every artist must be confirmed before a plan is saved.
- **The fix:** WebKit could anchor scrolling to the agent card beside the planner form and move the page when the card re-rendered, so a press on "Plan my bill" could release on the form. The column is no longer a scroll anchor.

- **Before the switch:** the backup `pre-4860c7a` passed an isolated restore (status verified, integrity ok), and a copy is held off-host. The running image was tagged `houselights-shared:pre-4860c7a`. The rollback drill reported `be5d7ac`, served 12 cases and logged no errors.
- **CI:** CI passed on the commit, including five unretried WebKit runs of the live-plan pointer journey. The run on `dffe507` failed that journey, which the fix addresses.
- **Switch:** exact checkout, secret scan clean, only `RELEASE_COMMIT` changed, capped build. The Caddyfile is unchanged, so only the app container was recreated. Every other container and the livestream PID were unchanged.
- **Checks:**
  - `release:verify` passed all 88 checks. A run started straight after an earlier one failed 17 experiment checks against the per-IP limit of 20 a minute; it passed in full once the minute reset.
  - Chromium, Firefox and WebKit at phone and desktop sizes passed the ticket, Qloo switch, receipt, workspace, Slate studio and 404 checks, with no overflow. That fast multi-page script logged a Firefox font download and a WebKit stylesheet message while it moved between pages; the settled per-page probe logged no console errors on any page in WebKit or Firefox.
  - **One live "Plan a show" run on production:** Portland, fans of Big Thief and Phoebe Bridgers, $25,000, 3 acts. The request took 12.8 seconds and returned 200. It booked Lucy Dacus + Adrianne Lenker + Julia Jacklin for $24,000 (estimated fees). With Qloo off, the same rules book Julia Jacklin + Haley Heynderickx + Better Oblivion Community Center for $18,000. The bill holds in 59% of fee scenarios, and removing the audience ranking alone changes it. No console errors and no error-level server logs.
- **Watch:** disk use is 93% after the build, so `/healthz` reports `"diskOk":false` (under 10% free). Older rollback images can be pruned, keeping at least the last two.

**Rollback:** tag `houselights-shared:pre-4860c7a` as `houselights-shared:local`, set `RELEASE_COMMIT=be5d7ac386efca25e512ef754cf63c88850c800d`, check out that commit, then run `up --no-build -d houselights` with both Compose files.

## Deployment of 1116763 — 26 October 2026

The public host runs `111676339cda5a1d54acc682f38cd5e5c7743eef`, and `/healthz` over public HTTPS reports it with `"diskOk":true`. It is the dashboard upgrade `57a6ac9` plus the regenerated Linux visual baselines and a test-only timeout change. The upgrade:
- adds "On this page" section navigation to Evidence, Proof Lab, the Booking Desk lab, Demand and Financial;
- makes the page headers compact, and adds a claim-count strip to the Evidence page;
- turns the Demand Lab access panels into one slim bar;
- moves Slate studio's views into tabs;
- stacks result tables on phones.

- **Before the switch:** the backup `pre-1116763` passed an isolated restore (status verified, integrity ok), and a copy is held off-host. The running image was tagged `houselights-shared:pre-1116763`. The rollback drill reported `4484bea`, served 12 cases and logged no errors.
- **CI:** CI passed on the commit. The run on `57a6ac9` failed on the expected Linux screenshots and on a WebKit live-plan test that ran past its 30-second limit on the shared runner. That limit is now 60 seconds; the app allows three minutes.
- **Switch:** exact checkout, secret scan clean, only `RELEASE_COMMIT` changed, capped build. The Caddyfile is unchanged, so only the app container was recreated. Every other container and the livestream PID were unchanged. Disk use is 90%.
- **Checks:**
  - `release:verify` passed all 86 checks. Every page returns 200 and the 404 page returns 404. All five long pages carry the section navigation, and Slate studio serves its tabs.
  - Chromium, Firefox and WebKit at phone and desktop sizes passed the ticket, Qloo switch, receipt, workspace, Slate studio and 404 checks, with no overflow. Firefox at desktop size first timed out on the Qloo switch, right after about 20 experiments had used the per-IP limit of 20 a minute. It passed once the minute reset.
  - A settled per-page probe logged no console errors.
  - **One live "Plan a show" run on production:** Denver, fans of Japanese Breakfast, $25,000, 3 acts. It took 15.0 seconds and 11 Qloo calls. It booked Soccer Mommy + Snail Mail + Samia for $22,000 (estimated fees, $3,000 under budget). With Qloo off, the same rules book sasami + Jay Som + Samia for $14,000. No console errors.

**Rollback:** tag `houselights-shared:pre-1116763` as `houselights-shared:local`, set `RELEASE_COMMIT=4484bead7884c9599c591c5b116637e9da042afb`, check out that commit, then run `up --no-build -d houselights` with both Compose files.

## Deployment of 4484bea — 26 October 2026

The public host runs `4484bead7884c9599c591c5b116637e9da042afb`, and `/healthz` over public HTTPS reports it with `"diskOk":true`. It is `08b3cd2` plus the regenerated Linux visual baselines and one fix:
- **`08b3cd2`:** the sidebar's GitHub button now matches the 404 page, and the app pages share one style for labels, cards, buttons and the sticky step bar.
- **The fix:** "Try a budget cut" on the Booking Desk lab now waits for the button to be enabled before focusing it, so focus is no longer lost while the case loads.

- **Before the switch:** the backup `pre-4484bea` passed an isolated restore (status verified, integrity ok), and a copy is held off-host. The running image was tagged `houselights-shared:pre-4484bea`. The rollback drill reported `8056b4c`, served 12 cases and logged no errors.
- **CI:** CI passed on the commit. The run on `b28d110` failed the budget-cut focus check, which is fixed here, and two WebKit tests that timed out on a slow runner; both passed on the next run.
- **Switch:** exact checkout, secret scan clean, only `RELEASE_COMMIT` changed, capped build. The Caddyfile is unchanged, so only the app container was recreated. Every other container and the livestream PID were unchanged. Disk use is 90%.
- **Checks:**
  - `release:verify` passed all 86 checks. The sidebar serves the GitHub button, and private routes still return 401.
  - Chromium, Firefox and WebKit at phone and desktop sizes passed the ticket, Qloo switch, receipt, workspace, Slate studio and 404 checks, with no overflow.
  - A settled per-page probe logged no console errors.
  - **One live "Plan a show" run on production:** Austin, fans of Khruangbin, $25,000, 3 acts. It completed in 2.3 seconds with 0 new Qloo calls, because every response was served from the provider cache after the earlier Austin runs. It booked Glass Beams + KOKOROKO + Arc De Soleil for $16,000 (estimated fees). With Qloo off, the same rules book Mildlife + Common Saints + Robohands for $8,000. No console errors.
- **Watch:** disk use is now 90%. Older rollback images can be pruned when convenient, keeping at least the last two.

**Rollback:** tag `houselights-shared:pre-4484bea` as `houselights-shared:local`, set `RELEASE_COMMIT=8056b4ca08142d1b933f49fcfe71b202c5514538`, check out that commit, then run `up --no-build -d houselights` with both Compose files.

## Deployment of 8056b4c — 26 October 2026

The public host runs `8056b4ca08142d1b933f49fcfe71b202c5514538`, and `/healthz` over public HTTPS reports it with `"diskOk":true`. The release covers the latest landing page work:
- ticket art that follows the Qloo switch (purple on, red off);
- a column footer on the bridge drawing, and slimmer gradient buttons;
- a winding "How it decides" timeline with the owner's graph artwork;
- the 404 page's sketch button.

- **Before the switch:** the backup `pre-8056b4c` passed an isolated restore (status verified, integrity ok), and a copy is held off-host. The running image was tagged `houselights-shared:pre-8056b4c`. The rollback drill reported `eee5cbf`, served 12 cases and logged no errors.
- **CI:** CI passed on the commit. The run on `3009a02` failed only because the browser download stalled on the runner, and an empty commit (`8056b4c`) re-ran it green. The run before that failed a single Chromium focus check on the unchanged Booking Desk lab page; it did not recur.
- **Switch:** exact checkout, secret scan clean, only `RELEASE_COMMIT` changed, capped build. The Caddyfile is unchanged, so only the app container was recreated. Every other container and the livestream PID were unchanged. Disk use is 89%.
- **Checks:**
  - `release:verify` passed all 86 checks. The new artwork, purple tickets and column footer are served, and private routes still return 401.
  - Chromium, Firefox and WebKit at phone and desktop sizes all passed the ticket, Qloo switch, receipt, workspace, Slate studio and 404 checks, with no overflow.
  - A settled per-page probe logged no console errors.
  - **One live "Plan a show" run on production:** Austin, fans of Khruangbin, $25,000, 3 acts. It took 13.9 seconds and 11 Qloo calls. It booked SAULT + KOKOROKO + Arc De Soleil for $19,000 (estimated fees, $6,000 under budget). With Qloo off, the same rules book Mildlife + Common Saints + Robohands for $8,000. No console errors.

**Rollback:** tag `houselights-shared:pre-8056b4c` as `houselights-shared:local`, set `RELEASE_COMMIT=eee5cbf8a1a20366f363792c1d0b7b881e4b31cc`, check out that commit, then run `up --no-build -d houselights` with both Compose files.

## Deployment of eee5cbf — 26 October 2026

The public host runs `eee5cbf8a1a20366f363792c1d0b7b881e4b31cc`, and `/healthz` over public HTTPS reports it with `"diskOk":true`. The release polishes the landing page and app chrome:
- the new Houselights mark and "Get started" style purple buttons;
- a small water-themed Qloo switch, and decision and poster tickets of equal height;
- a canvas pixel field behind clean hero facts, and a pencil dotted pipeline;
- a minimal FAQ, and a footer without the small print;
- the pixel GitHub button in the sidebar.

- **Before the switch:** the backup `pre-eee5cbf` passed an isolated restore (status verified, integrity ok), and a copy is held off-host. The running image was tagged `houselights-shared:pre-eee5cbf`. The rollback drill reported `e21f563`, served 12 cases and logged no errors. CI passed on the commit.
- **Switch:** exact checkout, secret scan clean, only `RELEASE_COMMIT` changed, capped build. The Caddyfile is unchanged, so only the app container was recreated. Every other container and the livestream PID were unchanged. Disk use is 88%.
- **Checks:**
  - `release:verify` passed all 86 checks. Every page returns 200 and the 404 page returns 404. The new logo and FAQ are served, the footer small print is gone, and private routes still return 401.
  - In Chromium, Firefox and WebKit at phone and desktop sizes:
    - the bill shows on the ticket and flips with Qloo off;
    - receipts open and close;
    - the workspace folders and the Slate studio views work;
    - nothing overflows.
  - A settled per-page probe in WebKit and Firefox logged no console errors.
  - **One live "Plan a show" run on production:** Austin, fans of Khruangbin, $25,000, 3 acts. It took 6.1 seconds and 3 new Qloo calls; most responses were served from cache after the previous Austin run. It booked Glass Beams + KOKOROKO + Arc De Soleil for $16,000 (estimated fees, $9,000 under budget). With Qloo off, the same rules book Mildlife + Common Saints + Robohands for $8,000. No console errors.

**Rollback:** tag `houselights-shared:pre-eee5cbf` as `houselights-shared:local`, set `RELEASE_COMMIT=e21f563eff0fe035a31dcff472c15bbcb67bd74d`, check out that commit, then run `up --no-build -d houselights` with both Compose files.

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
