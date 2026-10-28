# First-time usability test kit

This protocol covers the open item for genuine external usability and booking-value feedback.

**No participant session has been run.** The facilitator dry run below was carried out by the developer. It checks that the interface makes each answer reachable. It is not user research. Do not report any result that was not collected with this kit.

**Status, 28 October 2026:** the owner confirmed first-time participants and a physical-phone tester are unavailable for now. Genuine usability sessions: **0**. No participant files have been created in `results/usability/`; automated browser runs and developer screenshot reviews are excluded. Five first-time sessions and the independent booking-value reviews remain pending.

## Participants

- **Five first-time users** with no prior exposure to Houselights. Hackathon judges or technically literate people are suitable.
- **Two working bookers or promoters.** Their task is to judge booking value, not interface polish.

Record each participant's role only. Do not record names, email addresses or anything else that identifies them.

## Setup

- **URL:** https://houselights.80-225-218-239.sslip.io/judge.html (the Booking Desk). No sign-in. Before each session, confirm that `/healthz` reports the release you intend to test, and write the release down.
- **Devices:** the participant uses their own device. At least two of the seven use a phone.
- **Introduction:** say only "This is a tool for deciding which artists to book." Do not explain Qloo, Autopilot or any term.
- **Help:** do not help unless the participant has been stuck for 60 seconds. Note every intervention, word for word.
- **Timing:** use a stopwatch. Note the first wrong path the participant takes, such as a wrong link, a wrong section or a misread number.

## Session script (read aloud, in order)

| # | Task | Success |
|---|---|---|
| 1 | "Within 30 seconds, tell me what this tool recommends booking." | Names the bill shown under BOOK |
| 2 | "Why those artists?" | Mentions Qloo audience fit, not ticket sales |
| 3 | "What difference does Qloo make here?" | Uses WHAT QLOO CHANGED: a different bill without Qloo evidence |
| 4 | "What should worry you about this recommendation?" | Names a WATCH OUT item, such as the near-tie |
| 5 | "What does Houselights need *you* to decide?" | Names the YOUR CALL item |
| 6 | "Cut the budget and see whether the plan still works." | Uses the budget cut, and reads the changed bill and the constraint status correctly |
| 7 | "Does this tool know how many tickets each act will sell?" | Answers **no** |

Task 7 checks whether the product's limits come across. A "yes" is a failure of the interface, not of the participant.

## Questions afterwards

Use a 1–5 scale. Free text is optional.

1. I understood what was recommended.
2. I understood why.
3. I understood what Qloo contributed.
4. *(Bookers only)* I would trust this enough to request a hold.
5. Which word or number confused you most?
6. *(Bookers only)* "What would you need to see before using this on a real show?"

## Recording template

Save one file per participant as `results/usability/P<n>.json`. Abandoned sessions are saved too, with `completed: false`.

```json
{
  "participant": "P1",
  "role": "first-time user | booker | promoter",
  "device": "phone | laptop | tablet",
  "browser": "",
  "release": "commit reported by /healthz",
  "date": "YYYY-MM-DD",
  "completed": true,
  "tasks": [
    { "task": 1, "seconds": 0, "success": true, "firstWrongPath": null, "interventions": [] }
  ],
  "ratings": { "understoodRecommendation": 0, "understoodWhy": 0, "understoodQloo": 0, "wouldRequestHold": null },
  "mostConfusing": "",
  "quotes": [],
  "facilitatorNotes": ""
}
```

## Reporting

- Report each task's result as *k / n*. With seven participants, do not compute percentages, averages that imply precision, or significance.
- Any confusion that comes up for two or more participants becomes a tracked defect, with the participants' words quoted.
- Booker answers to the last question are reported verbatim. They are the only evidence of booking value this kit can produce.

## Facilitator dry run (developer, not participants)

**When and where:** 24 October 2026, on the local development build (the `development` branch). The browser was a real Chromium with emulated viewports of 1366×768 and 375×812.

**Purpose:** to check that each task's answer is reachable, and where it sits on the page. Positions are measured from the top of the page.

| Task | 1366×768 | 375×812 phone |
|---|---|---|
| 1 Bill | First screen (547 px) | First screen (636 px) |
| 2 Why | First screen | First screen (731 px) |
| 3 What Qloo changed | First screen (683 px) | Second screen (1161 px) |
| 4 Watch out | First screen | Second screen (889 px) |
| 5 Your call | First screen | Second screen (1067 px) |
| 6 Budget cut | One click: "Try a budget cut ↓" focuses the control | Same. The control was 3,685 px down before this link was added. |
| 7 Not ticket demand | First screen | Second screen (1354 px) |

**Changes made because of the dry run:**

- The "WHAT QLOO CHANGED" line was added.
- Policy-point figures were removed from first-screen risk lines.
- The "Try a budget cut ↓" link was added.

**Not established:** whether real first-time users understand any of this. Only the participant sessions above can establish that.
