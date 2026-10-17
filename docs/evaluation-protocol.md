# Real model and independent-review protocol

## Provider configuration

For Groq, configure the ignored `.env`:

```dotenv
LLM_PROVIDER=groq
LLM_MODEL=openai/gpt-oss-120b
GROQ_API_KEY=your-key-here
```

Restart the Node server after changing credentials. Anthropic remains supported with `LLM_PROVIDER=anthropic`, `ANTHROPIC_API_KEY` and an explicit `LLM_MODEL`. `LLM_MODE=off` disables either provider. No provider fallback occurs. Credentials stay server-side; `/api/benchmarks/config` exposes only readiness, provider, model and missing variable names.

Groq's [model documentation](https://console.groq.com/docs/models) and [free-plan limits](https://console.groq.com/docs/rate-limits) were checked on 16 October 2026. GPT-OSS 120B was listed at 30 requests/minute, 1,000 requests/day, 8,000 tokens/minute and 200,000 tokens/day; account limits can differ. This is a supported free-tier choice, not a measured claim that it is the best model for event booking. Do not enable a paid tier automatically.

## Benchmark procedure

Open **Independent evaluation** and choose a saved source and 1–5 trials. `POST /api/benchmarks` runs them sequentially and retains every completed attempt, including provider errors, invalid selections and constraint failures. The batch is persisted before calls start and after every attempt. A 429 stops remaining trials; there is no silent retry or replacement model. No output is repaired into a feasible lineup.

The prompt includes an allowlist of city, audience anchors, candidate IDs/names, discovery membership and buyer fee/genre/availability terms. Fit, rank, receipts, trends, comparison edges, research claims and arbitrary extra terms are excluded. Tool use and browsing are not enabled. Qloo-derived minimum-fit constraints make the comparison incomparable, so no model call is made in that case. All methods still share a pool that may itself have been discovered with Qloo.

Each attempted generation records provider, requested/returned model, request/response IDs when supplied, request and response digests, token usage, finish reason, latency and error category. The digest records the payload; it is not independent verification. Provider error bodies and secrets are not exposed. A test transport or injected proposal is not evidence of a real benchmark.

The first trial is declared in advance as the external-review candidate. Later batch trials cannot enter a study in its place. Variation across all trials remains visible. An invalid first trial yields no review candidate; it is not replaced with the most favorable later trial. This rule prevents substitution within a batch, not all possible researcher selection across separately initiated studies.

`GET /api/benchmarks/:id` retrieves an organizer-private batch. Persisted `running` records after an interrupted server process must be treated as unfinished, not completed trials. The single-control Festival GM action remains available and records the same provider provenance.

## Human review

Use actual people in any combination of `venue_programmer`, `festival_organizer`, `artist_booker`, `audience_member`, or `other`. Roles and identities are organizer-supplied, not independently verified. Four roles do not imply four judgments until those people submit them.

Each reviewer receives a private invitation with randomized A/B source assignment for every distinct brief. The review page omits system labels, optimizer scores and source IDs. It collects preference (A, B, tie, abstain), a written reason, and optional 1–5 ratings for cultural fit, program breadth and booking practicality. Unknown ratings remain null. One complete ballot is accepted per invitation; duplicate submissions fail.

Study creation rechecks the current brief digest, both selections' feasibility, current optimizer choice and genuine model provenance for live evidence. Stale, missing, incomparable or invalid controls cannot enter a live study. Synthetic test studies remain explicitly labeled. Sources are retained without publishing them in the featured examples list.

Reports show actual submitted counts, per-brief outcomes, role coverage and the submitted rubric scores after unblinding for the organizer. No fabricated reviewers, AI personas, significance claims, causal improvement, ticket forecasts or guaranteed win rate are substituted for human evidence. Repeated judgments from one reviewer are not independent samples. Review links on localhost require access to the local machine; public hosting remains a separate decision.
