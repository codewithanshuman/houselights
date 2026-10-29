# Audience-city discovery diagnosis — 29 October 2026

The unlisted genuine London/Bonobo verification plan `e663bf68b7a8861b7b7996b4` had eight discovered candidates but only three returned city-audience ranks. The optimizer correctly withheld comparable fit for the entire pool and saved a provisional decision. The later presentation warning did not fix the research request itself.

The request mismatch was in `server/agent.mjs`: discovery passed `filter_location: city`, while ranking passed `signal_location: city`. The installed official harness 0.1.26 explicitly distinguishes audience-location signals from filters constraining result geography. Qloo documents these semantics in its [Insights reference](https://docs.qloo.com/reference/insights-api-deep-dive). Discovery now passes `signal_location`, matching the ranking's audience profile. The canonical adapter, city, anchor, candidate limit, optimizer, fees, call budgets and evidence completeness rules are unchanged.

## Bounded genuine provider observations

Before changing the application, a four-workflow protocol was recorded locally and run once through the installed canonical MCP adapter and metered HTTP transport. All requests were live; no LLM calls were made.

| Query | Returned candidates | Interpretation |
| --- | --- | --- |
| Original eight-candidate pool, original London audience | 3/8 | Reproduces the incomplete original ranking. |
| Same original pool without city | 8/8 | Diagnostic only; never substituted for city-specific evidence. |
| Discovery using Bonobo plus the London audience signal | 8 | A different discovered pool, under the intended audience profile. |
| One ranking of that new pool using Bonobo plus London | 8/8 | Complete evidence for this newly discovered pool in this observation. |

These four workflows used **19 actual HTTP requests**, including SDK resolution requests. The last observed monthly header reported 48,738 remaining of 50,000 at `2026-10-29T05:19:45.138Z`. This is a timestamped account observation, not a permanent remaining balance. The compact private diagnostic report has SHA-256 `9ba63ec64cf30ee34026c292478053157c787a41cdd8120b1fe09d96cf32c7d7`; it is retained under ignored operator artifacts, not published as a benchmark or raw provider response.

This observation supports correcting the query semantics; it does not prove that every city will return full coverage, that the new lineup is commercially better, or that location is the sole cause of all missing ranks. The pools differ by design, so their scores must not be compared as matched treatment outcomes. No scores were stitched across calls, no missing artist was dropped, and no original evidence, published case, benchmark fixture or trace was rewritten. There was no repeat to select a more favorable result.

## Regression and release scope

The new agent regression fails on the previous request and covers both complete and deliberately sparse rankings. It requires discovery and ranking to use the same audience city and anchor signals, one fixed-pool ranking, and conservative provisional output when any rank is missing. Existing partial-rank and failed-rank regressions remain intact.

This backend correction affects newly generated research pools. It changes no HTML, CSS, browser JavaScript, icons, images or saved public evidence. Production remains the commit in the [verified production record](current-release.md) until a separately authorized deployment. Human evaluation and actual financial calibration remain pending real participants and qualifying outcomes.
