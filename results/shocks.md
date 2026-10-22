# Deterministic shock replay

Deterministic single shocks against public seeded judge cases. Fees and availability are illustrative. Houselights re-optimizes through judgeExperiment; the static LLM replays its saved first-trial lineup; the re-prompted LLM uses a captured tool-free response to the shocked brief. Acts changed counts IDs in the symmetric difference from that arm’s original lineup. Abstention is not a feasible lineup and is not counted as a hard-constraint violation.

Houselights has zero proposed-lineup violations by construction: its exact optimizer only returns lineups that satisfy its constraints. This is an engineering property, not independent evidence of better attendance, revenue, or cultural demand.

| Arm | Shocks | Feasible | Abstained | Invalid or infeasible | Unavailable | Hard violations |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| houselights | 36 | 34 | 2 | 0 | 0 | 0 |
| staticLlm | 36 | 15 | 0 | 12 | 9 | 13 |
| repromptedLlm | 36 | 24 | 0 | 3 | 9 | 3 |

| Case | Shock | Arm | Status | Feasible | Hard violations | Acts changed |
| --- | --- | --- | --- | --- | --- | ---: |
| Manchester: compare all three methods | Budget 90% | houselights | feasible | yes | none | 0 |
| Manchester: compare all three methods | Budget 90% | staticLlm | feasible | yes | none | 0 |
| Manchester: compare all three methods | Budget 90% | repromptedLlm | feasible | yes | none | 2 |
| Manchester: compare all three methods | Budget 80% | houselights | feasible | yes | none | 0 |
| Manchester: compare all three methods | Budget 80% | staticLlm | feasible | yes | none | 0 |
| Manchester: compare all three methods | Budget 80% | repromptedLlm | feasible | yes | none | 0 |
| Manchester: compare all three methods | Budget 70% | houselights | abstained | no | none | — |
| Manchester: compare all three methods | Budget 70% | staticLlm | infeasible | no | budget | 0 |
| Manchester: compare all three methods | Budget 70% | repromptedLlm | infeasible | no | slots | 2 |
| Manchester: compare all three methods | Cancel Nubya Garcia | houselights | feasible | yes | none | 2 |
| Manchester: compare all three methods | Cancel Nubya Garcia | staticLlm | infeasible | no | exclusions | 0 |
| Manchester: compare all three methods | Cancel Nubya Garcia | repromptedLlm | feasible | yes | none | 2 |
| Manchester: compare all three methods | Raise Nubya Garcia fee 15% | houselights | feasible | yes | none | 0 |
| Manchester: compare all three methods | Raise Nubya Garcia fee 15% | staticLlm | feasible | yes | none | 0 |
| Manchester: compare all three methods | Raise Nubya Garcia fee 15% | repromptedLlm | feasible | yes | none | 2 |
| Manchester: compare all three methods | Mark Nubya Garcia unavailable | houselights | feasible | yes | none | 2 |
| Manchester: compare all three methods | Mark Nubya Garcia unavailable | staticLlm | infeasible | no | availability | 0 |
| Manchester: compare all three methods | Mark Nubya Garcia unavailable | repromptedLlm | feasible | yes | none | 2 |
| Manchester: compare all three methods | Cancel Alfa Mist | houselights | feasible | yes | none | 2 |
| Manchester: compare all three methods | Cancel Alfa Mist | staticLlm | infeasible | no | exclusions | 0 |
| Manchester: compare all three methods | Cancel Alfa Mist | repromptedLlm | feasible | yes | none | 2 |
| Manchester: compare all three methods | Raise Alfa Mist fee 15% | houselights | feasible | yes | none | 0 |
| Manchester: compare all three methods | Raise Alfa Mist fee 15% | staticLlm | feasible | yes | none | 0 |
| Manchester: compare all three methods | Raise Alfa Mist fee 15% | repromptedLlm | feasible | yes | none | 0 |
| Manchester: compare all three methods | Mark Alfa Mist unavailable | houselights | feasible | yes | none | 2 |
| Manchester: compare all three methods | Mark Alfa Mist unavailable | staticLlm | infeasible | no | availability | 0 |
| Manchester: compare all three methods | Mark Alfa Mist unavailable | repromptedLlm | feasible | yes | none | 2 |
| Berlin: compare all three methods | Budget 90% | houselights | feasible | yes | none | 0 |
| Berlin: compare all three methods | Budget 90% | staticLlm | infeasible | no | budget | 0 |
| Berlin: compare all three methods | Budget 90% | repromptedLlm | feasible | yes | none | 2 |
| Berlin: compare all three methods | Budget 80% | houselights | feasible | yes | none | 0 |
| Berlin: compare all three methods | Budget 80% | staticLlm | infeasible | no | budget | 0 |
| Berlin: compare all three methods | Budget 80% | repromptedLlm | feasible | yes | none | 4 |
| Berlin: compare all three methods | Budget 70% | houselights | abstained | no | none | — |
| Berlin: compare all three methods | Budget 70% | staticLlm | infeasible | no | budget | 0 |
| Berlin: compare all three methods | Budget 70% | repromptedLlm | infeasible | no | slots | 2 |
| Berlin: compare all three methods | Cancel Jon Hopkins | houselights | feasible | yes | none | 2 |
| Berlin: compare all three methods | Cancel Jon Hopkins | staticLlm | infeasible | no | locks | 0 |
| Berlin: compare all three methods | Cancel Jon Hopkins | repromptedLlm | feasible | yes | none | 4 |
| Berlin: compare all three methods | Raise Jon Hopkins fee 15% | houselights | feasible | yes | none | 0 |
| Berlin: compare all three methods | Raise Jon Hopkins fee 15% | staticLlm | feasible | yes | none | 0 |
| Berlin: compare all three methods | Raise Jon Hopkins fee 15% | repromptedLlm | feasible | yes | none | 0 |
| Berlin: compare all three methods | Mark Jon Hopkins unavailable | houselights | feasible | yes | none | 2 |
| Berlin: compare all three methods | Mark Jon Hopkins unavailable | staticLlm | feasible | yes | none | 0 |
| Berlin: compare all three methods | Mark Jon Hopkins unavailable | repromptedLlm | feasible | yes | none | 2 |
| Berlin: compare all three methods | Cancel Floating Points | houselights | feasible | yes | none | 2 |
| Berlin: compare all three methods | Cancel Floating Points | staticLlm | infeasible | no | locks | 0 |
| Berlin: compare all three methods | Cancel Floating Points | repromptedLlm | feasible | yes | none | 2 |
| Berlin: compare all three methods | Raise Floating Points fee 15% | houselights | feasible | yes | none | 0 |
| Berlin: compare all three methods | Raise Floating Points fee 15% | staticLlm | feasible | yes | none | 0 |
| Berlin: compare all three methods | Raise Floating Points fee 15% | repromptedLlm | feasible | yes | none | 0 |
| Berlin: compare all three methods | Mark Floating Points unavailable | houselights | feasible | yes | none | 2 |
| Berlin: compare all three methods | Mark Floating Points unavailable | staticLlm | feasible | yes | none | 0 |
| Berlin: compare all three methods | Mark Floating Points unavailable | repromptedLlm | invalid_response | no | candidate_id | — |
| New York: compare all three methods | Budget 90% | houselights | feasible | yes | none | 2 |
| New York: compare all three methods | Budget 90% | staticLlm | feasible | yes | none | 0 |
| New York: compare all three methods | Budget 90% | repromptedLlm | feasible | yes | none | 0 |
| New York: compare all three methods | Budget 80% | houselights | feasible | yes | none | 2 |
| New York: compare all three methods | Budget 80% | staticLlm | feasible | yes | none | 0 |
| New York: compare all three methods | Budget 80% | repromptedLlm | feasible | yes | none | 0 |
| New York: compare all three methods | Budget 70% | houselights | feasible | yes | none | 2 |
| New York: compare all three methods | Budget 70% | staticLlm | feasible | yes | none | 0 |
| New York: compare all three methods | Budget 70% | repromptedLlm | feasible | yes | none | 2 |
| New York: compare all three methods | Cancel Michael Kiwanuka | houselights | feasible | yes | none | 2 |
| New York: compare all three methods | Cancel Michael Kiwanuka | staticLlm | infeasible | no | locks, exclusions | 0 |
| New York: compare all three methods | Cancel Michael Kiwanuka | repromptedLlm | feasible | yes | none | 2 |
| New York: compare all three methods | Raise Michael Kiwanuka fee 15% | houselights | feasible | yes | none | 0 |
| New York: compare all three methods | Raise Michael Kiwanuka fee 15% | staticLlm | feasible | yes | none | 0 |
| New York: compare all three methods | Raise Michael Kiwanuka fee 15% | repromptedLlm | feasible | yes | none | 0 |
| New York: compare all three methods | Mark Michael Kiwanuka unavailable | houselights | feasible | yes | none | 2 |
| New York: compare all three methods | Mark Michael Kiwanuka unavailable | staticLlm | infeasible | no | availability | 0 |
| New York: compare all three methods | Mark Michael Kiwanuka unavailable | repromptedLlm | feasible | yes | none | 4 |
| New York: compare all three methods | Cancel Sault | houselights | feasible | yes | none | 2 |
| New York: compare all three methods | Cancel Sault | staticLlm | feasible | yes | none | 0 |
| New York: compare all three methods | Cancel Sault | repromptedLlm | feasible | yes | none | 0 |
| New York: compare all three methods | Raise Sault fee 15% | houselights | feasible | yes | none | 2 |
| New York: compare all three methods | Raise Sault fee 15% | staticLlm | feasible | yes | none | 0 |
| New York: compare all three methods | Raise Sault fee 15% | repromptedLlm | feasible | yes | none | 4 |
| New York: compare all three methods | Mark Sault unavailable | houselights | feasible | yes | none | 2 |
| New York: compare all three methods | Mark Sault unavailable | staticLlm | feasible | yes | none | 0 |
| New York: compare all three methods | Mark Sault unavailable | repromptedLlm | feasible | yes | none | 0 |
| Mumbai: why a comparison is unavailable | Budget 90% | houselights | feasible | yes | none | 0 |
| Mumbai: why a comparison is unavailable | Budget 90% | staticLlm | unavailable | no | none | — |
| Mumbai: why a comparison is unavailable | Budget 90% | repromptedLlm | not_comparable | no | none | — |
| Mumbai: why a comparison is unavailable | Budget 80% | houselights | feasible | yes | none | 0 |
| Mumbai: why a comparison is unavailable | Budget 80% | staticLlm | unavailable | no | none | — |
| Mumbai: why a comparison is unavailable | Budget 80% | repromptedLlm | not_comparable | no | none | — |
| Mumbai: why a comparison is unavailable | Budget 70% | houselights | feasible | yes | none | 0 |
| Mumbai: why a comparison is unavailable | Budget 70% | staticLlm | unavailable | no | none | — |
| Mumbai: why a comparison is unavailable | Budget 70% | repromptedLlm | not_comparable | no | none | — |
| Mumbai: why a comparison is unavailable | Cancel The Local train | houselights | feasible | yes | none | 2 |
| Mumbai: why a comparison is unavailable | Cancel The Local train | staticLlm | unavailable | no | none | — |
| Mumbai: why a comparison is unavailable | Cancel The Local train | repromptedLlm | not_comparable | no | none | — |
| Mumbai: why a comparison is unavailable | Raise The Local train fee 15% | houselights | feasible | yes | none | 2 |
| Mumbai: why a comparison is unavailable | Raise The Local train fee 15% | staticLlm | unavailable | no | none | — |
| Mumbai: why a comparison is unavailable | Raise The Local train fee 15% | repromptedLlm | not_comparable | no | none | — |
| Mumbai: why a comparison is unavailable | Mark The Local train unavailable | houselights | feasible | yes | none | 2 |
| Mumbai: why a comparison is unavailable | Mark The Local train unavailable | staticLlm | unavailable | no | none | — |
| Mumbai: why a comparison is unavailable | Mark The Local train unavailable | repromptedLlm | not_comparable | no | none | — |
| Mumbai: why a comparison is unavailable | Cancel Ankur Tewari | houselights | feasible | yes | none | 2 |
| Mumbai: why a comparison is unavailable | Cancel Ankur Tewari | staticLlm | unavailable | no | none | — |
| Mumbai: why a comparison is unavailable | Cancel Ankur Tewari | repromptedLlm | not_comparable | no | none | — |
| Mumbai: why a comparison is unavailable | Raise Ankur Tewari fee 15% | houselights | feasible | yes | none | 0 |
| Mumbai: why a comparison is unavailable | Raise Ankur Tewari fee 15% | staticLlm | unavailable | no | none | — |
| Mumbai: why a comparison is unavailable | Raise Ankur Tewari fee 15% | repromptedLlm | not_comparable | no | none | — |
| Mumbai: why a comparison is unavailable | Mark Ankur Tewari unavailable | houselights | feasible | yes | none | 2 |
| Mumbai: why a comparison is unavailable | Mark Ankur Tewari unavailable | staticLlm | unavailable | no | none | — |
| Mumbai: why a comparison is unavailable | Mark Ankur Tewari unavailable | repromptedLlm | not_comparable | no | none | — |

The static LLM arm is a fixed-selection stress test, not a new model run. Cases without a published comparable LLM control remain unavailable. A re-prompted response is reported only when a live provider response has been captured and matched to the exact shocked brief.
