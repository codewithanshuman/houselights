# Research-selection policy evaluation (held-out · close calls)

Protocol: [evals/autopilot-policy-protocol.json](../evals/autopilot-policy-protocol.json). Synthetic ground truth; no provider calls. 80 scenarios (seeds 60062–62204); 78 start with at least one jointly-material gap.

No additional research: agreement 89.0%, mean regret 0.071 policy points.

## All scenarios — agreement with the full-information bill / mean regret (points)

| Calls | Fixed order | Random (3 seeds) | Autopilot 1.0 | Autopilot 2.0 | Mean calls used (fixed / random / 1.0 / 2.0) |
|---|---|---|---|---|---|
| 1 | 90.0% / 0.059 | 88.0% / 0.084 | 89.0% / 0.073 | 89.0% / 0.073 | 1 / 1 / 1 / 1 |
| 2 | 89.0% / 0.092 | 88.0% / 0.072 | 89.0% / 0.085 | 90.0% / 0.062 | 2 / 2 / 2 / 2 |
| 4 | 89.0% / 0.072 | 88.0% / 0.087 | 93.0% / 0.024 | 95.0% / 0.037 | 4 / 4 / 4 / 4 |

## Interaction subset (78 scenarios)

No additional research: agreement 90.0%, mean regret 0.048.

| Calls | Fixed order | Random (3 seeds) | Autopilot 1.0 | Autopilot 2.0 | Mean calls used (fixed / random / 1.0 / 2.0) |
|---|---|---|---|---|---|
| 1 | 91.0% / 0.036 | 88.0% / 0.078 | 88.0% / 0.075 | 88.0% / 0.075 | 1 / 1 / 1 / 1 |
| 2 | 90.0% / 0.07 | 88.0% / 0.065 | 88.0% / 0.087 | 90.0% / 0.063 | 2 / 2 / 2 / 2 |
| 4 | 90.0% / 0.049 | 88.0% / 0.081 | 92.0% / 0.025 | 95.0% / 0.038 | 4 / 4 / 4 / 4 |

Synthetic outcomes test research selection only. They are not evidence about real Qloo responses, audiences or ticket sales.
