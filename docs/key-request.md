# Qloo key request

The supplied [Qloo request form](https://docs.google.com/forms/d/1G_udB8rJTlSwwCx9LF1vaftYI4Qf459ZXIKqLPElWc8/viewform) was accessible in the browser on 11 October 2026. It asks for email, first and last name, Devpost username, country, a project idea, and acceptance of the hackathon API rules. GitHub username is optional.

Suggested project description:

> Houselights is an evidence-backed slate optimizer for independent live-music venues and promoters. It resolves artist identities, uses Qloo to discover and rank culturally relevant acts for a room's audience, then optimizes the entire bill against budget, availability, genre, discovery and booking constraints. Buyers can inspect the exact tool receipts, test higher quotes and alternative budgets, and save auditable scenarios. Aggregate taste signals are kept separate from buyer-entered fees; the product does not claim to forecast ticket sales.

After receiving the key, copy `.env.example` to `.env` only if it does not already exist, and set `QLOO_API_KEY` locally. Do not paste the key into chat, browser UI, issues or tracked files. This project's issued key was verified against `https://hackathon.api.qloo.com` after the production host returned 401. Set both `QLOO_BASE_URL` and `QLOO_TRUSTED_BASE_URL` to that explicitly chosen endpoint. There is no automatic fallback to another host or credential. Production Qloo keys may have different scope; follow their issuing instructions.

Run `npm run validate:live` for bounded checks and a saved report, then `npm start` for live mode. The adapter launches the installed official MCP module directly, avoiding the interactive CLI router's startup dependencies. The harness version is pinned and its actual stdio initialization is regression-tested.
