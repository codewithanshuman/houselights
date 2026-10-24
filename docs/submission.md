# Houselights submission checklist (updated 24 October 2026, after deploying bd376df)

- **Public demo:** the [Houselights Booking Desk](https://houselights.80-225-218-239.sslip.io/judge.html).
- **Public source:** the [GitHub repository](https://github.com/codewithanshuman/houselights).
- **Devpost description:** the prepared [draft](devpost-description.md) has not been submitted.

## The two-minute judge path

1. Open the Booking Desk. No sign-in is needed. The first screen shows:
   - the recommended booking, under BOOK;
   - why, from Qloo audience affinity;
   - the main risks;
   - what the promoter must decide;
   - **what Qloo changed:** the same optimizer, pool, fees and budget with Qloo evidence on and off.
2. Select **Try a budget cut ↓** and run it. The exact optimizer returns a feasible bill or explains why there is none. No provider calls are made.
3. In the Booking Desk, turn Qloo evidence off, or withdraw one receipt, and compare. This tests whether the decision depends on the evidence. It does not estimate Qloo's commercial value.
4. Optionally, open **See it plan a brand-new event** to replay a recorded organizer session, or the evidence page to see the shock study and its limits.

## Evidence and limits

The [claims audit](claims-audit.md) has every claim, with its reproduction command and its limits. In short:

- Withdrawing Qloo evidence changes 7 of 9 comparable briefs. Three briefs are excluded as not comparable.
- On comparable solvable shocks, 3 of 231 re-prompted LLM responses (1.3%) violated a hard constraint.
  - In the synthetic 12-candidate case alone, the figure is 1 of 66.
  - Houselights' 0 comes from enforcing constraints by construction.
- No blind reviews, usability sessions, real quotes or ticketing outcomes exist. Booking fees and availability are illustrative.
- The [competition changelog](competition-changelog.md) lists every correction made to earlier claims.

## Requirements before final submission

- [x] Public HTTPS demo, persistent database, public source under the MIT license (GitHub detects it), reproducible setup and sanitized public cases.
- [x] Deployed release verified independently. See the [deployment record](shared-oracle-host.md).
- [x] Live Qloo and Groq transport checks, recorded in [live validation](live-validation.md).
- [x] Artwork provenance recorded in [SOURCES](../public/assets/SOURCES.md).
- [x] On 22 October 2026 the organizer attested to entrant eligibility and to permission to publish the supplied artwork. This is an organizer statement, not independent verification.
- [x] The GitHub default branch `main` was fast-forwarded on 24 October to the deployed, verified commit `bd376df`. It was at `e7dd977`. Nothing was overwritten.
- [x] Production disk cleaned on 24 October: 95% → 78% full. Only old Houselights images were removed; every backup and the recent rollback images were kept.
- [ ] Set the GitHub repository description and homepage link (both are empty). This needs the owner's signed-in account: open **Settings → About** on the repository page.
  - **Description:** Booking decisions for live events, grounded in Qloo cultural evidence: an exact lineup optimizer, receipts for every claim, and honest limits.
  - **Website:** https://houselights.80-225-218-239.sslip.io/judge.html
  - **Topics:** qloo, hackathon, live-events, booking, optimization, decision-support
- [ ] Run the [usability test kit](usability-test-kit.md) with real participants if time allows. Otherwise keep the zero-evidence disclosure.
- [ ] Enter the public URL, repository, license, description and team details in Devpost, then submit.

## Official rules (re-read 24 October 2026)

- **Submission deadline:** 30 October 2026, 11:45 p.m. ET (31 October, 9:15 a.m. India time).
- **Judging:** 2–5 November 2026. Winners are announced around 5 November.
- **After the deadline:** the submission cannot be changed. The project in the Devpost portfolio can be updated. Post-deadline modifications are allowed only for rights, personal-data or inappropriate-content issues.
- **Availability:** the demo must stay available, free and unrestricted until the judging period ends, and must function as the description says. Keep the live site consistent with the submitted text, and make no substantive changes after 30 October.
- **Video:** optional ("video and/or text description"). Judges may judge on the text, images and video alone.
- **License:** must be detectable in the repository's About section. GitHub already detects MIT.

## Blind-review study (needs the owner)

Invitations go only to real people who have agreed to take part. No reviewer has been named, so no study has been created and no invitation has been sent.

To run the study:

1. List at least 5 reviewers. Give each a role: `venue_programmer`, `festival_organizer`, `artist_booker`, `audience_member` or `other`.
2. Create the study from the 5 briefs whose lineups differ: Berlin, New York, London, Amsterdam and Toronto. The 3 identical pairs can only produce ties; see the [claims audit](claims-audit.md).
3. Send each person their private link using the [invitation draft](reviewer-invitation-drafts.md).
4. Set `PUBLIC_STUDY_ID` on the server, so `/evidence.html` shows live counts.

Ballots arriving after 30 October would show on the live page during judging (2–5 November), but they cannot be added to the frozen submission text.

## Single points of failure

- **Uptime monitor:** `.github/workflows/uptime.yml` checks health, live mode, the Booking Desk, the public cases and organizer protection every 30 minutes from GitHub's runners, which are off the VM. GitHub emails the owner when a run fails.
- **Backups:** every deployment takes an online backup, checks it with an isolated restore (all 24 tables), copies it off-host and rehearses the rollback.
- **Still single:** one Oracle VM, and the free sslip.io name, which depends on the VM keeping its IP address. A real domain (about USD 10 a year) pointed at the same VM removes the sslip.io dependency, but it needs the owner to buy it. A second host would remove the VM dependency, but is not worth adding a week before judging.
