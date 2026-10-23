# Current Qloo proof status

The reproducible published-case report is [results/qloo-proof.md](../results/qloo-proof.md); the full per-signal outputs and evidence references are [results/qloo-proof.json](../results/qloo-proof.json). These artifacts are generated from the committed public-case manifest by `npm run reproduce:qloo-proof`.

The most important result is methodological: HouseLights now exposes the precise saved observations and policy choices behind each lineup, then reruns all 16 signal combinations under a locked brief. This shows when Qloo information changes an internal booking decision. It does **not** show that the resulting event sells more tickets or is preferred by independent bookers.

Current coverage is four distinct published briefs in four cities with four distinct pools. Three have comparable saved LLM controls; the fourth is explicitly non-comparable. The available controls in this small manifest have zero operational failures, so there is no evidence here of a general LLM failure rate or HouseLights superiority. The 95% Wilson upper bound for 0/3 failures is broad. The twelve-distinct-brief target remains open.

No reviewer invitations have been sent and no independent ballots or held-out event outcomes are represented in this report. The blind-review infrastructure is ready to accept genuine reviewers when the organizer chooses to resume that track. The separate discovery-comparison API is ready for independently sourced candidate lists, but no Qloo-versus-LLM-versus-non-Qloo discovery outcome is claimed without those lists and external source checks.
