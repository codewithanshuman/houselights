# Hands-on judge workspace

Open `/judge.html`. A judge can change the budget, lock/exclude artists, cancel a baseline artist, and withdraw a receipt without organizer access. Each experiment recomputes the exact slate, evidence challenges, cost-only alternative, sensitivity and cancellation proof. Fees, availability and genres are explicitly illustrative. No external API calls, booking actions, approvals or saved-plan edits occur.

The comparison table shows the Qloo-informed optimizer, the cheapest feasible lineup and, when published, the saved first-trial LLM selection. All costs and policy points are recomputed from the public inputs; stored model scores and explanations are not trusted. An unchanged case is a saved matched benchmark. Changing booking assumptions or withdrawing evidence produces a **fixed selection replay**: the original model choices remain fixed, constraint violations stay visible, and no new model response or matched-benchmark score delta is claimed. Reset restores the original comparison.

Public cases are separate immutable SQLite records built from an explicit field allowlist. They contain artist identities, planning inputs, normalized evidence and reduced receipts. Source text, contacts, reviewer links, model conversations, approval records and arbitrary snapshot fields are not copied. The projection must preserve the original selected lineup and score or publication is rejected. Original receipt digests identify the saved receipt; they do not claim to hash the reduced public projection.

## Prepare cases

An organizer can publish a saved decision only when its terms are marked illustrative:

```sh
npm run judge:cases -- publish SOURCE_ID "Market and decision challenge"
npm run judge:cases -- export artifacts/judge-public-cases.json
```

Transfer that reviewed export to the chosen backend, then initialize its case catalog:

```sh
npm run judge:cases -- import /private-release/judge-public-cases.json
```

Import revalidates the projection. Re-importing identical content preserves the case ID. Exports omit original source IDs and contain only curated public records; they do not transfer the full private database. The organizer APIs are `POST /api/judge/cases` with `{sourceId,title}` and `DELETE /api/judge/cases/:id` to unpublish. Deleting a case makes future reads and experiments unavailable; it cannot recall copies already downloaded.

To include a control, publish the first-trial child snapshot from a benchmark batch. Publication verifies the recorded brief digest against both the original and public inputs, rechecks both selections, and requires a real tool-free provider response with request/response digests. Later trials, stale briefs and injected test adapters are rejected. Failed, invalid and non-comparable first trials remain visible without substitute lineups. The allowlist exposes the model/provider, status and digests but omits raw responses, model prose, request IDs, batch IDs and private source IDs. These are application-recorded provenance fields, not provider signatures or independent outcome validation.

Anonymous callers can list/read cases and POST to exactly `/api/judge/cases/:id/experiment`. Supported fields are `budget`, `lockedIds`, `excludedIds`, `cancelId` and `withdrawReceiptId`. Unknown fields, candidate IDs, receipt IDs and malformed budgets are rejected. Sources are limited to ten candidates, with twenty calculations per IP per minute and sixty globally per minute. Quotas are not a substitute for production ingress controls.

Cancellation always starts from the published baseline, locks survivors and reports infeasibility when constraints conflict. Each experiment starts from the same public case, not an accumulating chain of browser edits. Withdrawing evidence clears support for every dependent candidate and reruns the missing-evidence penalties; it does not invent replacement ranks. The export records both assumptions and proof.

## Local validation, 20 October 2026

Four cases were prepared from saved live Qloo observations: Manchester, Berlin, New York and Mumbai. Mumbai retains its incomplete ranking and blocked evidence state. The artifact `artifacts/judge-public-cases-2026-10-20.json` is ready for deployment handoff; it has not been publicly uploaded. The judge page uses no supplied artwork. Rights for images on the organizer workspace remain a separate release question.

Four additional versions now preserve the campaign's first trials: Manchester `4986d98dcd8ac838aed3874a`, Berlin `934e002267e2db9ccdc1b5a9`, New York `bf9b65d52eeff00e0e258917` and non-comparable Mumbai `5031a69f837e1c28ce045422`. Original links remain valid. The updated eight-case handoff is `artifacts/judge-comparison-cases-2026-10-20.json`. Manchester's model selection matches the optimizer; Berlin and New York differ. Mumbai made no model call. These are saved observations, not four new model executions or evidence that one method produces better events.

The public demo still needs a persistent hosted backend, a real external URL, hosted restart/backup verification and a final publication decision. Real reviewer judgments and genuine artist quotes remain absent; neither is generated by this workspace.
