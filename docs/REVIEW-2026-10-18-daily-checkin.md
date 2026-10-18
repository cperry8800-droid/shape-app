# The daily check-in: a lower-effort redesign (2026-10-18)

**Owner ask:** *"lets think of a way to redesign this page and process on app to make it easier
to update each day and less effort for user each day. add to task list"* (on the app's
"How are you." page: Energy, Hunger, Sleep · last night, Rested, Log today, Hydration).

**Status:** a plan. Nothing in it is built. §2 is the design, §4 the phases, §5 the rulings it
needs before a build. §1 was read from the code on `main` at 47c6729.

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
1. **The Home card (app only, no schema or route change).** Inline card, a save per tap, five-word
   scales mapped to 2/4/6/8/10, yesterday's answers and "Same as yesterday", the 3-12h sleep stepper
   that can be cleared, Rested on the sleep step, and water as `+ glass`. The full page stays behind
   Edit. Mount tests on the card. The website's `DashTodayCard` follows in the same phase.
2. **Sleep that fills itself, and a reminder that lands on the card.** HealthKit read on app open,
   a WHOOP/Oura pull on open (server), and notification deep links to the card.
3. **Answer from the notification.** Native notification actions for energy, plus the streak if
   ruling 3 says yes.

## 5. Owner rulings needed
1. The five words for energy, hunger and rested in §2.2, and the 2/4/6/8/10 mapping.
2. Rested: keep it as its own question, fold it into the sleep step (proposed), or drop it.
3. Should a daily check-in earn points or a streak? It earns nothing today.
4. With the Check-ins switch **off**, should a missed **weekly** check-in still cost −7? Today it
   does, while the switch hides every prompt that would have reminded the member.
5. Should the card wait until a time the member picks (a morning default), or show from midnight?

## 6. Found while mapping it
- `shapeSignals.js` called `window.ShapeCheckins.list`, which does not exist (`shapeBackend.js`
  exports `submit`, `mine` and `weekOf`), so the member's engine never saw check-in history and
  its "check-in overdue" rule never fired. Fixed in the same PR: the record reads `mine(1)`, and
  not at all when the member has turned Check-ins off (`tests/self-record-checkins.test.mjs`).
- With the switch on, today not logged, and a lead whose lever is `checkin`, Home has no door to the
  daily page: the bulletin is hidden in favour of the lead (which opens the weekly page) and the row
  renders nothing.
- `BSMoodSheet` is mounted but nothing opens it, and `BSHomeCards` is never mounted.
