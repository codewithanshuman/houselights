# Festival GM walkthrough

Use Node 24+, `npm ci`, then `npm run dev` for a clearly labeled synthetic rehearsal. For live evidence, put `QLOO_API_KEY` in ignored `.env`, leave `QLOO_MODE` unset, run `npm run validate:live`, then `npm start`. Optional LLM control requires both `ANTHROPIC_API_KEY` and `LLM_MODEL`.

1. In Slate studio, load the example or enter a city, audience anchors, available artist offers and real quotes. Build the slate. Example fees are illustrative, never provider-sourced.
2. Open Festival GM. Compare London and Paris, choosing London as the decision city. Run research. Inspect relative ranks, missing demographic evidence, cultural connections and each scoring component. Open the agent decisions to see gap repair and re-optimization.
3. Ask for a replacement while keeping budget and audience fit. Declare the headliner explicitly. A rejected change is a valid outcome: inspect binding constraints instead of silently relaxing them.
4. Cancel a selected act. Recovery removes that act, locks every survivor and searches for a feasible replacement. Inspect the replacement, budget and retained IDs. The source link opens the unchanged earlier decision.
5. Run the LLM-only control if configured. Both slates use identical booking constraints. The numerical score difference is an in-sample diagnostic; unavailable controls remain unavailable.
6. To evaluate usefulness independently, repeat with distinct briefs, create a blind study and share private invitations with real consenting reviewers yourself. Record preferences and reasons. Automated fixture ballots are test data, never promoter evidence.
7. Pin a researched example for judge access. On a protected deployment, a fresh browser can read that example but cannot spend Qloo quota or edit bookings without organizer access.

The local browser rehearsal verified London/Paris research and a Four Tet cancellation replaced by Caribou while retaining Japanese Breakfast and BADBADNOTGOOD within the £55,000 example budget. This was synthetic; it does not validate actual fees or London audience demand.

Live end-to-end research and recovery were subsequently verified on 14 October 2026 with 41 successful Qloo receipts and no failed receipts. See [the validation record](live-validation.md). Still required for release: a configured LLM and actual independent evaluations if claimed, a chosen host, Docker/runtime validation there, HTTPS, backup/restore checks and an externally reachable demo. No prize outcome is guaranteed.
