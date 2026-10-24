# What changed during the competition

Houselights was built during the Qloo Agentic Hackathon 2026, between 12 and 24 October 2026, in 77 commits. This page groups that history and lists every correction made after a claim or result turned out to be wrong or overstated. The commit history on the `development` branch is the full record.

## Phases

| Dates | What was built |
|---|---|
| 12–14 Oct | The exact slate optimizer with Qloo receipts. Booking operations, market routing, venue qualification, audience activation, Festival GM research and theme research. |
| 16–19 Oct | Evidence decision proofs and organizer review. Event portfolios. Auditable Groq LLM controls. Persistent research runs. A bounded investigator. Partial Qloo rank coverage is kept unknown instead of being guessed. |
| 20 Oct | Persistent benchmark jobs, public judge experiments and the first public deployment on the free Oracle VM, with backup and restore verified. |
| 21–22 Oct | Visual identity and icons. Anchor artists are excluded from offers. The deterministic shock benchmark. The public evidence page. The Demand Lab, gated on real outcomes. The Audience Twin. The Financial Risk Lab. |
| 23 Oct | The Qloo Proof Lab. The judge journey and its Chromium regression tests. Recorded agent research is shown in the judge path. |
| 24 Oct | The Booking Desk. Preregistered LLM replication. Twelve-brief Qloo coverage. Autopilot 1.0 and 2.0 (joint evidence research, common-scenario strategies, verifiable records). The private organizer workspace. Two independent audits and their corrections. Deployments `cb9ce4a` and `62d4fc2`. A brand and judge-experience pass. |

## Corrections made in public

Each correction is in the commit history. The superseded result is kept, either archived or described, and is not erased.

| Date | What was wrong | Correction |
|---|---|---|
| 19 Oct | Ranks from a partial Qloo pool were treated as comparable. | Fit stays unknown for incomplete pools (`996764d`). |
| 24 Oct | The shock headline "0 vs 9.7%" pooled shocks where the prompt forced the LLM to violate a constraint. | The like-for-like figure is 3/231 (1.3%) on 77 comparable solvable shocks (`22b5819`). |
| 24 Oct | Fit used ordinal Qloo rank positions. | Fit uses Qloo affinity scores, with near-tie disclosure (`22b5819`). |
| 24 Oct | Mumbai, Paris and Sydney were counted in comparisons although their Qloo ranking was incomplete. | They are marked not comparable. "Qloo changes 9 of 11 decisions" became 7 of 9 (`22b5819`). |
| 24 Oct | The integrity verifier passed when source receipts were not supplied. | Every listed receipt is required (`cb9ce4a`). |
| 24 Oct | Near-ties chained into groups wider than the 0.002 band. | Near-ties are pairs only (`cb9ce4a`). |
| 24 Oct | Min-max scaling stretched tiny affinity gaps. | A fixed 0.05 span is used. The recorded run's winning margin is 0.14 policy points, not 7.14 (`cb9ce4a`). |
| 24 Oct | Promoter objectives and audience text looked as if they drove decisions. | They are labelled "context only" (`cb9ce4a`). |
| 24 Oct | Workspace research was labelled complete when Qloo calls had failed. | It is labelled `partial` (`cb9ce4a`), and so are partial or degraded Qloo answers (`62d4fc2`). |
| 24 Oct | The verifier's `sourceReceiptsChecked` reported the expected count. | It now reports the number actually verified (`62d4fc2`). |
| 24 Oct | Packets described fixed-span scoring as "scaled across the ranked pool". | The wording follows each record's scoring version (`4421ebf`). |
| 24 Oct | The README implied the Demand Lab backtest had run. | It is defined and not run (`7faf6ab`). |
| 24 Oct | CI browser tests failed on fast runners. | The suite shared one per-IP request quota; each test now has its own budget (`8048702`). |

## Unchanged throughout

- No ticket-sales, attendance or revenue improvement has been measured.
- No blind reviews or usability sessions have been collected.
- Published fees and availability are illustrative inputs.
- The [claims audit](claims-audit.md) has the current evidence status.
