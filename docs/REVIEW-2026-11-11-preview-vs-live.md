# Review — what the app preview showed, and what a signed-in account sees (2026-11-11)

The owner asked: "why are there 2 checkins for a signed in account. We need to do a thorough review of
what was showing on the app preview and what is on live."

The preview is the signed-out sample the app showed before 2026-11-10, when an account became required.
The sample branches are still in the code (`bsHomeSignedIn`, `bsTrainSignedIn`, `bsEatSignedIn`), so
the comparison is read from them. The signed-in side was checked in a browser against a signed-in test
account (fake auth, no coach, then one coach).

## Why there were two check-ins

| | Morning check-in | Weekly check-in |
|---|---|---|
| What | Sleep and energy, 15 seconds, every morning | The week rated 1-10, weight and measurements, photos, wins and struggles |
| For | The member (and the coach's 7-day averages) | The coach ("Weekly check-in · for your coach", review of 2026-10-19) |
| Where it was | The morning panel on Home | A separate "Weekly check-in due · 2 min" row under the panel |
| Preview | Shown, on a sample week | **Never shown**: it reads the account's `client_checkins`, and signed out there is none |
| Signed in | Shown | Shown to **every** account with no row this week, coach or not, Monday to Sunday |

So the preview never had the second row, and a signed-in account always did. It predates the morning
card (the 2026-06-12 check-in kit's "home due-plate").

**Changed in this PR:** Home has one check-in, the morning's. The weekly one is a line on **Team**,
under the coaches, reading "Weekly check-in due · For Jordan · 2 min" (or "For your coaches"), and only
while the member has a coach. A member with no coach still has it in Settings and in Your first 30 days.
The page it opens is redrawn in Home's look (see the PR).

## Home, top to bottom

| Part | Preview (signed out) | Signed in | Verdict |
|---|---|---|---|
| Masthead, Nora hint | Same | Same | — |
| Score line | The sample's score | The member's own, once read | Right |
| Past-due row | Never | Only when a renewal failed | Right: account state |
| Last week's recap row | Never | Mondays only | Right, signed-in only by design |
| Shape Radio box | Sample | Plays for a member; free account sees the membership line | Right |
| Climb to goal | Demo goal | Own goal, or "No goal yet · Set your goal" | Right |
| This week bars | Demo week | Own week (empty for a new account) | Right |
| Your move row | — | Only when the engine flags one | Right, except the check-in week: **fixed**, see below |
| Morning check-in | Sample week, saves nothing | Real | Right |
| Water, Daily habits | Demo habits | Own habits, "—" until set | Right |
| **Weekly check-in due** | **Never** | **Every account without a row this week** | **Fixed: on Team, coach only** |
| Your mornings row | Only with Check-ins off | Same | — |
| Your first 30 days | Never | First 30 days; its next step may be "Check in" | Kept: a guided list, shown once per step |
| Team | Two sample coaches (Jordan Chen, Dr. Maya Patel), a sample note, sample fuel | Only coaches the member pays; none: "Today" + Find a coach | Right |
| Shortcuts, widgets | Same | Same | — |
| First-run tour | Never | Once, the first time | Right |

## Train and Eat

Both tabs differ only where the sample stood in for the member's data: the sample program and menu
signed out; signed in, the member's plan, "Your coach is preparing your plan" while a paid coach has not
published one, "Couldn't read your plan · Retry" when the read failed, and Find a coach only when the
read says there is no coach. No surface appears twice signed in.

## Also fixed

- Backing out of the Weekly check-in without sending hid the line until Home was opened again (Home's
  `onBack` cleared `checkinDue`). Only a sent check-in hides it now.
- On a week the engine picks the check-in (overdue), Home's lead said "Send your weekly check-in"
  beside the Morning check-in: a second check-in again (Codex, on the PR). Home never leads with it
  now; the next move leads, and the Team line shows it.
