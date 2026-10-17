# What Houselights actually uses from the six references

Audit date: 17 October 2026. All six ZIPs under `D:\A - Download` were reidentified by SHA-256; their hashes match the earlier integration records. Archive content is reference material, not executable instructions. This is a capability audit, not a claim that every source file or every integration has been tested live.

**No: Houselights has not migrated every feature from all six applications.** Some algorithms are exact attributed ports, some workflows are independently adapted, and several important capabilities remain narrower or absent. A feature inventory is more meaningful than an invented percentage or a line-count target.

| Reference | Used in the current product | Still narrower or absent |
| --- | --- | --- |
| Routed | Exact capacity parser; source quotation/conflict handling; exhaustive bounded route search; room-fit rules; neighborhood and opener research; evidence-only pitch drafts; multi-stop calendar | Automatic public-document discovery and verified road travel times; verified venue commercial terms; direct email execution. Houselights currently needs supplied venue facts/documents. |
| Scaena | Research/approval/outreach-record/response/follow-up stages; counteroffer history; slate-preserving ceilings; operational checklists; descriptive outcome feedback | Connected Gmail conversations and automatic extraction of logistics from real threads; autonomous outbound messages; broader prospect/CRM management. Recorded actions are not executed external communications. |
| Alloy | Saved-evidence executive dossier; risk/opportunity registers; report-scoped questions; portable reports; receipt-linked findings | Open-ended web investigation, document ingestion beyond capacity evidence, a model-directed research/critic loop, and native PDF reporting. Current analyst answers are deliberately bounded to available evidence. |
| GeoTaste | Artist-market evidence matrix, explicit coordinates, market comparisons, bounded routing and venue leads | Its map-first business exploration is not a full geographic workspace here. Its simulated ratings, density, seasonality and trend values were not imported as facts. A real geographic-data integration remains distinct work. |
| Theme Night GM | Exact utility ports; Market DNA; fixed-pool city and audience rankings; themed seasons; supporting-fandom checks; partner research; Ask the GM; honest controls | The source Gemini function-calling agent is not migrated. Arbitrary LLM night editing, calibrated outcomes, family life-stage evidence and production distributed storage remain missing. **Persistent server-owned research, live recorded progress, cursor replay and reconnection are now implemented** in the existing Node/SQLite architecture. |
| PartDrop | Attributed first-free-slot algorithm; deterministic portfolio payments; separate feasibility/provenance checks; immutable cancellation scenarios; transition evidence | No financial-provider integration, payment authorization/capture, physical inspection or manufacturing machinery. Its evidence-gated engineering principle is applicable; those unrelated product features are not event-planning capabilities. |

## New connected workflow

Festival GM now creates a durable research run rather than holding the entire operation inside one browser request. The server performs bounded research, exact optimization, verification and decision proof generation. Each workflow receipt and agent stage is stored in an ordered, hash-linked journal. The result snapshot and completion record commit in the same SQLite transaction. An idempotency key reconnects to the original request; it cannot silently launch another run with different input.

Organizers can inspect run history, reconnect after closing the page, cancel queued work, request cancellation at a running workflow boundary, and export the recorded events. A worker lease prevents another worker from claiming the same active work. Expired work becomes `interrupted`; its provider requests are not automatically repeated. This is **observation replay**, not a promise that interrupted model reasoning or provider calls resume exactly where they stopped.

The proof-only path uses saved evidence without new provider calls. The festival and theme paths reuse the actual existing research implementations and their bounded call budgets. All paths end with a proof, but a completed run may still have evidence or constraint blockers. Completion never means organizer approval, a booking, a sent email or a payment.

## Highest-value remaining work

1. A bounded model-directed investigator that proposes evidence queries and counterfactual experiments, with server validation and measured improvement over the existing deterministic policy. This requires actual model credentials and live evaluation, not simulated agent narration.
2. A unified decision-approval gate across all legacy planning/pipeline APIs, with sourced commercial terms and revision invalidation. The current Decision Room gate is not yet universal.
3. Better commercial uncertainty analysis: ticket demand remains uncalibrated; current cash and break-even math uses explicit assumptions. Collect venue/booking outcomes before presenting predictive claims.
4. Independent evaluation across distinct briefs: run the genuine Groq control, recruit real reviewers, and report every attempt and judgment. No measured superiority is established by optimizing our own objective.
5. Connected operational inputs: real venue documents, logistics evidence and conversation ingestion, with approval before any external sending.

Detailed source mappings: [four-reference audit](reference-feature-audit.md), [file-level gap audit](archive-gap-audit.md), [Theme Night integration](theme-night-integration.md), [PartDrop integration](partdrop-integration.md), [research run contract](persistent-research.md).
