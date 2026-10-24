# Research-selection policy evaluation (held-out)

Protocol: [evals/autopilot-policy-protocol.json](../evals/autopilot-policy-protocol.json). Synthetic ground truth; no provider calls. 150 scenarios (seeds 10001–10155); 7 start with at least one jointly-material gap.

No additional research: agreement 85.0%, mean regret 3.95 policy points.

## All scenarios — agreement with the full-information bill / mean regret (points)

| Calls | Fixed order | Random (3 seeds) | Autopilot 1.0 | Autopilot 2.0 | Mean calls used (fixed / random / 1.0 / 2.0) |
|---|---|---|---|---|---|
| 1 | 97.0% / 0.478 | 89.0% / 2.587 | 97.0% / 0.485 | 97.0% / 0.485 | 1 / 1 / 1 / 1 |
| 2 | 98.0% / 0.314 | 94.0% / 1.333 | 99.0% / 0.31 | 99.0% / 0.31 | 2 / 2 / 2 / 2 |
| 4 | 99.0% / 0.31 | 95.0% / 1.209 | 99.0% / 0.31 | 99.0% / 0.31 | 3.97 / 3.97 / 3.88 / 3.88 |

## Interaction subset (7 scenarios)

No additional research: agreement 86.0%, mean regret 0.078.

| Calls | Fixed order | Random (3 seeds) | Autopilot 1.0 | Autopilot 2.0 | Mean calls used (fixed / random / 1.0 / 2.0) |
|---|---|---|---|---|---|
| 1 | 86.0% / 0.078 | 90.0% / 0.052 | 86.0% / 0.214 | 86.0% / 0.214 | 1 / 1 / 1 / 1 |
| 2 | 86.0% / 0.078 | 90.0% / 0.052 | 100.0% / 0 | 100.0% / 0 | 2 / 2 / 2 / 2 |
| 4 | 100.0% / 0 | 95.0% / 0.026 | 100.0% / 0 | 100.0% / 0 | 4 / 4 / 4 / 4 |

Synthetic outcomes test research selection only. They are not evidence about real Qloo responses, audiences or ticket sales.
