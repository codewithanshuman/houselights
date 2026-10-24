# Houselights submission checklist (updated 24 October 2026)

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
- [ ] **The GitHub default branch is `main`, which is still at `c502815` (23 October).** All later work exists only on `development`, so judges reading the repository see the older code. Merging needs the owner's decision.
- [ ] Optional: set the GitHub repository description and homepage link (both are empty).
- [ ] Run the [usability test kit](usability-test-kit.md) with real participants if time allows. Otherwise keep the zero-evidence disclosure.
- [ ] Enter the public URL, repository, license, description and team details in Devpost, then submit.

The [official rules](https://qloo.devpost.com/rules) and [challenge page](https://qloo.devpost.com/) were checked on 22 October 2026. The listed deadline is 30 October 2026 at 11:45 p.m. EDT (31 October 2026 at 9:15 a.m. India time). Confirm the live Devpost form immediately before submitting, in case its fields have changed.
