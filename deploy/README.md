# Public release inputs

`judge-cases.json` contains four curated projections of the previously recorded
Manchester, Berlin, New York and Mumbai benchmark campaign. Booking fees and
availability are illustrative. The first three contain real saved Groq controls;
Mumbai retains its incomplete-ranking refusal and no model call.

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
