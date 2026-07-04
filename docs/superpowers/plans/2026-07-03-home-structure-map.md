# Home structure map — `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx`

Branch: `claude/home-sd-redesign`. Read-only exploration; all line numbers verified
against current file content (22,703 lines total). Format: `piece → lines X-Y →
key names → gates/handlers`.

---

## 1. `BSClientHome` — lines 2081-3127

Signature (2081):
`function BSClientHome({ onProfile, sheet, goCalendar, goRadio, goTrain, goEat = () => {}, goMarket, goScore, goChat = () => {}, goIntegrations, tweaks = {}, setTweak = () => {} })`

### 1a. Hooks / derived-state block (pre-render) — lines 2082-2500
- **Date/week math** → 2086-2103 → `_BS_MON`, `_BS_DOWL`, `_now`, `todayIdx`, `weekDates`, `isoWeek`, `nowTime`, `fmtDate`.
- **Live plan fetch** → 2107-2125 → `livePlan` (state, `useStateBSC`), effect calls `window.ShapePlan.get()`; `bsHomeSignedIn` computed 2120 (`!!window.ShapeAuth?.getCachedState?.()?.user?.id` — Home's own local recompute, not a shared helper — same pattern repeated independently in `BSTodayNudge`/`BSStepsCard`/every other component); `liveWeek` memo 2121-2125 calls `bsHomeLiveWeek(livePlan, t)` (fn at line 2012, builds day-log/dots/up-next model from real assigned plan) or a signed-in empty-plan version, else `null` (demo fallback).
- **Selected day / up-next** → 2127-2134 → `selIdx` (state, defaults `todayIdx`), `selWorkout` (`liveWeek.workoutByIdx[selIdx]` or `bsClientWorkoutForDay(selIdx)` demo), `_selDelta`, `upNextLabel`.
- **Meal-logging state** → 2135-2141 → `mealLogged` (map id→bool), `loggingMealId`, `mealToLog`, `previewMeal`, `weekStat`, `showWorkoutPreview`, `showLogMeal`.
- **Overlay-page state flags** → 2142-2144, 2166, 2169-2170 → `habitsPage`, `goalsPage`, `todayPage`, `homeProgressPage`, `checkinPage`, `checkinDue`.
- **Engine directive flag** → 2145-2165 → `engineFlag` (state) + effect calling `window.ShapeSignals.selfRecord()` → `S.directive(rec)`; sets only when `dir.action && dir.lever && dir.lever !== 'none' && dir.verdict !== '—'` (honest gate — no fabricated engine move).
- **Habit flash** → 2167-2168 → `habitFlash` (state `{name,pts}`), `habitFlashTimer` (ref).
- **Weekly check-in due effect** → 2171-2182 → reads `window.ShapeAuth` uid, calls `window.ShapeCheckins.mine(1)`, sets `checkinDue = !rows.some(r => r.week_of === wk)`. **This is the `checkinDue` gate** referenced in item 7 below.
- **Misc overlay state** → 2183-2185 → `showLogActivity`, `showMood`, `coachFeed` (`{banners:[], items:[]}` state).
- **Ticker/analytics** → 2186-2277 → `ticker`, `tickerPrefs` (+ effect loading `client_ticker` goals), `analytics`, `energyGoal` (+ effect deriving cut/build/maintain from nutrition+training prefs), `refreshAnalytics` callback (2244-2257, tries `window.ShapeAnalytics.get()` then falls back to `fetch('/api/client/analytics')`) + effect calling it on mount, `ptsByDate` (+ effect fetching `/api/client/score`).
- **Coach feed effect (pushed items + banners)** → 2222-2239 → `window.ShapeCoachFeed.fetch()` + `.subscribe()` realtime.
- **Demo week / day-log tables** → 2279-2321 → `BS_KIND_COLOR`, `DAY_LOGS`, `WEEK_DOTS_BY_IDX`, `selDay`, `dataDay`, **`selMeals`** (2300-2321 — live: `liveWeek.mealsByIdx[selIdx]`; demo: built from `DAY_LOGS` MEAL rows with macro-parsing).
- **Habits for selected day** → 2322-2362 → `_homeHabitsDec` (decoded from `tweaks.habits` via `window._bsDecodeHabits`), `_homeHabitsDateKey`, **`selDayHabits`** (2329-2339 — live habits mapped with `done` flag; signed-in+no-habits → `[]`; signed-out → demo `window._BS_HABIT_DEMO_ROWS`), **`toggleHomeHabit(h)`** (2344-2362 — demo habit routes to `setHabitsPage(true)`; live: `window.bsRequireAccount` gate, flips history via `_homeHabitsDec`/`window._bsEncodeHabits`, `setTweak('habits', ...)`, POSTs `/api/client/habits` toggle, sets `habitFlash` + 2200ms timer via `habitFlashTimer.current`).
- **Macro balance (demo + live)** → 2363-2391 → `DAY_MACROS` (hardcoded demo table keyed 20-26), `macros`, `liveCal`/`liveTarget` (from `ticker.cal`/`ticker.cal_target`), `hasLiveBalance` (only true when `selIdx===todayIdx` and both present), `balance`/`balanceSign`/`balanceValue`, `noLiveToday` (honest-gap gate 2390), `energyEstimate`.
- **ENERGY card state model** → 2393-2427 → `energyAccents`, `ENERGY_STATES` (cut/maintain/build), `energy`, `energyCaption`, `homeCardsCtx`, `homeCardOpeners` — **NOTE: this whole ENERGY block (`energy`/`energyAccent`/`energyCaption`/`homeCardsCtx`/`homeCardOpeners`) is computed but `homeCardsCtx`/`homeCardOpeners` are never referenced again in the render below — dead/unused in the current render path** (BSHomeCards, the customizable card-stack consumer, is not called from BSClientHome's return). Confirm before removing — may be a residual hook for a feature not currently mounted.
- **`todayDirective` computation** → 2467-2500 → see item 1c below (kept separate — it's the "Today · your move" card logic explicitly requested).

### 1b. Early-return overlay states — lines 2437-2460
In evaluation order (each is a full-screen replacement of BSClientHome's return):
1. `previewMeal` (2437-2439) → `<BSMealPreview>` — meal preview page; `onLog` sets `mealToLog`+`showLogMeal`.
2. `showWorkoutPreview` (2440-2442) → `<BSHomeWorkoutPreview>` — workout preview; `onMove`→`goCalendar()`, `onStart`→`goTrain()`, `onMessage`→`goChat('Jordan Chen', 'Coach · Hypertrophy')` (hardcoded coach name — demo).
3. `showLogMeal` (2443-2445) → `<BSLogMealFlow>` — meal logger; `daySoFar` from `ticker`; `signedIn={bsHomeSignedIn}`; `onLogged` flips `mealLogged[loggingMealId]`.
4. `habitsPage` (2446-2448) → `<BSHabitsPage>` — full habits page; `onOpenScore`→`goScore()`.
5. `checkinPage` (2449-2451) → `<BSWeeklyCheckin>` — weekly check-in form; `onBack` also clears `checkinDue`.
6. `homeProgressPage` (2452-2454) → `<BSClientProgress>` — full progress hub.
7. `goalsPage` (2455-2457) → `<BSClientGoals>` — full goals page; `onOpenProgress` chains into `homeProgressPage`.
8. `todayPage` (2458-2460) → `<BSTodayPage>` — the daily check-in + hydration page (opened from `BSTodayNudge`).

*(Not an early return but functions the same way visually: the `weekStat` detail sheet is a `createPortal` overlay at 2995-3038, not a full-page swap.)*

### 1c. `todayDirective` — lines 2462-2500
- Gate: `if (selIdx !== todayIdx) return null;` (2468) — only computed/shown when viewing today.
- `_teal` local (2469).
- **Priority chain** (built as an array `todo`, first item wins):
  1. `engineMove` (2479-2491) — maps `engineFlag.lever` → `{head, cta, c, stakes}` via a lookup table: `checkin` → "Send your weekly check-in." (opens `checkinPage`); `training` → "Keep the streak alive." (opens `habitsPage`); `nutrition` → "Log a meal today." (`goEat()`); `goal` → "Your goal pace slipped." (opens `goalsPage`); `score` → "Grab a win today." (opens `habitsPage`). `sleep` lever deliberately omitted (consolidated into Today nudge/page). Pushed to `todo` first (highest priority) when present.
  2. `selWorkout` (2492) — "I'll train today →" opens `showWorkoutPreview`.
  3. Unlogged meals (2493) — one entry per `selMeals` not in `mealLogged`, "I'll log it →" opens the logger for that meal.
  4. Unfinished habits (2494-2495) — "N habits to finish" opens `habitsPage`.
  5. All-done fallback (2497) — `{done:true, head:"You kept your word today."}`.
- Returns `{head, cta, sub, c, heroMealId}` — `heroMealId` is `todo[0].mealId` when the lead item is a meal-log entry, consumed by the Meals card (2804, `isHeroTarget`) to suppress a duplicate Log button.
- **Promise-CTA handlers**: every `cta` is a 2-tuple `[label, handler]`, all framed first-person ("I'll …") — handlers are the `setX(true)` / `goX()` calls listed above.

### 1d. Full render order (return block starts 2502) — top to bottom

| # | Section | Lines | Key names |
|---|---|---|---|
| 1 | **Masthead/hero** | 2504-2513 | `<BSMasthead compact>` — SHAPE wordmark image title, `leftKicker` = weekday/date, `rightKicker` = `{nutritionPhase} · W{isoWeek}` (from `bsHomeProgram` = `useBSProgram()` line 2083), `trailing={<BSHeaderTools onProfile={onProfile}/>}` |
| 2 | **BSTicker** | 2515-2559 | `<BSTicker items={...}>` — builds CAL/PRO/HAB/SLP/HRV/RHR/WGT metric list from `ticker`, `tickerPrefs.order`/`.hidden`; `tkHab` computed inline from `_homeHabitsDec`; hides entirely (`return []`) when `bsHomeSignedIn` and no live metrics exist yet (2557) |
| 3 | **Edition band** | 2562-2574 | inline `<div>`, "Clients Edition · No. 14" / "Vol. I" — hardcoded static strip, no state |
| 4 | **Radio bar** | 2577 | `<BSNowPlaying onOpen={goRadio} />` — labeled "NOW PLAYING — Shape Radio", sits directly above the week strip |
| 5 | **THIS WEEK strip** | 2580-2613 | header row (2580-2586, "▍ This week" + `Wk {isoWeek} · {date range}` + "Month view →" button → `goCalendar`); grid (2589-2612) — 7 day buttons, `on = idx===selIdx`, `today = idx===todayIdx`, `dots = liveWeek.dots[idx] \|\| WEEK_DOTS_BY_IDX[idx]`, `onClick={() => setSelIdx(idx)}` — **this is the `selIdx` logic** |
| 6 | **BSTodayNudge call** | 2618 | `<BSTodayNudge onOpen={() => setTodayPage(true)} />` — comment explicitly notes it "leads the card list, right under the week calendar" |
| 7 | **From your coach — pushed items** | 2622-2649 | gated `coachFeed.items.length > 0`; renders `BSPlate` per item (`it.kind==='meal'` teal vs rust), reads `it.payload` fields |
| 8 | **"Today · your move" directive card** | 2654-2666 | gated `todayDirective` truthy; `<BSPlate c={todayDirective.c} tick bracket data-tour="hero-home">`; renders `head`, `sub`, and the promise-CTA button (`todayDirective.cta`) |
| 9 | **BSMeGoalCard call** | 2670-2672 | `<BSMeGoalCard c={teal} onOpen={() => setGoalsPage(true)} compact />` — directly under the directive, margin `3px {padX}px 9px` |
| 10 | **Up-next section label** | 2676 | `{selIdx !== todayIdx && <BSSection title={upNextLabel} />}` — only shows on non-today days (today's narrative owned by the directive) |
| 11 | **AgendaCard defs + workout/meals cards** | 2678-2847 | see item 1e below |
| 12 | **HABITS plate** | 2851-2908 | see item 1f below |
| 13 | **BSStepsCard call** | 2912 | `<BSStepsCard />` — bare call, no props; comment: "moved off the profile; it belongs with the day's living metrics" |
| 14 | **Shop-list card** | 2915-2931 | see item 1g below |
| 15 | **Weekly check-in due plate** | 2934-2945 | see item 7 (bottom of this doc) |
| 16 | **WEEKLY TOTALS section** | 2948-2989 | see item 1h below |
| 17 | **BSProgressDoor call** | 2992 | `<BSProgressDoor onOpen={() => setHomeProgressPage(true)} />` |
| 18 | **Week-stat detail sheet** | 2995-3038 | `createPortal` overlay, gated `weekStat` truthy; closes via `setWeekStat(null)`; portals into `#bs-phone-surface` |
| 19 | **"Your widgets" grid** | 3043-3066 | see item 1i below |
| 20 | **"This week's notes" (coach notes)** | 3068-3120 | see item 1j below |
| 21 | **Footer** | 3122 | `<BSFooter right="Pg 1 of 1" />` |
| 22 | **BSLogActivity / BSMoodSheet overlays** | 3123-3124 | gated `showLogActivity` / `showMood`; both call `refreshAnalytics()` on save (immediate + 700ms delayed) |
| — | close `</BSPage>` | 3125 | |

### 1e. AgendaCard defs + workout/meals cards — lines 2678-2847
- `AgendaCard` component (2682-2684) — thin wrapper: `<BSPlate c tick bracket pad="11px 16px 11px 22px">` with margin `0 {padX}px 9px`. **This is the shared chrome for workout + meals cards** (and reused conceptually, not literally, by the habits/shop/checkin plates below which each build their own `BSPlate` call).
- Style helpers (2685-2688): `pillFilled`, `pillOutline`, `eyebrow(c)`, `metaRight`.
- `Person` sub-component (2689-2697) — avatar+name+role, used in card footers (coach byline).
- **Time computation** (2698-2719): `_wkAt`/`WORKOUT_AT` (from `selWorkout.time`, default `09:00`), `_wkMoves`/`_wkShortMeta`/`_wkCompact` (workout move preview list, first 3 + "+N more"), `_lunchPref`/`MEAL_AT` (from `window.ShapeMealTimes.get().LUNCH`, default `12:40`), `fmtAt(mins)` 12-hour formatter.
- **`workoutCard`** (2720-2768):
  - Live branch (`selWorkout` truthy, 2720-2750): `AgendaCard c={rust}`; eyebrow `Workout · {fmtAt(WORKOUT_AT)}`; title tap → `setShowWorkoutPreview(true)`; move-list rows (each tap → preview too); footer `Person` (hardcoded "Jordan Chen"/"Coach") + `Preview →`/`Start →` buttons (`Start` → `goTrain()`).
  - **Rest-day branch** (2751-2768, `selWorkout` falsy): `AgendaCard c={t.GREEN}`, "Recovery · today" / "Active recovery." headline, static copy, footer `Person` + `Message →` button (`goChat('Jordan Chen', ...)`).
- **`mealsCard`** (source: `selMeals` — item 2300-2321) (2769-2840):
  - `mealMinutes(m)`, `slotLabel(m)` helpers (2770-2783).
  - `mealsDayWord`, `mealsLogged` (2786-2787).
  - Card body gated `selMeals.length` (2788-2840): eyebrow `Meals · {mealsLogged}/{selMeals.length} logged` + `Nutri plan` tag (2790-2793); title `{day}'s meals.` (2794-2796); **glance block** (2800-2830) — shows only the *next* unlogged meal (`next = selMeals.find(m => !mealLogged[m.id]) || selMeals[0]`), tap title/sub → `setPreviewMeal(next)`; Log button suppressed when `isHeroTarget` (shows "Next ↑" pill instead) else `Log →` button opens the logger (`setMealToLog`/`setLoggingMealId`/`setShowLogMeal`); "N more meals today" row (2822-2827) → `goEat()` ("Open Eat →" **this is the FULL PLAN deep-link**, along with the footer "Full plan →" button at 2837).
  - Footer (2831-2838): `Person` — `who = livePlan?.meals?.coach || 'Dr. Maya Patel'` (**byline**, live-coach-aware) + `Full plan →` button → `goEat()`.
- **Agenda sort** (2841-2846): `agenda = [{at:WORKOUT_AT,...}, ...(mealsCard?[{at:firstMealAt,...}]:[])].sort((a,b)=>a.at-b.at)` — workout and meals cards are time-sorted relative to each other before rendering.

### 1f. Habits plate — lines 2849-2908
- Single `BSPlate` (2858, `c={t.GREEN} notch={11} spine={3} bracket`), `onClick={() => setHabitsPage(true)}`, keyboard-activatable (`onKeyDown` guarded by `e.target === e.currentTarget` so inline checkbox Enter/Space doesn't bubble-open the page — 2860).
- `done`/`pts`/`possible`/`openHabits` computed from `selDayHabits` (2852-2855) — **completed habits leave the card** (`openHabits = selDayHabits.filter(h => !h.done)`).
- Eyebrow "Habits · n/m done" + "+pts / possible pts" (2862-2866).
- Title "Daily habits." (2868).
- `habitFlash` transient credit chip (2870-2872).
- Three body states (2873-2901): empty (`selDayHabits.length===0` → "Tap to add your first habit."); all-done (`openHabits.length===0` → "All done — +N pts banked today."); normal — first 3 open habits as rows (2884-2896), each with do/avoid pill, name, `+pts`, and a checkbox button (`onClick stopPropagation` → `toggleHomeHabit(h)`; demo habits show 🔒 and route into the page via `toggleHomeHabit`'s own `!h.live` branch); "+N more" overflow line (2897-2899).
- Footer "View all →" (2902-2904).

### 1g. Shop-list card — lines 2914-2931
- `BSPlate c={teal} notch={9} spine={2.5}`, `role="button"`, `onClick={() => { window.__bsPendingGrocery = true; goEat(); }}` — **this is the `__bsPendingGrocery` + `goEat` deep-link** (2918).
- Eyebrow "Shop list · this week"; title "Your shopping list."; sub "Auto-built from your meals · sorted by aisle"; trailing "Open →" pill.

### 1h. WEEKLY TOTALS section — lines 2947-2989
- **Signed-in gate: line 2960** — `if (bsHomeSignedIn) return null;` — comment explicitly states these are "hardcoded demo figures (not wired to real rollups yet) — show them only in the signed-out preview, never as fake stats to a real user." **So this entire section is signed-out-only.**
- `weekTotals` array (2952-2957): two entries — `Sessions` (rust, `history` list) and `Avg kcal` (blue, `chart`+`series`, `goalFrame: 'In your deficit · on track'`).
- Header "Weekly totals" / "So far" (2963-2966).
- Grid of `BSPlate` tiles (2967-2986), each `onClick={() => setWeekStat(s)}` — **this is the weekStat sheet opener**, consumed by the portal sheet at 2995-3038.

### 1i. "Your widgets" grid — lines 3042-3066
- `added = _bsHomeWidgets(tweaks)` (fn at 3131, decodes `tweaks.homeWidgets` comma-separated `key:span` pairs).
- `setList`/`remove`/`add`/`setSpan` helpers (3045-3048) mutate via `setTweak('homeWidgets', _bsEncodeWidgets(next))`.
- Gated `added.length > 0` (3052) — renders `<BSSection title="Your widgets" meta="{n} active">` + a 2-col grid of `<BSWidgetSlot widgetKey={w.key} onRemove={remove}>` per entry.

### 1j. "This week's notes" (coach notes) block — lines 3068-3120
- `banners = coachFeed.banners || []` (3073); `trainerBanner`/`nutriBanner` picked via `.find()` (3080-3081).
- **Demo fallback — exact lines 3086-3089**: `if (!notes.length) { notes.push({role:'trainer', text:"You're 3 weeks in...", who:'Jordan Chen', when:'Mon'}); notes.push({role:'nutritionist', text:"Three weeks of steady protein...", who:'Dr. Maya Patel', when:'Mon'}); }` — **no explicit `signedIn` gate on this block**; it falls back purely on `!notes.length` (i.e., whenever `coachFeed.banners` is empty, which is also the state for a signed-out OR a signed-in-but-no-coach-notes account). **This is a demo-leak risk**: a real signed-in client with no coach banners yet will see the Jordan Chen / Dr. Maya Patel sample notes exactly like a signed-out preview — unlike the Weekly Totals section (1h) or the coach-feed pushed-items section (item 7 in table above, gated on `coachFeed.items.length > 0` with no fallback content), this section has no `bsHomeSignedIn` check.
- Header "From your team" / "This week's note(s)" (3092-3094, singular/plural by `notes.length`).
- Note cards (3096-3117): italic quoted text, footer `Person`-style byline (avatar + name + role) + `when` (day-of-week label from `dayOf(b)`).

---

## 2. `BSTodayNudge` — lines 15831-15863

Signature: `function BSTodayNudge({ onOpen })`.

- `teal` local (15833).
- `signedIn` — its own local recompute (15834), identical pattern to Home's `bsHomeSignedIn` but a separate variable (no shared helper).
- `logged` state (15835, default `false`).
- **Logged-detection effect** (15836-15848):
  - Gated `if (!signedIn || !window.ShapeProgress?.progress) return undefined;`
  - Computes `todayIso` (local date string).
  - Calls `window.ShapeProgress.progress()` → reads `p.series`.
  - `has(k) = (p.series[k]||[]).some(s => s.date === todayIso)`.
  - `deviceMeta = has('sleepEfficiency') || has('restingHr') || has('hrv')` — device-synced-only signals.
  - **The manual-signal rule predicate (line 15845)**: `if (has('energy') || has('hunger') || has('sleepQuality') || (has('sleep') && !deviceMeta)) setLogged(true);` — i.e. "logged" requires energy, hunger, or sleepQuality (all manual 1-10 gauges), OR a `sleep` series entry that is NOT accompanied by device-only metadata (so a wearable silently syncing sleep alone never flips this to true — only a real manual entry does).
- **Render** (15849-15862): single `<BSPlate c={teal} tick={!logged} bracket>`, `role="button" tabIndex={0}`, `onClick={onOpen}`, `onKeyDown` handles Enter/Space.
  - Two states:
    - **Not logged** (`logged===false`): eyebrow "Today · how are you", title "Quick check-in.", sub "Energy · sleep · hydration · 30 sec", trailing pill "Check in →". Tick animates (pulsing dot).
    - **Logged** (`logged===true`): title "Logged for today ✓", sub "Tap to review · add water", trailing pill "Open →". Tick suppressed (`tick={!logged}`).
  - `onOpen` prop is always the trigger — no internal navigation; Home wires it to `setTodayPage(true)`.

---

## 3. `BSStepsCard` — lines 16141-16211

Signature: `function BSStepsCard()` — no props (Home calls it bare).

- `accent` local (16143); `TARGET = useBSStepGoal()` (hook, custom step goal — persisted, defined ~15254).
- `signedIn` — own local recompute (16145).
- **State**: `steps` (16146, `{today, ever}` shape or `null`), `history` (16147, bool — controls `BSStepsHistory` mount).
- **Data effect** (16148-16160):
  - Gated `if (!signedIn || !window.ShapeProgress?.progress) return undefined;`
  - Fetches `window.ShapeProgress.progress()`, reads `p.series.steps` array.
  - Computes `todayIso`, finds today's row, sets `steps = { today: row ? Math.round(row.value) : null, ever: series.length > 0 }`.
- **Derived render flags** (16163-16168):
  - `hasData` — signed-out always `true` (shows sample); signed-in requires `steps.ever`.
  - `todayKnown` — signed-out always `true`; signed-in requires `steps.today != null` (distinguishes "never synced" from "synced today but 0").
  - `val` — signed-out fixed demo `7240`; signed-in `steps.today ?? 0`.
  - `pct`, `hit` (`todayKnown && val >= TARGET`).
  - `stepPts = shapeStepsPoints(todayKnown ? val : 0, TARGET)` — Shape Steps → points conversion (imported/shared helper).
- **Handlers**: `openDevices` (16169) → dispatches `window.dispatchEvent(new CustomEvent('shape:openIntegrations'))`; `openHistory` (16170) → `setHistory(true)`.
- **Render states** (16171-16210), all inside one `<BSPlate accent notch={12} spine={3} tick={hasData && todayKnown} bracket>`, `onClick={hasData ? openHistory : undefined}` (whole plate is the history-opener when data exists):
  1. **No data ever** (`!hasData`, 16204-16206): plate shows only the eyebrow + a text button "Connect a watch to track steps →" → `openDevices()`. No progress bar, no numbers.
  2. **Has data, not synced today** (`hasData && !todayKnown`): shows `—` for the step count, `0%` progress bar, "No steps yet today" status line, but the plate is still clickable (history exists for past days).
  3. **Normal / goal-hit** (`hasData && todayKnown`, 16183-16203): big number `val.toLocaleString()` + "steps"; progress bar (`boxShadow` glow when `hit`); Shape Steps→points row (`stepPts.shapeSteps`, `+{stepPts.total} pts{· goal if bonus}` or "Walk 5k for +1"); status line "Goal hit ✓" (accent-colored) vs "{remaining} to go"; "History ›" affordance.
- **BSStepsHistory mount** (16208): `{history && <BSStepsHistory onClose={() => setHistory(false)} />}` — sibling to the `BSPlate`, inside the same wrapping `<div>` (16172-16210), i.e. it is NOT a portal call inside `BSStepsCard` itself — `BSStepsHistory` (defined separately at line 15310) presumably self-portals internally (not verified in this pass — out of the requested scope, but note it is mounted as a plain conditional sibling here, not wrapped in `createPortal` by `BSStepsCard`).

---

## 4. `BSProgressDoor` — lines 15789-15818 (full body, small)

Signature: `function BSProgressDoor({ onOpen })`.

- `teal` local (15791).
- `React.useInsertionEffect(() => { bsInjectFollowChipCss(); }, [])` (15792) — **reuses the follow-chip CSS injector** (defined at 6951, originally for follow-request chip styling) purely to get its keyframes/shared CSS side effect; **this is a naming smell** — `BSProgressDoor` has nothing to do with follow chips; it's borrowing whatever global `<style>` tag that function injects (likely a shared breathing/pulse or spine keyframe used elsewhere) rather than defining its own. Flag for the redesign: if `bsInjectFollowChipCss` is renamed/scoped away, this call must be re-pointed at whatever the actual shared CSS the plate depends on.
- `clipN(n)` local clip-path helper (15793).
- `segs` — 4-entry legend array: `[['Streak', teal], ['Trends', BLUE], ['Training', RUST], ['Nutrition', AMBER]]` (15794).
- Render (15796-15817): a hand-rolled clipped-plate `<button onClick={onOpen}>` (NOT using the shared `BSPlate` component — it manually replicates the clip-path/spine/bracket look inline with its own `<span>` layers) — eyebrow-less; title "Progress." (period in teal); the 4-segment legend row (color tick + label); trailing "›" chevron.
- No internal state, no data fetching — purely a static nav door; all data lives on the page it opens (`BSClientProgress`, via `homeProgressPage`).

---

## 5. `BSMeGoalCard` — lines 16654-16690

Signature: `function BSMeGoalCard({ c, onOpen, compact = false })` — **`compact` prop confirmed** (default `false`; Home passes `compact` truthy at call site 2671).

- Theme locals: `INK`, `TEAL` (16657, paper-aware); `SERIF`/`MONO`/`SANS` font-family constants (16658).
- **Loader** (16659-16664): `g` state (`null` initially); effect calls `window.shapeDb?.getUserGoals?.('client_goals')`, sets `g = d.overall` when present.
- **Honest gate (line 16667-16668)**: `bsGoalSignedIn = !!window.ShapeAuth?.getCachedState?.()?.user?.id;` then `if (bsGoalSignedIn && !g) return null;` — **signed-in-no-goal renders nothing**, exactly as specced. Demo fallback `ov` (16669) only applies when `!g` AND not signed-in (i.e., signed-out preview).
- Progress math (16670-16678): `start`/`now`/`target`/`unit` from `ov`; `range`, `pct`, `down`, `toGo`; `byD`/`dateLabel` (target-date formatting); `words`/`last`/`head` (splits title so the last word renders italic-accented).
- Render (16679-16689): single `<BSPlate c={TEAL} notch={12} bracket>`, `onClick={onOpen}`, keyboard-activatable; `pad` differs by `compact` (`'12px 15px'` vs `'16px 18px'`); eyebrow "Your goal · by {date} ›"; `{pct}% there` trailing; title (serif, last word italic-teal), sizes differ by `compact` (19 vs 27); progress bar (height 5 vs 7); footer stat line "{down} {unit} so far · {toGo} {unit} to go · on track" (font size 9.5 vs 10).

### How Home currently invokes it
Line 2671: `<BSMeGoalCard c={t.isLight ? '#0a8f87' : '#34d6c5'} onOpen={() => setGoalsPage(true)} compact />` — wrapped in a plain `<div style={{margin: '3px {padX}px 9px'}}>` (2670-2672), positioned directly under the "Today · your move" directive card and above the up-next section label / agenda cards.

---

## 6. Shared primitives

### `window.BSPlate` signature (from `iosAppBroadsheet.jsx`, lines 1030-1044)
```
function BSPlate({ c, notch = 12, spine = 3, tick = false, bracket = false, pad = '14px 16px', style, onClick, onKeyDown, tabIndex, role, ariaLabel, children })
```
- `c` — accent color (required; drives corner-clip tint, spine, tick glow).
- `notch` — clip-path corner size in px (default 12).
- `spine` — left accent bar width in px (default 3; `0` suppresses it).
- `tick` — bool; renders a pulsing 6×6 dot top-left (`bsPlatePulse` keyframe injected inline via a `<style>` tag scoped to the tick render, line 1041 in iosAppBroadsheet.jsx).
- `bracket` — bool; renders a small corner-bracket accent bottom-right.
- `pad` — CSS padding string for the inner content wrapper.
- `style`, `onClick`, `onKeyDown`, `tabIndex`, `role`, `ariaLabel` — passed straight to the outer `<div>`.
- Exported via `Object.assign(window, {..., BSPlate, ...})` at line 1462 of `iosAppBroadsheet.jsx`. The client file consumes it as a **module-scope destructure from `window`** (per the WORKLOG's documented window-globals load-order convention) — not re-imported inline in this file per-call; used directly as `<BSPlate>` throughout `iosAppBroadsheetClient.jsx` (dozens of call sites, all listed above).

### `bsHomeSignedIn` / signed-in detection used in Home
- **No shared helper exists.** Every component (Home, `BSTodayNudge`, `BSStepsCard`, `BSMeGoalCard`, and dozens of others across the file) independently recomputes:
  `!!(typeof window !== 'undefined' && window.ShapeAuth?.getCachedState?.()?.user?.id)`
  into a locally-named const (`bsHomeSignedIn`, `signedIn`, `bsGoalSignedIn`, `bsTrainSignedIn`, `bsEatSignedIn`, etc. — 20+ call sites found via grep). This is a repeated inline pattern, not a factored function — worth noting for the redesign plan since any refactor touching signed-in gating must update each site individually (or the plan should introduce a shared `useBSSignedIn()` hook).

### `bsTHexA` availability
- Defined at **line 7144** of `iosAppBroadsheetClient.jsx`: `const bsTHexA = (hex, a) => { ...returns 'rgba(r,g,b,a)'... }` — a module-scope `const`, NOT exported to `window`. Because all render functions execute after full module evaluation, it's safely referenced by any function later in the same file regardless of its own definition-order position (e.g. `BSTodayNudge`/`BSStepsCard`/`BSMeGoalCard` at ~15800-16690 all use it despite being defined "after" 7144 in the file, and `BSClientHome` at 2081 uses it too — fine, since `BSClientHome`'s *body* only runs at render time, well after module load completes). **Not available to `iosAppBroadsheet.jsx`** (the shared-chrome file) or any other broadsheet file — it is local to the client module only. `BSPlate` itself does not use `bsTHexA` (it interpolates `${c}77`/`${c}1f` hex-alpha suffixes directly instead).

### CSS-injection pattern name Home already uses
- Home itself does not inject any keyframes directly. The one CSS-injection call reachable from Home's render tree is `BSProgressDoor`'s `React.useInsertionEffect(() => { bsInjectFollowChipCss(); }, [])` (15792) — see item 4 above for the naming caveat. `BSPlate`'s own `tick` keyframe (`bsPlatePulse`) is injected inline per-instance via a trailing `<style>` tag inside the component itself (`iosAppBroadsheet.jsx` line 1041 — i.e. co-located with `BSPlate`, not something Home needs to inject separately). No other `useInsertionEffect`/`<style>` injection exists inside `BSClientHome`, `BSTodayNudge`, `BSStepsCard`, or `BSMeGoalCard`.

---

## 7. Weekly check-in due plate (`checkinDue`)

- **Where it renders**: inline in `BSClientHome`'s return, lines **2934-2945** — positioned AFTER the shop-list card and BEFORE the Weekly Totals section (table position #15 above).
- **Gate**: `{checkinDue && ( ... )}` — `checkinDue` is Home's own state (declared 2170), set by the effect at 2172-2182 (see item 1a): true when a signed-in user has `window.ShapeCheckins` available and no check-in row exists for `window.ShapeCheckins.weekOf()` in `.mine(1)`. Signed-out / no-`ShapeCheckins` → effect returns `undefined` immediately, `checkinDue` stays its default `false`, plate never renders.
- **Render**: `<BSPlate c={t.ACCENT} tick pad="12px 16px 12px 22px">`, `role="button"`, `onClick={() => setCheckinPage(true)}` — eyebrow "Weekly check-in · due", title "Tell your coach how the week went.", sub "Ratings · photos · measurements · 2 min", trailing pill "Check in →". Opens the `checkinPage` overlay (item 1b #5), whose `onBack` also clears `checkinDue` back to `false` (2450).
- **Distinct from `BSTodayNudge`/`todayPage`** — this is the *weekly* cadence gate (once per ISO week), not the *daily* check-in+hydration nudge (item 2 above). Both can be visible simultaneously (different trigger conditions, different target pages).

---

## 8. Exhaustive additional inventory — anything else in `BSClientHome`'s main render flow

Everything below is either already covered above or is a small piece easy to miss in a skim. Listed here explicitly per the "nothing-lost" requirement:

1. **Masthead trailing tools** (`BSHeaderTools`, table #1) — renders the profile/search/avatar cluster; `onProfile` prop threaded from Home's own props.
2. **Edition band** (table #3, 2562-2574) — fully static, no data, easy to overlook since it has no component name (bare inline `<div>`).
3. **`BSNowPlaying`** (table #4, line 2577) — Shape Radio now-playing bar; only prop is `onOpen={goRadio}`. Defined elsewhere (not in this file's requested scope) but its call-site position (directly above the week strip) is load-bearing for the redesign.
4. **From-your-coach pushed items** (table #7, 2622-2649) — distinct from the "This week's notes" banners block (item 1j) and from the `todayDirective`'s engine-flag reasoning; reads `coachFeed.items` specifically (as opposed to `coachFeed.banners`). Renders inline `BSPlate`s per item, teal for meals / rust for workouts, with an optional coach `cue`/`note` quote line.
5. **`weekStat` detail sheet** (table #18, 2995-3038) — a `createPortal` bottom-sheet, NOT a full-page early return; opened from Weekly Totals tile taps (item 1h); has two body variants (chart bar-graph for "Avg kcal" vs a history-row list for "Sessions"); closes via a "Close" button or backdrop tap (`onClick={() => setWeekStat(null)}` on the overlay div, `e.stopPropagation()` on the inner sheet).
6. **`_bsHomeWidgets`/`_bsEncodeWidgets`** helper functions (3131-3145) — module-scope, immediately below `BSClientHome`'s closing brace; back the "Your widgets" grid (item 1i). Not part of the component body but tightly coupled (only consumer).
7. **`bsWeekdayIdx`** (3148) — one-line helper immediately following, used elsewhere in the file (e.g. Eat tab) for "today" weekday comparisons; not called inside `BSClientHome` itself but sits in the same neighborhood.
8. **Dead/unused `homeCardsCtx` / `homeCardOpeners`** (2427-2435) — computed every render but never passed to any rendered component in the current `BSClientHome` return (no `<BSHomeCards>` call exists in this function's JSX). `BSHomeCards`/`BSHomeCardItem` (defined at lines 799-1091, well before `BSClientHome`) appear to be a customizable-card-stack feature that is NOT currently mounted from Home's render path — worth flagging explicitly since it's easy to assume "the card stack" is live when it is dead code in the current render tree (confirm via a repo-wide grep for `<BSHomeCards` before relying on this).
9. **`bsHomeLiveWeek`** (module-scope fn, line 2012, immediately before `BSClientHome`) — not part of the component body but is the single source-of-truth builder for `liveWeek` (workouts/meals/dots from a real assigned plan); referenced once, at line 2122.
10. **`todayDirective`'s `heroMealId` wiring** — cross-references into the Meals agenda card (item 1e) to avoid a duplicate "Log" CTA; this coupling between the directive computation (top of function) and the meals-card render (mid-function) is easy to miss since the two blocks are ~300 lines apart.
11. **Hardcoded demo coach name "Jordan Chen"** appears in FOUR separate places in Home's render path: the workout-card footer `Person` (line 2744), the rest-day-card footer `Message →` handler (2765 — via `goChat('Jordan Chen', 'Coach · Hypertrophy')`), the workout-preview `onMessage` handler at the early-return (2441), and the "This week's notes" demo fallback (3087). **"Dr. Maya Patel"** appears twice: meals-card footer fallback (2834) and the notes demo fallback (3088). These are NOT unified through a single "current coach" lookup within Home — each site independently falls back to the same two literal names when no live coach data exists, which is a redundancy the redesign plan should probably consolidate.
