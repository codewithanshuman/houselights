# Advanced decision workflows — 18 October 2026

These additions connect investigation, evidence review, exact scenario analysis and planning approval. They do not authenticate commercial claims or promise a competition outcome.

## Model-directed investigation

In Festival GM, open **Model-directed investigator**, enter a question, and set a maximum of 0–4 new Qloo queries. A durable `investigation` research job allows 3–10 model steps. It can inspect saved receipts, read a deterministic decision proof, query a fixed candidate pool in organizer-permitted markets, inspect artist geography/demographics, and test hypothetical budgets, locks and exclusions. Existing locks and exclusions cannot be silently removed. Completion requires an executed evidence inspection, a changed scenario and a citation to that scenario. Exhausted query actions are removed from the native schema; a ready final step permits only `finish`.

The provider returns a native `submit_investigation_action` function call. The server checks the tool, argument allowlist, candidate IDs, permitted markets, budgets, duplicate actions and observation citations. Actual execution stays in the application. This follows the local-execution pattern in [Groq's official documentation](https://console.groq.com/docs/tool-use/local-tool-calling); Anthropic uses the corresponding native tool-use response. Benchmark requests still enable no tools.

The model receives observations from prior steps and can correct a rejected request. Every attempted model generation, rejected action and successful observation is journaled. Findings are explicitly model interpretations; matching a citation ID does not prove that the interpretation follows from it. A preferred alternative must point to a feasible server-executed scenario. **Save proposed scenario for review** recomputes and saves an immutable child with a new proof, without granting approval.

Provider token-limit headers pace subsequent requests. A valid Retry-After of at most 60 seconds permits at most two retained retries, each consuming a model step. Cancellation is checked during waits. No provider error is replaced with invented reasoning. The application may end with partial evidence, `model_unavailable` or `step_limit`; a finished job is not necessarily a completed investigation. Interrupted provider execution is not automatically resumed after a server restart.

## Private commercial evidence

Load a saved decision's commercial evidence, choose an artist, and import original quote/document/email text with a source reference and observation date. The importer extracts only conservative labeled fields such as `Fee: GBP 8000`, `Availability: available`, `Event date:`, `Load in:`, `Set length:`, `Deposit:` and `Contact:`. It preserves original text, exact lines, a content digest and review history. Unstructured prose stays unparsed; currencies are not converted.

An organizer accepts or rejects each quotation with a reason. Coverage distinguishes missing, unknown, conflicting, differing, and matching reviewed terms. A match means the supplied text and organizer review agree with the planning assumption; it does not independently authenticate the sender, establish contract rights, or prove current availability. Original documents are stored separately from public snapshot JSON and require organizer access on protected deployments. Immutable children inherit independent copies of their sources and review history.

API: `GET /api/operational-evidence/:id`; `POST /api/operational-evidence/:id/documents` and `/review`. Every write requires `expectedRevision`. Source text is limited to 50,000 characters, 30 documents and 300 reviews per decision. This is text import, not automatic Gmail synchronization, PDF OCR or a web crawler.

## Universal planning approval

Read `GET /api/decision/:id` before approving. Submit the exact `expectedRevision` and `expectedScopeDigest`, acknowledge findings and explain the decision. The scope binds proof inputs, commercial evidence and relevant negotiated terms. Changed evidence invalidates earlier approval, clears the effective draft and requires review again. Conflicting accepted sources or agreed fees differing from the optimized plan block approval until resolved.

`POST /api/packet/:id` requires `expectedDecisionRevision`. Pipeline events require `expectedRevision`; pitch approval, outreach records, proposed counteroffers, follow-ups and logistics also require `expectedDecisionRevision`. Received responses, received counteroffers and notes remain recordable without planning approval. Every gated event records its proof, approval revision and scope digest. These are planning records, not proof that external messages, payments or contracts occurred.

## Joint commercial stress

Use the stress-scenario form or `POST /api/commercial-stress/:id`. Supply 1–20 scenarios with attendance, capacity, ticket price, variable cost, fixed costs, optional artist fees and unavailable artist IDs. Probabilities must either be absent everywhere or sum to one across all scenarios. Money is calculated in integer cents with bounded arithmetic.

The engine evaluates every initially feasible fixed slate against every declared joint scenario. It reports hard failures, margins, break-even attendance and policy-utility regret relative to scenario-specific reoptimization. The proposed robust slate minimizes worst utility regret among slates feasible in every scenario. If none survives, it says so. Failed events have unknown margins, never an invented zero-loss outcome. Attendance is held equal across candidate slates within a scenario; it is not inferred from Qloo ranks. Expected margin is conditional on the user-supplied probabilities and omitted costs remain omitted.

## Independent evaluation and operational readiness

`npm run evaluate:campaign -- manifest.json` runs 1–5 genuine trials on 2–20 predeclared distinct briefs and saves all attempts under ignored `artifacts/`. A manifest contains `sourceIds` and `trials`. Duplicate brief digests are rejected. Only the first trial of each batch is eligible for blind review. No later favorable control substitutes for a failed first trial.

Live checks generated controls for London and Berlin using the same six-artist pool and illustrative booking terms. Six requests yielded five feasible controls and one retained rate-limit error. This is an integration check, not a generalization or superiority result. A two-case study with four reviewer roles is prepared, with zero human ballots. The corrected investigator completed a four-call native Groq run, including a fresh complete Qloo ranking, receipt inspection and a feasible scenario. Server-calculated results appear separately from model commentary: citation references are checked, but prose accuracy is not. The observed model commentary confused the budget with booking cost, so it remains explicitly subject to review. See the [198-test regression and live validation record](live-validation.md).

Local online backup and restore checks passed for all 11 tables of the actual project database. That backup predates the review study and contained no commercial documents, ballots or approval sessions. Public hosting, Docker execution, authenticated commercial data and genuine external judgments remain distinct external requirements. The six archive integrations are scoped adaptations, not a claim that every source project has been ported; [capability status](archive-capability-status.md) records the remaining functions.
