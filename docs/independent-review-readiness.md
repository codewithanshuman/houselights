# Independent review readiness and locked evaluation plan

This is a preparation document. No reviewers have been recruited, no invitations have been sent, and no ballots have been created by this milestone. Review count and observed ticket-sales count remain zero in the published manifest.

## What is ready

`npm run audit:judge-evaluation` enumerates deterministic budget, cancellation, fee and availability shocks across **all twelve** published briefs. Each shock targets the union of saved HouseLights and saved LLM selections. Both selections are checked against the identical shocked pool, terms and constraints. The static LLM arm is a fixed-selection replay, never a freshly re-prompted response. Input invariants, unmodified receipts, declared fee changes, unchanged genre/slot constraints and zero optimizer violations are asserted. Explicit infeasibility is counted separately. The JSON output is `results/judge-evaluation-audit.json` and binds to the published manifest digest.

This audit adds dependent stress conditions, not independent markets. It supplements, and does not replace or expand, the frozen shock-v2 study with its existing saved re-prompts and synthetic cases. Zero proposed-lineup violations follows from the optimizer being built to enforce constraints; it is not evidence of cultural or commercial superiority.

## Predeclared external comparison

The `reviewEligible` array in that audit selects every non-synthetic public brief with an unchanged, feasible, comparable saved first-trial LLM control. Currently eight cases qualify: Manchester, Berlin, the earlier New York brief, London, Amsterdam, Toronto, Los Angeles and São Paulo. Mumbai, Paris and Sydney lack complete ranks; the original recorded New York run lacks a contemporaneous control. The separate later recorded-brief replication must not silently replace that missing original control or enter this predeclared cohort. Do not replace a difficult or identical pair with a later favorable model response.

Recruit actual venue programmers, festival organizers or talent buyers when contacts become available. Record real roles with consent; do not create placeholder reviewers. Use the existing organizer-only study workflow (`POST /api/studies`) with the eligible cases' retained saved source IDs, actual reviewer labels and roles. Public case IDs are not private source IDs. Verify the corresponding private sources still match their first-trial benchmark digests before creating the study. The existing system checks constraints and brief digests, randomizes A/B presentation independently per reviewer and brief, and retains the real submitted reasons.

Invite reviewers to assess the fixed brief using cultural fit, program breadth, booking practicality and expected audience appeal. Explain that fees and availability are illustrative. Let reviewers choose A, B, tie or abstain and enter a reason; unknown rubric values remain null. Keep model identities and optimizer policy points concealed until ballots close. Judge every eligible pair, including identical selections. Use the existing study endpoint's invitation URLs privately; do not commit tokens, contacts or source documents.

Draft invitation (unsent):

> Please independently compare two anonymized concert lineups against the same event brief and illustrative booking terms. Choose the lineup you would book, or tie/abstain, and explain your choice. Please assess cultural fit, program breadth and booking practicality. This is a small product evaluation, not a sales forecast. Your feedback will be reported with disagreements and limitations; share no confidential customer or contract information.

Report invited versus completed people, submitted judgments, each reason, ties, abstentions and the decisive denominator. Preserve disagreements. Treat judgments from the same reviewer or brief as clustered; do not call them independent market trials. Existing Wilson intervals are descriptive. With eight curated eligible briefs and no actual participants yet, do not claim generalization or statistical superiority.

## Next independent evidence required

The recorded case needs a prospectively declared new matched comparison before any LLM-superiority claim. Do not retrofit or overwrite its missing first-trial control. Twelve distinct curated cultural-evidence briefs are now published; broader independently supplied real organizer briefs are still needed. Capture all predeclared model attempts, including failures. Further paid provider runs and new case curation are separate from this offline audit. Real prospective ticket outcomes are needed for forecast calibration or sales-impact claims.

## Release approval

Run the Node 24 suite, Chromium anonymous judge path, retained-source verification and isolated release rehearsal on the exact candidate commit. Keep the private original outside Git. Production deployment requires approval of that commit; afterward verify `/healthz` and `npm run release:verify -- <origin> --commit=<approved SHA>` against the hosted site. A local rehearsal does not verify the deployed revision, reverse proxy or actual phone hardware.
