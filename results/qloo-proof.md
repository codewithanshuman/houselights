# Qloo decision proof — reproducible published-case suite

Source: deploy/judge-cases.json
Manifest digest: sha256:2830536b6dbd71c9a0505291b8f5b72b6d23697bcf0bb51f05ff7e5570eafba4

Published records: **12**; distinct briefs: **12**; distinct candidate pools: **12**; cities: **11**.
Twelve-distinct-brief target met: **yes**.

| Case | City | Candidates | Evidence | Qloo rank comparable | Saved LLM | Full feasible | Near-ties in Qloo affinity (band 0.002) | Bill under affinity scores | Report digest |
| --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- |
| Manchester: compare all three methods | Manchester | 5 | saved live | yes | feasible | yes | — | same | sha256:fe539df867838ea144cb9af75897780375fa8ba71e53332041764236de2f5a78 |
| Berlin: compare all three methods | Berlin | 5 | saved live | yes | feasible | yes | Floating Points / Moderat (0.0016) | same | sha256:68d9eef4850b1d1850a462c3b2cf69fced04a67cc1fca1cf2b95a3b0d286954d |
| New York: compare all three methods | New York | 5 | saved live | yes | feasible | yes | Sault / Jordan Rakei (0.0001) | **differs:** Michael Kiwanuka + Jordan Rakei | sha256:253639a4e94552064a28075c0e3246944fb351178b0894b2c3a888b0bfe74601 |
| Mumbai: why a comparison is unavailable | Mumbai | 5 | saved live | **no** | not_comparable | yes | — | n/a (scores incomplete) | sha256:c83d931d85745e94cc3afda264849bd186017638297c714adac21a066beca194 |
| New York: watch a recorded Qloo research run | New York | 8 | saved live | yes | unavailable | yes | Charlotte Day Wilson / Lady Wray / St. Paul & The Broken Bones (0.0013); Sault / Jordan Rakei (0.0001) | same | sha256:623c16923dea167d8b8b792dd2ae42e746ee82ea215756d83c9251413c5fcd83 |
| Illustrative: London alternative bill | London | 6 | saved live | yes | feasible | yes | — | same | sha256:f85223461afedbe1a9077af44601996ba825a210b6df6ab7e354f64167e91e24 |
| Illustrative: Paris crossover bill | Paris | 5 | saved live | **no** | not_comparable | no | — | n/a (scores incomplete) | sha256:47fee4d1a91db20a8dc907510528519bbde1b8e27c7d660aafc041ec8bd33c5c |
| Illustrative: Amsterdam electronic bill | Amsterdam | 6 | saved live | yes | feasible | yes | Maribou State / Floating Points (0.0007) | same | sha256:288ef4e105ba3ee8359c8272b72e6678c5f43c2eeaff4896dbf0e7b47a439cb1 |
| Illustrative: Toronto soul and jazz bill | Toronto | 6 | saved live | yes | feasible | yes | — | same | sha256:e13bdd74df3733cbcc37754eae94a380ca79f27f4c11fceb9696a3f2a44822ea |
| Illustrative: Los Angeles jazz and hip-hop bill | Los Angeles | 5 | saved live | yes | feasible | yes | — | same | sha256:711271931f1d23ff23cea020dbf84539b910efe9a7b1cee8cb2950baf2614eb8 |
| Illustrative: São Paulo independent bill | São Paulo | 6 | saved live | yes | feasible | yes | DUDA BEAT / Tuyo / Luedji Luna (0.0031); Baco Exu do Blues / Tim Bernardes (0.0011) | same | sha256:4af424e733e6d4b34540bf238553932bbc08ae2ef6293cdc235f6096db005fae |
| Illustrative: Sydney psychedelic and indie bill | Sydney | 6 | saved live | **no** | not_comparable | yes | — | n/a (scores incomplete) | sha256:4f51413075f6f9d610fd5eaf6fb2c6f2a2a55afa3be1c0e70ec7a796402e9bd7 |

Comparisons below use the 9 briefs with a comparable Qloo ranking. Excluded: Mumbai: why a comparison is unavailable; Illustrative: Paris crossover bill; Illustrative: Sydney psychedelic and indie bill. In these, Qloo did not rank every candidate, so no comparable fit exists.
Locked reports use the original ordinal-rank fit. The affinity columns are a disclosure computed from the saved Qloo scores; they do not alter the locked results.

Saved LLM control failure rate (comparable briefs): 0/8 available attempts. Repeated attempts on one brief are not independent markets.
Genuine blinded review judgments: 0 in this manifest. Observed event outcomes: 0 in this manifest.

The 16 signal combinations and receipt withdrawals are internal decision diagnostics. They do not measure causal Qloo uplift or audience preference.
The detailed locked inputs, receipts and per-coalition outputs are in `results/qloo-proof.json`.
