# The Morning check-in: what it is for, and what it gives back (2026-10-19)

**Owner ask:** *"can we reevaluate this check-in feature"*, then *"i like the walk through tutorial
style, but again the purpose and where you can see the data over time, and what it means to the
member"* and *"make sure it makes sense and set up properly"*.

**Status:** Part 1 is in this PR. Parts 2 and 3 are planned (§5). This replaces the design in
[`REVIEW-2026-10-18-daily-checkin.md`](REVIEW-2026-10-18-daily-checkin.md); its rulings that still
stand are carried into §6.

## 1. Why it changed
Testing the 10-18 build, the owner found:
1. **Two check-in screens for the same answers.** The walkthrough (five words, a save per tap, a
   3-12h stepper) and the old "How are you." page behind Details (1-10 gauges, 6-8.5h chips, a
   Log today button that saves nothing until tapped).
2. **No one moment in the day.** Energy asked about "right now", sleep about last night, hunger
   about "today overall" and water about "so far today".
3. **Water was step 4 of a once-a-day check** that counted as done without it, though water is
   tracked all day.
4. **Two features called "check-in":** the daily one on Home and the weekly form for the coach.
5. **Edit looked like a dead end:** it opened the summary, where Change read as a label and Back was
   hidden.
6. **Little came back to the member.** The answers fed the coach and Home leads that need three or
   more days, and nothing said what an answer meant.

## 2. Purpose
- **Member:** fifteen seconds when you wake: how you slept and how you feel. Shape tells you what
  that means for today and, over the weeks, what moves your energy.
- **Coach:** the same 7-day averages as before, so the plan changes before a bad week becomes a bad
  month.

## 3. The design
### 3.1 One moment: the morning
It is the **Morning check-in**. Every morning question looks back from waking up. It asks from
4 a.m. local and can be answered until midnight. The weekly form is the **Weekly check-in · for your
coach**, so neither is ever a bare "Check-in".

### 3.2 The walkthrough (kept), two steps
1. **Last night · Sleep** (everyone). "How did you sleep?" The 3-12h stepper from the member's usual
   night, or the watch's hours, read-only. Then "How did you wake up?" (Wrecked · Tired · OK ·
   Rested · Fresh), optional; this is the Rested column. Skip stays. Straight after: the hours
   against the usual night ("1h 40 under your usual"), or "From your watch".
2. **This morning · Energy** (everyone). "How's your energy this morning?" The why line names who
   uses it: the trainer when there is one, otherwise "After low mornings, Home suggests lighter
   days".

Each step keeps "Your last 7 days" and "Tap a day to reuse it". Every tap saves. Back shows on every
step after the first and on the summary. **Edit opens step 1** with the day's answers selected.
**Same as yesterday** fills the open morning questions from yesterday (energy, typed hours, Rested),
never a watch's hours.

### 3.3 The evening question: hunger
Only for members with a nutritionist (owner, 2026-10-19). From 6 p.m. local, Home asks one question
about today: "How hungry did you get between meals today?", with the same five words and the last 7
days. It is saved on today's row, so DAILY HUNGER · 7D keeps meaning that day's hunger. A member
whose nutritionist link can't be read that day is not asked. It does not count toward the streak.

### 3.4 What it means to the member
**Today, right away**, on the summary (rules, never medical; a short night is 1h or more under the
usual night, or under 6h):
- Short night and Drained or Low: "Short night, low morning. Keep training easy and aim for bed
  earlier."
- Full night and Drained or Low: "Low after a full night. If it keeps happening, tell your coach."
  (no coach: "If it keeps happening, take it easy and keep an eye on it.")
- Short night, OK or better: "Short night, but you feel fine. Go by how the warm-up feels."
- OK or better: "Ready for today's plan."

**This week**, the engine's existing thresholds said in the member's words, over the engine's own
window (today and the six days before it; first match):
- Sleep averaging under 6h on 3 or more nights: "Short on sleep this week: {avg} a night."
- Energy averaging Low or Drained on 3 or more days: "Your energy has been mostly Low this week. A
  lighter session still counts."
- Otherwise a word that holds most days: "Mostly Good mornings this week."
- Fewer than 3 answered days: "{n} more mornings and your week shows here."

**Who sees this:** "Your trainer and nutritionist see your 7-day averages", the coach roles the
member has, or "Only you".

**Sleep on Home:** "Get to bed earlier tonight." leads only on a real shortfall: the engine's
sleep_low (a 7-day average under 6h over 3 or more nights) or a coach who set sleep as the move. The
engine's milder read (a 6-7h average) is not a lead, and the push keeps the same rule, so Home and
the push say the same move.

### 3.5 Where the member sees it over time: Your mornings (part 2)
One page, opened from Home's done line ("Your mornings →"), the summary, the energy lead and
Progress. 7 days | 30 days. A section per check the member is asked (Sleep, Energy, Rested, Hunger),
each with a headline in words ("Energy: mostly Good this month"), a strip, and a direction against
the window before ("Better", "Lower", "About the same"). With a watch: the recovery score from last
night's readings and the sleep history. Until part 2 ships, the 7-day strips in the walkthrough are
the history, and the card has no Details link.

### 3.6 Patterns (part 3)
"Your energy runs lower after nights under 7h", "You often wake tired after a full night: it's how
you sleep, not how long." Only the weekly readout's tested findings and plain counts, each with
"Based on {n} mornings".

### 3.7 Water
Water leaves the check-in. It is a Home line all day, whatever the Check-ins setting: the day's
amount and + Glass. Progress is shown only against a target the member set; otherwise the line
offers "Set a daily target" (owner, 2026-10-19), a picker saved where Settings keeps it. The picker
promises only the line: the engine's "Water is behind" lead also needs Check-ins on. The old "How are
you." page shows water against the member's own target only, until part 2 retires it.

## 4. What must not change
- `energy`, `hunger`, `sleep_hours` and `sleep_quality` on one `daily_health_snapshot` row per member
  per **local** day, written through `POST /api/client/checkin`.
- Their 1-10 range (words stored as 2 · 4 · 6 · 8 · 10) and the engine thresholds.
- The coach case file's headings and 7-day averages.
- The weekly check-in stays a separate coach form.

## 5. Parts
1. **Make sense of it (this PR).** The two-step Morning check-in (§3.2) with today's read, the week
   line and Who sees this (§3.4); the evening hunger question (§3.3); water as its own Home line
   (§3.7); Edit and Back; a sleep lead on Home, so the push and Home agree; the daily reminder's new
   copy, not sent once the morning is answered; momentum counting an energy or Rested answer.
2. **One screen, one history.** Your mornings (§3.5). The old "How are you." page retired, and its
   doors moved: the energy lead, the water lead, the Check-ins-off row and reminder, Sleep detail and
   the cycle chip. Progress's Energy, Hunger and Rested tabs move to Your mornings. The member's
   engine reasons said in words, coaches keep /10.
3. **What we've noticed.** Patterns (§3.6), Nora reading energy, hunger and Rested, then the
   website's daily card on the same reads.

## 6. Rulings
**Carried from 10-18:**
1. The five words per scale, stored as 2 · 4 · 6 · 8 · 10, keyed in all 13 locales.
2. A watch's night comes first; typed hours are written only to a night no device wrote. Rested is
   the member's own answer on any night.
3. A streak, no points. The streak counts days with a morning answer: energy, typed hours or
   Rested. A watch's night of 7h or more earns +5.
4. No −7 while the Check-ins switch is off.
5. The morning card asks from 4 a.m. local.

**New (owner, 2026-10-19):**
6. **Hunger is asked only of members with a nutritionist, in the evening, about today.** Trainer-only
   clients stop sending hunger, so their trainer's DAILY HUNGER line goes quiet.
7. **Momentum counts an energy or Rested answer** as an active day, as it already counts typed or
   synced sleep hours. Hunger and water alone do not.
8. **Water progress only against a target the member set.**
9. **Coach replies** (Noted · Ease today · Add fuel) are not part of this redesign. Who sees this
   ships first.

## 7. Defects found while mapping it
Fixed in part 1:
- The daily reminder still said "Four quick checks" and was sent on a day already answered.
- The engine picked sleep as the day's move and pushed it, but Home never showed a sleep lead. Home
  and the push now keep one rule (§3.4).
- Water showed progress against a 3 L default the member never set (the card and the old page).

Still open:
- Progress → Nutrition's "Hydration · 7 days" reads a field `/api/client/nutrition` never sends, so a
  signed-in member always sees "not tracked".
- The Progress trend chart plots up to 400 entries evenly spaced, with no dates or range, and opens
  on Weight whichever tab was asked for.
- Sleep's "30-day avg" is the last 30 nights logged. The Sleep page's "Last night" and Rested tiles
  take the newest entry however old.
- Recovery readiness takes each measure's newest reading however old.
- The push cron re-checks a stored snapshot for 14 days, so a "this week" push can repeat the next
  week, including after Check-ins is switched off.
- Demo Home widgets with made-up numbers can show for a signed-in member whose saved layout lists
  them.
- The weekly readout's fallback says "sleep quality" for Rested.
- Home's lead text and pushes quote "/10" figures for answers given as words.
