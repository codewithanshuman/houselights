# First-time usability test kit

This protocol is for the audit's open P1 item: genuine external usability and booking-value feedback. **No session has been run yet.** Do not report any result that was not collected with this kit.

## Participants

- **Five first-time users** with no prior exposure to Houselights. Hackathon judges or technically literate people are suitable.
- **Two working bookers or promoters.** Their task is to judge booking value, not interface polish.

Record each participant's role only. Do not record names.

## Setup

- Use the public judge page, `/judge.html`, on the participant's own device. Use a phone for at least two participants.
- Give no introduction beyond: "This is a tool for deciding which artists to book."
- Do not help unless the participant is stuck for 60 seconds. Every intervention is noted.

## Tasks and success criteria

Time each task and note the first wrong path the participant takes.

| # | Task (read aloud) | Success |
|---|---|---|
| 1 | "Within 30 seconds, tell me what this tool recommends booking." | Names the bill from the decision-at-a-glance card |
| 2 | "Why those artists?" | Mentions Qloo audience fit, not ticket sales |
| 3 | "What should worry you about this recommendation?" | Names a risk from WATCH OUT, or the near-tie |
| 4 | "What does Houselights need *you* to decide?" | Names the YOUR CALL item |
| 5 | "Cut the budget and see whether the plan still works." | Uses the booking desk, and reads the change correctly |
| 6 | "Does this tool know how many tickets each act will sell?" | Answers **no** |

Task 6 checks whether the product's limits come across. A "yes" is a failure of the interface, not of the participant.

## Questions afterwards

Use a 1–5 scale. Free text is optional.

1. I understood what was recommended.
2. I understood why.
3. I would trust this enough to request a hold. *(Bookers only.)*
4. Which word or number confused you most?
5. Booker only: "What would you need to see before using this on a real show?"

## Reporting

- Publish every session in `results/usability/`, including abandoned ones, as one JSON file per participant. Each file records:
  - the participant's role and device
  - the time taken and success for each task
  - interventions
  - the ratings
  - quotes
- Report the success rate for each task as *k / n*. With seven participants, do not compute percentages or claim significance.
- Every confusion that comes up twice or more becomes a tracked defect.
