# The daily check-in: a lower-effort redesign (2026-10-18)

**Owner ask:** *"lets think of a way to redesign this page and process on app to make it easier
to update each day and less effort for user each day. add to task list"* (on the app's
"How are you." page: Energy, Hunger, Sleep · last night, Rested, Log today, Hydration).

**Status:** a plan with its rulings made (§5). Nothing in it is built yet. §2 is the design, §4
the phases. §1 was read from the code on `main` at 47c6729.

## 1. What the check-in is today (read from the code)

**The page.** `BSTodayPage` → `BSTodayCard` (`iosAppBroadsheetClient.jsx`, ~29825-30096). It has no
route of its own: Home holds a `todayPage` flag and swaps itself for the page. Members reach it
from Home's "Check-in due · Energy · sleep · 30 sec" bulletin, the "Check-in · Logged ✓ · add
water" row, or the energy and hydration leads. No notification opens it: `checkin_due` lands on
Home, and a member-set check-in reminder lands on the Me tab.

**What a member does every day:**
1. Open the page from Home (1 tap).
2. Energy, a 1-10 gauge (1 tap and a judgement: is today a 6 or a 7?).
3. Hunger, a 1-10 gauge (the same).
4. Sleep, chips for 6, 6.5, 7, 7.5, 8 and 8.5 hours only. A 5h or a 9h night cannot be logged.
5. Rested, a 1-10 gauge.
6. **Log today**. Nothing is saved until this, so leaving the page loses the answers.
7. Water, +8 oz / +16 oz, saved on every tap and separate from the check-in.

That is six taps and four judgement calls, on a page that starts empty every morning. Nothing is
carried over from yesterday. A connected wearable fills sleep only after the member taps **Sync**
on the Integrations page (there is no background sync). A value can be overwritten but never
cleared.

**What it writes.** `POST /api/client/checkin` patches today's `daily_health_snapshot` row (keyed to
the member's local day): `energy`, `hunger`, `sleep_quality` (the "Rested" gauge) and `sleep_hours`.
The route already accepts any subset of the four, so a save per answer needs no server change.

**Who reads it (load-bearing):**
- The coach's case file: LAST NIGHT, 7-DAY AVG, RESTED and DAILY ENERGY / HUNGER / HYDRATION · 7D
  (`shared-overview.ts`, rendered in `iosAppBroadsheetPros.jsx` and the website's
  `coachClientDetail.jsx`).
- Roster triage and Nora's "What needs me today?" (`roster-vitals.mjs`, 14 days of sleep, energy,
  hunger and hydration).
- The member's own engine: `energy_low` (7-day average ≤ 4 over ≥ 3 days), `hunger_high` (≥ 8),
  `sleep_low` and `hydration_low`.
- The weekly readout's correlations, the cycle card, the Progress trend tabs, and readiness
  (`sleep_hours` only).
- Momentum counts a day with `sleep_hours > 0` as active.

**Points.** A daily check-in earns nothing and has no streak. The score's "Check-ins" category is the
**weekly** check-in (`client_checkins`): +15 when sent, −7 when a week passes without one.

**The Check-ins switch** (`dailyCheckin`, Settings and the Settings root's quick switches). Off hides
the daily and weekly "due" bulletins on Home, drops a Home lead that points at a check-in, drops the
vitals leg of the member's engine (energy, hunger and water leads and pushes), and stops the
check-in notifications. It does **not** hide the page, stop reminders the member set, change what
the coach sees, or stop the −7 for a missed weekly check-in.

## 2. The redesign: a check-in that takes one tap on most days

### 2.1 It lives on Home, as one card, and every tap saves
The "Check-in due" bulletin becomes the check-in itself. One question shows at a time with its
answers as large targets. A tap saves that answer at once (a partial patch, which the route
already accepts) and slides to the next question. There is no Log today button to forget, and
leaving halfway keeps what was answered.

```
┌ CHECK-IN · SUN 18 ─────────────────── 1 of 3 ┐
│ How's your energy?                            │
│ [Drained] [ Low ] [ OK ] [ Good ] [ Great ]   │
│ Same as yesterday: Good · Normal · 7h 30 ✓    │
└───────────────────────────────────────────────┘
          ↓ answered
┌ CHECK-IN ✓  Energy Good · Hunger Normal · Slept 7h 30   Edit ┐
```

### 2.2 Five words, not ten numbers
Energy: Drained · Low · OK · Good · Great. Hunger: Not hungry · Light · Normal · Hungry · Starving.
Rested (if kept, §2.5): Wrecked · Tired · OK · Rested · Fresh. They are stored on the existing 1-10
columns as **2 · 4 · 6 · 8 · 10**, so every reader keeps working unchanged. The engine thresholds
land where a person would expect: Drained and Low make `energy_low`, Hungry and Starving make
`hunger_high`. The full page keeps the 1-10 gauge for a member who wants it.

### 2.3 "Same as yesterday" is one tap
Most days look like the day before. The card shows yesterday's answers under the first question,
and one tap logs all of them for today. Yesterday is read from the same progress series the page
already loads, so this adds no request.

### 2.4 Sleep fills itself
- **With a wearable** (Apple Health, WHOOP, Oura, Garmin): read last night when the app opens rather
  than on the Integrations page's Sync. The card shows it as already answered, for example
  "7h 20 · from Apple Health", and the question is skipped.
- **Without one:** a stepper from 3 to 12 hours in half-hour steps, starting at the member's usual
  night (the median of their last two weeks). On most days that is one tap on "7h 30 ✓". The chips
  that stop at 6 and 8.5 go away.

### 2.5 Rested folds into sleep
Today "Rested" is a fourth gauge that no engine rule reads. It feeds the case file's RESTED and the
correlations. Proposal: ask it on the same step as sleep ("7h 30 · Rested?"), skip it when a device
supplied sleep efficiency, and make it optional. Owner ruling 2 below.

### 2.6 Water stays a one-tap add, outside "done"
Water is several taps a day and already saves on each tap. It stays on the card as `+ glass`, and
gets the same quick add on Home's water reading. A check-in counts as done without it.

### 2.7 The reminder opens the check-in
The daily reminder and the check-in notification deep-link to the card, not to Home's top or the Me
tab. A later phase answers energy from the notification itself (native notification actions).

### 2.8 Done feels done
Once answered, the card collapses to one line with Edit. If the owner wants it (ruling 3), a small
daily streak and points for a check-in make the habit visible. Points are the platform's currency,
so that is the owner's call.

## 3. What must not change
- The four columns, one row per member per **local** day, written through `POST /api/client/checkin`
  (`tests/correlations.test.mjs` pins the single `clientLocalDay(`).
- The 1-10 range of `energy`, `hunger` and `sleep_quality` (CHECK constraints), and the engine
  thresholds read off them.
- The coach case file's headings and 7-day averages.
- The weekly check-in (`client_checkins`) is a separate, coach-facing form; this plan does not touch
  it.

## 4. Phases
1. **The Home card and a step-by-step walkthrough (no schema change). Built in the app**
   (`BSCheckinCard.jsx`, `tests/checkin-card.test.mjs`). Two routes changed with it: the progress
   route names the nights a watch wrote (`series.sleepFromDevice`, from the snapshot's sources), and
   the check-in write survives another write making the day's row first.
   - The owner, on the first build: *"have it be a step by step, almost like a tutorial that walks
     through each check"*, with the member's answers from the days before under each step.
   - The card on Home is the door: Start check-in, or Same as yesterday in one tap.
   - The walkthrough gives one screen per check: Energy, Hunger, Sleep (Rested optional, or Skip)
     and Water. Each says what it asks and why, and every tap saves.
   - Under each step are the last 7 days, with a "Mostly …" line when a real majority shows.
     Tapping a past day reuses its answer.
   - A summary with Change follows; Edit on Home opens it. The full page is behind Details.
   - The website's `DashTodayCard` is still to follow.
2. **Sleep, water and an energy hint from a watch, and a reminder that lands on the card.**
   - Sync Apple Health, Oura and WHOOP when the app opens (Garmin already pushes), so the sleep
     step is filled before it is reached.
   - Water from Apple Health.
   - Readiness or recovery pre-selects an energy word; the member confirms it.
   - Notification deep links to the card. The owner asked whether watches can fill this in
     (2026-10-18).
3. **Answer from the notification.** Native notification actions for energy, plus the streak if
   ruling 3 says yes.

## 5. Rulings (owner, 2026-10-18: *"i think you can make these decisions on what you think makes the most sense"*)
1. **The words.** Energy: Drained · Low · OK · Good · Great. Hunger: Not hungry · A little · Normal
   · Hungry · Starving ("Light" read as a meal, not a feeling). Rested: Wrecked · Tired · OK ·
   Rested · Fresh. Stored as 2 · 4 · 6 · 8 · 10, keyed in all 13 locales.
2. **Rested folds into the sleep step,** optional. When a wearable supplied the night, the hours
   are read-only and Rested is still offered: it is the member's own check, the case file's RESTED
   reads it, and the full page always offered it (amended on Codex's finding in #2398). A night
   is a wearable's when a device sync wrote its hours (`sources.sleep_hours`), not when the day
   has a resting heart rate: a watch worn by day reports one with no night. Different hours the
   member types over it (the Details page) stamp it `manual`, and it is theirs again. Same as
   yesterday copies Rested on its own, whoever supplied either night's hours.
3. **A streak, no points.** Points are the Store's currency, and "Same as yesterday" would mint them
   for one tap. The streak (consecutive local days with an answer) shows on the card's done line;
   the weekly check-in keeps its +15, and the day already counts for momentum.
4. **No −7 while the switch is off.** The switch turns check-ins off, so charging for one reads as
   a penalty for using a setting. The coach still sees the missed week, and switching back on
   charges again from the next completed week. The score cron reads the stored preference the way
   the notification routes do (absent reads On), and judges last week by the switch as it stood
   when the week ended: the earliest local Monday, 14 hours before Monday in UTC.
5. **The card shows from 4 a.m. local,** not midnight: at 1 a.m. "last night" has not been slept.
   No new setting; the member's own check-in reminder already decides when they are nudged.

## 6. Found while mapping it
- `shapeSignals.js` called `window.ShapeCheckins.list`, which does not exist (`shapeBackend.js`
  exports `submit`, `mine` and `weekOf`), so the member's engine never saw check-in history and
  its "check-in overdue" rule never fired. Fixed in the same PR: the record reads `mine(1)`, and
  not at all when the member has turned Check-ins off (`tests/self-record-checkins.test.mjs`).
- With the switch on, today not logged, and a lead whose lever is `checkin`, Home had no door to the
  daily page: the bulletin was hidden in favour of the lead (which opens the weekly page) and the
  row rendered nothing. Fixed with Phase 1: the card shows whatever the lead is.
- `BSMoodSheet` is mounted but nothing opens it, and `BSHomeCards` is never mounted.
