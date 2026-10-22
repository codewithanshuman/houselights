# Shock v2 call budget

The captured benchmark is complete. The fixture can be replayed offline with `npm run reproduce:shocks`; this makes **zero** provider calls. A fresh capture is an optional, quota-consuming experiment, not part of the public demo path.

| Case | Candidate / slot count | Deterministic shocks | LLM re-prompts at 3 each |
| --- | ---: | ---: | ---: |
| Synthetic Metro B | 12 / 5 | 24 | 72 |
| Synthetic Metro A | 10 / 4 | 24 | 72 |
| Berlin | 5 / 2 | 15 | 45 |
| New York | 5 / 2 | 12 | 36 |
| Manchester | 5 / 2 | 9 | 27 |
| Mumbai | 5 / 2 | 9 | 0: the first-trial control is non-comparable |
| **Total** | | **93** | **252** |

The two synthetic cases need one original LLM-only lineup each before shock capture, so a clean run makes **254 model requests** at three repeats. At five repeats it would make **422** (84 comparable shocks × 5 + 2 baselines). The fixture stores three returned responses per comparable shock; the 9 Mumbai shocks remain explicitly non-comparable. A request or response failure stays in the fixture and is never replaced by a favorable trial.

As checked on 22 October 2026, [Groq's published Free Plan limits](https://console.groq.com/docs/rate-limits) for `openai/gpt-oss-120b` are 30 requests/minute, 1,000 requests/day, 8,000 tokens/minute and 200,000 tokens/day, shared at the organization level. The **request count alone** fits one day (254 < 1,000). The token ceiling is tighter: 200,000 ÷ 254 = **787 tokens per request**, including input and output, if no other workload uses the account. The client permits up to 4,096 completion tokens for a non-tool Groq attempt, so its configured maximum is **not** a safe one-day token estimate. Actual token use for the saved shock fixture was not retained; response counts cannot establish a measured token total. Cached input tokens may reduce provider-account consumption, but cache hits are not guaranteed.

Before any new capture, check the account's **current** organization limits and remaining daily tokens in the Groq console. Budget against the remaining balance, not the published base limits; reserve capacity for the live app. Capture is resumable and saves each response with the shocked-brief digest. Stop at the provider's limit or an agreed safety margin, resume after reset, and keep missing trials visibly missing. The script starts with the 12-candidate case so the headline can be reproduced first. No paid-tier upgrade is assumed. The prior live capture is already complete, so the suggested “start by hour 12” milestone does not call for another run.
