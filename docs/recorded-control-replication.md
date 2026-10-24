# Separate recorded-brief LLM replication

This study is separate from the original New York agent recording. Its protocol was committed as `9da198c` before the three provider requests. It does not retrofit a contemporaneous control into the original case or replace that source snapshot.

## Declared comparison

`evals/recorded-control-protocol.json` freezes the exact public snapshot digest, provider (`groq`), model (`openai/gpt-oss-120b`), three trials, temperature zero, no tools, no new Qloo requests, and first-trial reporting. All attempts are retained; missing, invalid, failed or interrupted results cannot be repaired or resampled. A rerun of the capture command replays the existing journal and makes no provider request. A conservative reservation of at most 30,000 tokens was enforced for this three-call experiment. Provider-reported actual usage was **2,837 tokens** across the three requests. This is usage, not an inferred monetary charge or a global account spend cap.

## Actual result

All three real responses returned Michael Kiwanuka + Jordan Rakei for **US$10,000**, with all hard constraints passing. The original Houselights selection is Michael Kiwanuka + Sault for **US$13,500**. The first trial is the declared primary result. The LLM selection is **US$3,500 cheaper**. There was one distinct lineup across three returned responses; these are repeated attempts on one brief, not three independent markets.

This does not establish a Houselights win. Whether the culturally informed policy warrants the additional spend requires independent promoter judgments and event outcomes. Policy points reward the optimizer's own declared objective and cannot answer that question. The shared artist pool already includes Qloo-discovered candidates; this is a selection test, not a discovery-benefit test. Fees and availability are illustrative. Controls were collected after the original Qloo research, and no blind judgments or ticket outcomes were collected.

## Provenance and replay

The public allowlisted artifact is `public/recorded-control-study.json`. It includes the frozen brief and protocol hashes, model metadata, recorded request/response digests, token usage, selected IDs and recomputed constraint checks. It excludes model prose, request IDs, credentials and private source IDs. Hashes are application hashes, not provider signatures. The full original provider response bodies were not retained by the existing provider adapter; the retained private journal contains the benchmark projections and unverified model explanations. Do not claim these hashes provide independent raw-payload or provider-signature verification.

The retained private journal remains ignored and untracked. Its exact SHA-256 file digest is `789fdc3ad0714f41d4a700f55030058851b95cf199a3c17cf56bd21436e3525c`. Locally, `npm run reproduce:recorded-control` checks this digest and regenerates the public projection without calling a provider. CI verifies the public input hashes and independently recomputes feasibility and fees from the frozen brief; it cannot verify the private journal without access to that file.

The booking desk shows the original all-signal withdrawal test separately from this later tool-free-model comparison. The original public record remains immutable and continues to disclose that no contemporaneous control was captured. Real reviewers and physical-phone testing remain pending user-provided participants.
