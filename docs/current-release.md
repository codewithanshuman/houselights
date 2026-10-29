# Verified production release — 29 October 2026

Production serves commit [`be5d7ac386efca25e512ef754cf63c88850c800d`](https://github.com/codewithanshuman/houselights/commit/be5d7ac386efca25e512ef754cf63c88850c800d) at [Houselights](https://houselights.80-225-218-239.sslip.io). This is the production verification record, not a claim that later development commits are deployed.

[Exact-commit CI](https://github.com/codewithanshuman/houselights/actions/runs/40749175963) passed on Linux x64 and ARM64 using Node 24.22.1. Each passed 395 executed unit tests and three 18-check transport repetitions. The x64 job additionally passed 91 browser checks across Chromium, Firefox and WebKit, plus five WebKit live-plan repetitions. Both architectures built the actual image and verified container recreation and backup restoration.

Hosted verification passed 88 HTTP checks and 21 anonymous desktop/mobile-emulation journey checks. The 29 October recheck again passed all 88 HTTP checks against that exact production commit. Physical-phone testing remains unavailable. The local isolated release rehearsal passed 88 checks; it verifies its own process restart, not a shared-VM reboot.

All 524 committed source files matched the staged image. Off-host backup restoration matched all 26 database tables. Twelve published snapshots and the retained genuine live plans survived app recreation. Main-branch synchronization is a source-control operation; pushing either branch runs CI and does not deploy production. Verify the hosted commit again after any separately authorized deployment.

The retained original research file still matches SHA-256 `b1e9bfc93cd514b10b1c259504cbc7282a2ae045e6ce5cbc7341debd748b2442` and reproduces the public 31-event, 18-receipt projection. It remains ignored and untracked; private responses and credentials are unpublished.

## Evidence and operational limits

- Genuine first-time usability sessions: **0**; genuine blinded judgments: **0**. The owner will provide participants later.
- Forty publisher-reported historical event rows exist, but zero meet the timestamped pre-event feature gate. Demand, audience and financial scenarios remain uncalibrated. See [demand evidence](demand-model.md), [audience assumptions](audience-twin.md) and [financial validation](financial-validation.md).
- The original recorded-agent case lacks a contemporaneous independent LLM control. The separate later replication selected a feasible lineup $3,500 cheaper than Houselights; it establishes no Houselights win. See [the complete replication](recorded-control-replication.md).
- Fees are illustrative, availability assumed, and per-act genres unverified in anonymous live plans. No commercial uplift is established.
- Application recreation, persistent data and off-host restores were tested. Full VM reboot recovery and sustained-load reliability remain unverified. Shared-VM maintenance must protect unrelated services; no reboot was performed for this release.
- The [live affinity diagnosis](live-affinity-diagnosis.md) describes a subsequent development fix. Its observations do not alter the immutable production example or expand the evaluation cohort.

The earlier [live-validation log](live-validation.md) and [hardening report](production-hardening.md) preserve dated historical checks. Their older counts and deployment statements describe those checkpoints, rather than the current release.
