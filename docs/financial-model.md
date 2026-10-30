# Financial Risk Lab: model contract

Houselights uses a deterministic scenario model to compare hard-feasible concert lineups. It does **not** claim that 10,000 or 100,000 simulations make weak demand assumptions accurate. The public page at `/financial.html` runs on a real Booking Desk plan: its candidates, Qloo fit and fees come from the saved plan, and the visitor states the venue capacity, ticket price, sell-through and costs (defaults scale with the plan's artist budget). Paid demand is that stated sell-through assumption, and there is no historical financial calibration. Public runs are limited, and an identical plan and assumptions reuse the earlier seeded result. Free-form scenarios with an organizer's own artists and quotes stay private, and also accept saved Qloo sources and compatible audience twins; it never converts a cultural fit score directly into ticket sales.

## Inputs and lineage

`POST /api/financial/jobs` takes the same `brief`, `candidates`, `constraints`, `assumptions`, optional `sourceId`, and optional `twinId` as `POST /api/demand/plan`, plus `financial`. Candidate fees, availability and genres are organizer-entered. `normalizeDemandInput` verifies the saved Qloo city and receipt-backed signals. `assertTwinCompatible` requires the exact source/city/artist pool. The demand adapter uses the first available of (1) the chronologically backtested paid-ticket model, (2) the existing Audience Twin scenario, and (3) an explicit organizer sell-through and price-elasticity assumption. Without one of these it refuses to simulate. The recorded demand basis and caveat accompany every lineup.

The `financial` object specifies currency, ticket tiers and allocations, fixed and per-ticket costs, ancillary revenue, tax mode/rate/reference, ticketing-fee ownership, booking/refund terms, volatility, a four-factor correlation matrix, cash timing, the scenario seed and draw count, policy, loss threshold, and evidence references. Up to five named assumption sets vary demand and cost levels separately from outcome variability. This separates parameter uncertainty from Monte Carlo noise. Every input monetary amount is parsed to integer minor units. A nonzero `costs.artistFees` is rejected because artist costs are derived from each selected quote.

## One draw

Ticket sales are capped at the sum of tier allocations, which cannot exceed venue capacity. The aggregate paid-ticket count is distributed among tiers proportionally to allocation with a stable largest-remainder rule. Ticket prices are buyer-facing when tax is included and pre-tax when tax is added. The event's stated tax treatment is required; the lab does not infer jurisdiction-specific tax rules.

```
gross revenue = ticket receipts including collected tax + ancillary revenue
net revenue = gross revenue - refunds - promoter-borne ticketing fees - tax due
total costs = selected artist fees net of contractual refunds + escalation
            + replacement and cancellation costs + fixed and variable event costs
profit = net revenue - total costs
```

Buyer-borne fees are outside promoter revenue and expense. Promoter-borne fees are deducted once. Tax is calculated on retained ticket receipts after refunds. Ancillary revenue and expenses are explicitly separate. A canceled event has zero attendance and ancillary revenue, while ticket sales before refunds remain in the audit ledger. The declared event refund fraction determines how much of the ticket receipts is returned. Artist cancellation applies refund, replacement, penalty and ticket-refund terms separately. Cash needed before ticket revenue is an explicit deposit/pre-event-cost/refund-reserve scenario; it is not a full dated cash-flow forecast.

## Simulation and decision policy

The engine requires 10,000–100,000 draws and a fixed unsigned 32-bit seed. A validated positive-definite four-factor correlation matrix produces shared economic, weather, competition and audience factors. Each finalist gets the **same factor vector at each draw**. When an Audience Twin is attached, its existing overlap-adjusted segment ticket scenarios are sampled separately, with a shared market factor and a segment-specific perturbation; their sum is capped at sellable capacity. This does not create measured segment buyers. Artist-specific cancellation and fee-escalation draws are keyed by artist ID, seed and draw index, so the same artist sees the same operational shock across competing lineups. Named stress tests reuse the seed and increase cost, reduce demand, increase fees/cancellations, or combine adverse conditions.

The existing exact optimizer first enforces the artist-fee budget, slot count, genre cap, availability and other booking rules. An optional maximum event budget also includes fixed financial costs. The financial shortlist comprises the top 48 cultural slates and 12 cheapest among the exact-feasible rows; 512 pilot draws choose up to nine finalists for the full simulation. This reduces computation but is **not a global financial optimum across all feasible slates**. The interface discloses the searched counts and filter. A zero-candidate or no-comparable-demand result remains explicitly infeasible.

Three policies are available: maximum mean profit among finalists, maximum mean profit under a specified CVaR-loss ceiling, and Pareto comparison across mean profit, worst-tail loss and cultural score. The balanced policy chooses one Pareto candidate for display; it also retains the full frontier. If every finalist has negative expected profit, the result says **do not book under these assumptions**. If no candidate meets the downside ceiling, it says so instead of silently relaxing the constraint.

A supplied CVaR ceiling is a hard eligibility constraint for **all three policies**, including `expected_profit`. Without a ceiling, `expected_profit` maximizes mean profit within the simulated finalists. Monetary boundary comparisons use integer minor units.

This correction is versioned as `financial-scenario-v1.1`. Saved v1 reports are unchanged and remain readable; the existing replay endpoint rejects a different model version with HTTP 409 instead of promising the same result under changed policy semantics. The historical public demo is not regenerated.

The output includes mean/median/5th/25th/75th/95th profit, break-even and loss-threshold probabilities, 95% VaR and mean worst-5%-tail loss (CVaR), exact break-even paid-ticket volume under base costs, revenue/cost/cash distributions and named stress results. These are simulated **conditional frequencies**, not externally validated probabilities. A controlled sensitivity table describes which declared shocks move expected profit. A line-item bridge compares the preferred lineup with an alternative across ticket receipts, ancillary revenue, refunds, fees, tax and artist/event costs; common random numbers reduce comparison noise. Tier prices are identical within a lineup comparison, so receipt differences primarily reflect the model's demand response. Neither explanation is causal attribution.

## API, persistence and replay

Jobs are organizer-protected. `POST /api/financial/jobs` returns `202` and a job ID; `GET /api/financial/jobs/:id` polls it; `POST .../cancel` terminates a running worker; `POST .../replay` reruns the same immutable snapshot and seed. At most two workers run concurrently, with route quotas and worker memory bounds. SQLite stores the full input snapshot, model version, evidence references, seed, derived lineup demand and result. SHA-256 digests cover the input and result; reads and replays verify integrity. Interrupted jobs are marked interrupted after process restart and may be replayed. An API result is private even if a static, synthetic illustration is public.

Example input lives in [`scripts/generate-financial-demo.mjs`](../scripts/generate-financial-demo.mjs). Rebuild it with `npm run financial:demo`; this executes the model rather than drawing an invented chart. The static JSON is labeled synthetic and must not be used as a real London forecast.
