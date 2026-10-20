# The Morning check-in: what it is for, and what it gives back (2026-10-19)

**Owner ask:** *"can we reevaluate this check-in feature"*, then *"i like the walk through tutorial
style, but again the purpose and where you can see the data over time, and what it means to the
member"* and *"make sure it makes sense and set up properly"*.

**Status:** Part 1 shipped in #2407 and its reminder fix in #2408. Part 2 is in this PR; part 3 is
planned (§5). This replaces the design in
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
- Energy averaging Low or Drained on 3 or more days: "Your energy has been low on average this week.
  A lighter session still counts." The word is the band of the average, so it is said as one: an
  average of Drained and Great days is Low without a single Low day.
- Otherwise a word that holds most days: "Mostly Good mornings this week."
- Fewer than 3 answered days: "{n} more mornings and your week shows here."

**Who sees this:** "Your trainer and nutritionist see your 7-day averages", the coach roles the
member has, or "Only you".

**Sleep on Home:** "Get to bed earlier tonight." leads only on a real shortfall: the engine's
sleep_low (a 7-day average under 6h over 3 or more nights) or a coach who set sleep as the move. The
engine's milder read (a 6-7h average) is not a lead, and the push keeps the same rule, so Home and
the push say the same move.

### 3.5 Where the member sees it over time: Your mornings (part 2)
One page (`BSYourMornings.jsx`), read-only, from the same `/api/client/progress` read the card
makes. Top to bottom:
1. **Readiness today** (§3.8), with the day's read from §3.4 under it.
2. The cycle chip, inside its expected window only (never on Home).
3. **7 days | 30 days.** A window is today and the days before it (the engine's week), compared with
   the same number of days before that. Dates are the member's local days, and a row dated after
   today is ignored.
4. A section per check the member is asked: **Sleep**, **Energy**, **How you woke up** (Rested), and
   **Hunger between meals** only when the plan read says there is a nutritionist (unknown hides it).
   Each section has:
   - a headline in words, each said as the label it is: "Most days this week: Good" when one word
     holds most answered days, else "Mixed: Low to Good", and Sleep "7h 10 a night on average";
   - a strip: one bar per day, with gaps for days not answered, and skipped nights marked;
   - a direction against the window before, said for what it is: Energy and Rested "Better" /
     "Lower", Sleep "Longer" / "Shorter", Hunger "Hungrier" / "Less hungry", else "About the
     same". A direction needs 3 answered days in both windows, and moves of under half a word
     (1 point) or 20 minutes read "About the same".
5. **With a watch** (a watch night in the last 30 days): last night's tiles, each only when dated
   last night: hours, efficiency, resting HR, HRV and the watch's own recovery score. Without one:
   "Sleep and recovery readings come from a watch" and a Connect door.
6. Who sees this (§3.4).

Doors: Home's done line and the walkthrough summary ("Your mornings →"), the energy lead, Progress
(where its Energy, Hunger and Rested tabs were), and with Check-ins off, the quiet Home row, the Daily
check-in reminder and the sleep lead. With Check-ins off the page also says that nothing new is
asked. Signed out it shows example mornings, marked as an example. It replaces the old "How are you."
page and its Sleep detail overlay.

### 3.6 Patterns (part 3)
"Your energy runs lower after nights under 7h", "You often wake tired after a full night: it's how
you sleep, not how long." Only the weekly readout's tested findings and plain counts, each with
"Based on {n} mornings".

### 3.7 Water
Water leaves the check-in. It is a Home line all day, whatever the Check-ins setting: the day's
amount and + Glass. Progress is shown only against a target the member set; otherwise the line
offers "Set a daily target" (owner, 2026-10-19), a picker saved where Settings keeps it. The picker
promises only the line: the engine's "Water is behind" lead also needs Check-ins on. The hydration lead
opens that line (part 2).

### 3.8 Morning readiness (part 2; owner, 2026-10-19: "yes add the readiness score")
One 0-100 number for the morning, for every member, computed on the device from the day's own row
(`morningReadiness.mjs`). It needs the morning's energy; each other part counts only when present,
and the weights are shared out over the parts present:
- Energy 0.35 and Rested 0.15: the five words score 10 · 35 · 60 · 85 · 100.
- Sleep 0.25: 100 minus 30 per hour short, where short is the larger of the hours under the usual
  night (the card's: the median of the last 14 nights, 7h 30 with none) and the hours under 6.
- With a watch, readings dated last night only: the watch's own recovery score 0.15, HRV 0.05 and
  resting HR 0.05, against the member's own 30-day baseline (4 readings or more).

Bands: 80+ Ready · 60-79 Steady · 40-59 Take it easy · under 40 Run down. Home's done line shows
"Readiness 85 · Ready" above "Your mornings →". Your mornings shows it with what it was built from,
the window's average, and a strip of each answered morning's readiness. It is a guide built from the
member's own answers, not a medical reading, and coaches don't see it yet.

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
2. **One screen, one history.** Your mornings (§3.5) and Morning readiness (§3.8). The old "How are
   you." page and its Sleep detail retired, and their doors moved: the energy lead and Progress open
   Your mornings, the water lead opens Home's water line, and with Check-ins off the quiet row, the
   reminder and the sleep lead open Your mornings. Progress's Energy, Hunger and Rested tabs move to
   Your mornings. A skipped night is read from the day's row too, so it holds on every device. The
   member's engine reasons said in words (energy, hunger and sleep), coaches keep /10.
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
10. **A morning readiness score** for every member (§3.8).

**Part 2 calls (2026-10-19):**
11. An average becomes a word by the card's one rule (`bsCiWordIndex`: (2i, 2i+2] is word i), so a
    word never disagrees with the engine's thresholds at 4 and 8.
12. With Check-ins off there is nothing to answer in the app; Your mornings still shows the history.
13. A coach's own reason on Home is never reworded.

## 7. Defects found while mapping it
Fixed in part 1:
- The daily reminder still said "Four quick checks" and was sent on a day already answered.
- The engine picked sleep as the day's move and pushed it, but Home never showed a sleep lead. Home
  and the push now keep one rule (§3.4).
- Water showed progress against a 3 L default the member never set (the card and the old page).

Fixed after part 1 (owner, 2026-10-19: "yes fix"):
- The reminder read energy saved alone, as the old page can, as a finished morning. Skip now saves
  `sleep_skipped` on the day's row, and a morning is answered once its energy is in and its night
  has hours (typed or a watch's) or a skip: the card's own rule, so Rested alone leaves it open on
  both. The Score page's Consistency counts a check-in day, as momentum does.

Fixed in part 2:
- Sleep's "30-day avg" was the last 30 nights logged: it is now the member's last 30 local days, 0h
  nights left out, and Goals' "This week · Sleep" is the week's own nights. The Sleep page's "Last
  night" and Rested tiles took the newest entry however old: Sleep detail is retired, and Your
  mornings shows a watch's tiles only when they are dated last night.
- The weekly readout's fallback said "sleep quality" for Rested: it names every column in words.
- Home's lead text and pushes quoted "/10" figures for answers given as words: the member's energy,
  hunger and sleep reasons are said in words (on Home in the app's language); coaches keep /10.
- A night skipped on one device was still asked on another: the card reads the day's row too.

Still open:
- Progress → Nutrition's "Hydration · 7 days" reads a field `/api/client/nutrition` never sends, so a
  signed-in member always sees "not tracked".
- The Progress trend chart (its other series) plots up to 400 entries evenly spaced, with no dates or
  range, and opens on Weight whichever series was asked for.
- The route's own recovery readiness (`kpis.readiness`, now read only by the website's daily card)
  takes each measure's newest reading however old. Morning readiness on the app is dated.
- The push cron re-checks a stored snapshot for 14 days, so a "this week" push can repeat the next
  week, including after Check-ins is switched off.
- Demo Home widgets with made-up numbers can show for a signed-in member whose saved layout lists
  them.
