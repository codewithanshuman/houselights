# Houselights submission checklist — 22 October 2026

Public demo: [Houselights decision room](https://houselights.80-225-218-239.sslip.io/). Public source: [GitHub repository](https://github.com/codewithanshuman/houselights). The prepared [Devpost description](devpost-description.md) is a draft; it has not been submitted.

## The one-minute judge path

1. Open the public decision room without signing in. Select a saved Qloo case and read its source label and illustrative booking terms.
2. Tighten the budget, then recalculate. The exact optimizer either returns a feasible slate or explains infeasibility.
3. Turn Qloo evidence off for the same saved pool. Compare the resulting proof and inspect the withdrawn receipt IDs. This is an evidence-dependency test, not an estimate of Qloo's causal commercial value.
4. Open the evidence page. The shock study reports 93 deterministic shocks and three recorded LLM re-prompts per comparable shock. The 12-candidate synthetic case has 7 violating responses among 72 returned responses. Houselights proposed zero invalid lineups and explicitly abstained on seven infeasible shocks across all cases; zero is an engineering consequence of hard-constraint optimization.

The organizer workspace at `/index.html` contains deeper research, decision proof, saved run traces, portfolio and operational planning. The public path requires no login or provider calls.

## Evidence and limits

- The recorded shock suite uses saved live-Qloo cases and two **clearly labeled synthetic** 10- and 12-candidate cases. [Method and call budget](shock-call-budget.md), [reproducible table](../results/shocks.md), [raw results](../results/shocks.json).
- The saved first-trial and re-prompted LLM controls are tool-free and use the same candidate pool, booking terms and shocked constraints. Provider failures and missing responses are counted separately from returned-response violation rates.
- No independent human preference judgments have been collected. No blind-review invitations have been sent; the organizer deferred them. A genuine artist quote or availability source review is also pending. The public evidence page shows zero rather than invented rows.
- Booking fees, availability, and genres are buyer-entered or illustrative. Cultural affinity is not a ticket-sales or revenue forecast. No observed commercial uplift or prize outcome is claimed.

## Requirements before final submission

- [x] Public HTTPS Node demo, persistent database, public source, MIT code license, reproducible setup, sanitized public cases.
- [x] Live Qloo and Groq transport checks, documented separately in [live validation](live-validation.md).
- [x] Four reference/poster images removed from the public project; remaining artwork provenance and compression recorded in [SOURCES](../public/assets/SOURCES.md).
- [x] Organizer attested on 22 October 2026 that every entrant is an adult in their jurisdiction, no entrant is excluded or connected to sponsor/judges, and permission exists to publish the remaining supplied artwork. This is an organizer statement, not independent verification.
- [x] Public application release and anonymous external-browser checks completed on 22 October 2026. The application-code commit and report are recorded in [live validation](live-validation.md); repeat the checker if a later application change is deployed.
- [x] Mobile-width screenshots of the public decision room and evidence page captured in ignored local artifacts. A video remains optional; a physical fresh-phone test has not been performed.
- [ ] Collect real blind-review judgments and authentic commercial source evidence if available before submission; if not, keep the zero-evidence disclosure.
- [ ] Enter the public URL, repository, license, project description and team details in Devpost, then submit.

The [official rules](https://qloo.devpost.com/rules) and [challenge page](https://qloo.devpost.com/) were checked on 22 October 2026. The listed deadline is 30 October 2026 at 11:45 p.m. EDT (31 October 2026 at 9:15 a.m. India time). The submission requires a Qloo-integrated agentic project, an accessible public demo, public source under an open-source license, and a description. Rules also address entrant eligibility and third-party rights. Confirm the live Devpost form immediately before submission in case its fields change.
