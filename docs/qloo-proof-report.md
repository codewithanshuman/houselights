# Current Qloo proof status

> **Superseded (24 October 2026).** This page describes an earlier four-brief manifest. The current suite has 12 briefs, 9 with a comparable Qloo ranking; see [results/qloo-proof.md](../results/qloo-proof.md).

The reproducible published-case report is [results/qloo-proof.md](../results/qloo-proof.md); the full per-signal outputs and evidence references are [results/qloo-proof.json](../results/qloo-proof.json). These artifacts are generated from the committed public-case manifest by `npm run reproduce:qloo-proof`.

The most important result is methodological: Houselights now exposes the precise saved observations and policy choices behind each lineup, then reruns all 16 signal combinations under a locked brief. This shows when Qloo information changes an internal booking decision. It does **not** show that the resulting event sells more tickets or is preferred by independent bookers.

The public 60-second path now starts with the saved New York brief: review the original lineup, cut the budget below its quoted fees, inspect the feasible replacement and recorded Qloo research steps, then open the same case in Proof Lab. The trace summarizes saved receipt metadata; it does not claim to reproduce hidden reasoning or make a live provider call. In that case, the full-evidence and no-evidence lineups differ while both meet the original booking constraints; withdrawing audience ranking alone also changes the selection. The Berlin case remains selectable and honestly reports an unchanged selection when Qloo evidence is removed. These are internal decision counterfactuals under illustrative booking terms.

Current coverage is four distinct published briefs in four cities with four distinct pools. Three have comparable saved LLM controls; the fourth is explicitly non-comparable. The available controls in this small manifest have zero operational failures, so there is no evidence here of a general LLM failure rate or Houselights superiority. The 95% Wilson upper bound for 0/3 failures is broad. The twelve-distinct-brief target remains open.

No reviewer invitations have been sent and no independent ballots or held-out event outcomes are represented in this report. The blind-review infrastructure is ready to accept genuine reviewers when the organizer chooses to resume that track. The separate discovery-comparison API is ready for independently sourced candidate lists, but no Qloo-versus-LLM-versus-non-Qloo discovery outcome is claimed without those lists and external source checks.
