# Public release inputs

`judge-cases.json` contains five curated projections: the previously recorded
Manchester, Berlin, New York and Mumbai benchmark campaign, plus a separate
2026-10-23 New York provider-backed research run. Booking fees and availability
are illustrative. The first three contain real saved Groq controls; Mumbai
retains its incomplete-ranking refusal and no model call. The new New York run
contains a complete 31-event application trace and 18 linked live-Qloo receipts,
but no saved comparable first-trial festival LLM control. The frozen shock v2
study continues to use the original four public cases listed in
`evals/shock-cohort.json`; the new run is not silently counted as a fifth shock
study brief without captured re-prompts.

The file is intended for public distribution. It omits private source IDs, raw
provider responses, model prose, review invitations, commercial documents and
credentials. Provider hashes identify application-recorded observations; they
are not provider signatures or independent evidence of event success.

Set `JUDGE_CASES_FILE` to seed these cases at server startup. Imports are atomic
and tracked by content digest. Restarting with the same seed cannot resurrect a
case an organizer deliberately unpublished. Updating the seed is an explicit new
release import.

`free-vm/` provides a Docker Compose configuration for an existing Linux VM.
It does not create a cloud account or resources, authorize spending, configure
DNS/firewall rules, or establish that free compute capacity is available.
See [the free hosting runbook](../docs/free-hosting.md).
