# Devpost draft — Houselights

## Inspiration

Talent buyers often know the room they want to fill, but must turn audience taste, artist availability, fees and programming rules into one defensible lineup. A popular artist can be a poor fit for a specific market; a strong recommendation can fail as soon as a quote rises or a headliner cancels. Houselights treats the whole event decision as the unit of work.

## What it does

Houselights is an AI decision room for live entertainment. Enter a city, audience anchor artists, candidate offers and booking constraints. Its agent resolves artist identities, discovers adjacent talent, gathers Qloo ranking and context receipts, and allocates deeper checks within a bounded call budget. An exact optimizer searches feasible lineups under budget, slot, genre, availability and lock rules. Every conclusion links back to an inspectable observation or explicitly states that evidence is missing.

Buyers can change assumptions, run cancellations and quote shocks, compare alternative slates, inspect decision proof, and preserve an operational audit trail. A live event trace shows the agent's actual stages and tool receipts; saved traces can be replayed. The public decision room lets judges change a budget, withdraw Qloo evidence, and inspect the resulting proof without an account or new provider calls.

## How we built it

The backend runs on Node.js with the official Qloo MCP harness. The agent plans bounded Qloo workflows; receipts record query scope, result status and evidence. A separate exact optimizer handles hard booking constraints and reports explicit infeasibility. Optional Groq model calls support tool-free baseline selection and evidence planning, while deterministic checks prevent unsupported numeric or commercial claims. SQLite persists decisions, traces, quotas and review records. The free public demo runs on an existing Oracle ARM VM behind HTTPS, with a persistent volume and a read-only public judge surface.

## What we tested

We reproduced 93 deterministic budget, cancellation, fee and unavailability shocks across saved live-Qloo cases and two clearly labeled synthetic stress cases with 10–12 candidates and 4–5 slots. For comparable shocks, we captured three independent LLM re-prompts from the same shocked brief. Houselights proposed zero hard-constraint violations and explicitly abstained seven times when no feasible slate existed. In the 12-candidate synthetic case, 7 of 72 returned re-prompted LLM responses proposed at least one hard-constraint violation (9.7%). This demonstrates constraint enforcement, an intended property of an exact optimizer. It does **not** establish better ticket sales, artistic quality or causal commercial value from Qloo.

## Challenges and next steps

Missing Qloo evidence must remain missing rather than being converted into a guessed fit score. A saved first-trial LLM control must stay the first trial even when it fails. Shared free-tier keys need bounded spending, persistent quotas and cache reuse. Human validation remains the key next step: no independent booker judgments or verified artist quotes/availability messages have been collected yet. Houselights shows that gap plainly on its evidence page.

- Public demo: https://houselights.80-225-218-239.sslip.io/
- Source and setup: https://github.com/codewithanshuman/houselights
- License: MIT for project code; supplied artwork provenance is documented separately.
