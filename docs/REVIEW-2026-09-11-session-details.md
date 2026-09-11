# Session details, three ways — 2026-09-11

**Owner ask:** *"thoughts on redesigning the session details page that pops up for each activity. I want
it to match the new 'wall' design and also see if there are any other metrics we are missing"* →
*"give me 3 new design options for the session details page. keep the same functionality that already
exists"* → *"i want to see previews of them"* → *"keep same details that are already there"*.

**Previews:** the live concept board —
https://claude.ai/code/artifact/084a0ed6-04f8-423d-9f60-5025641c275e — six tabs: **A · The Plate
Stack**, **B · The Record Sheet**, **C · The Instrument Board** (each with the deadlift PR and the long
run rendered phone-sized from the app's own demo records), **Metrics** (the gap table), **Carry-over**
(every existing element and where it lives in each option) and **Pick**.

**Owner's pick, same day: C · The Instrument Board** — *"i like the instrument board"*, after two
clarifications: *"im talking about the sperate page the pops up once you click the sessions details
link from the each post on the wall"* and *"it should be its own page"*. That page is
`BSActivityDetail`, the full-screen page every option redraws; it stays its own page with its own
masthead and back row, and the Wall post itself is untouched. A **Today · as shipped** tab was added to
the board so the shipped page sits beside the options. **Not built** — the go-ahead to build is the
owner's next call; §3 carries the build order for C.

**Records only.** No code changed, no migration, no PR. Two defects found while reading the data path
are registered below and as separate task suggestions; neither is fixed here.

## 1. What the page is today (read from the code)

`BSActivityDetail` (`mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx:17449`) — a full-screen
portal into `#bs-phone-surface` with two foci: **stats** (the numbers) and **comments** (the thread).
The stats page, top to bottom: masthead (logo · Vol/No · search · avatar) → **← Back · SESSION
DETAILS** · share (own real card only) · the type tag in the tier colour → author row (avatar · name ·
tier chip · ago · place · role) → a hairline → the **open ledger on the heat rail**: title with the
accent period, hero label + count-up figure, PR delta, the note, the co-sign pill (tap → the coach's
profile), the route inked onto the paper or the dashed *GPS · not recorded* line → **Summary**
(primaries at 30px with the ghost HR trace and the pace needle band; the 2px ink→heat rule; dot-leader
secondaries) → **Pace / Speed** bars per split coloured by zone, the fastest chip, the zone legend and
the *Splits · full breakdown ›* link into `BSSplitsPage` → **Power** trace (rides) → **Heart rate**
trace (zone gradient, MAX flag, live end dot, scrub readout, mile axis) + the zone cells → **Working
sets** ledger bars (RPE dial, PR burst, breathing halo) → **Cadence** bars + avg chip → **Elevation**
trace + gain chip. The page's temperature (`bsSdHeatColor`) follows time-in-zone intensity; count-ups
and self-drawing traces fire on first view; reduced motion renders the finished state; every section
renders only when its series exists.

**The Wall grammar it is asked to match** (`BSWallPlate`, `:18982`; `BSPlate`,
`iosAppBroadsheet.jsx:1290`): a `BSPlate` record frame — clipped notch, 3px **teal** spine, the
pulsing tick on the newest — with the header *NEW BEST · DEADLIFT* / the 30px figure + mono unit + `×
reps` / *↑ +10 lb over last best* (or *First on the wall*), the wrapped activity card beneath, and the
stamp as the foot line (*Not yet stamped* when no coach has co-signed). Teal marks a record; the heat
marks effort.

## 2. The three options

All three keep every element above; the Carry-over tab lists each one. Additions are the same set in
all three and are tagged **NEW** on the phones.

| | A · The Plate Stack | B · The Record Sheet | C · The Instrument Board |
|---|---|---|---|
| **Thesis** | The Wall record, unfolded: the first plate *is* the Wall plate (teal), and every section beneath becomes a plate of its own in the heat colour. | One frame, one ledger: a single tall plate around the whole session, the Wall header and the stamp at the top, the sections as the continuous ledger the page already is, station ticks on the spine, a sticky **jump index**. | Glance first: the record header, six instrument tiles (ghost trace and needle on the tiles), the single zone bar; charts on the quiet paper below; working sets and splits as **tables** with the bar under each row; a sticky action bar. |
| **Kept** | Everything, in today's order. | Everything, untouched — only the frame and header change. | Every figure and chart; scalars that do not fit the six tiles run as dot-leader rows beneath them. |
| **Added** | Plan → lifted and rest per set, session RPE, the morning's recovery strip, points earned. | Same, plus the jump index and the FILED dateline. | Same, plus the set table's plan/rest columns and moving vs elapsed on runs. |
| **Cost** | Medium — one zero-inset plate variant around the existing blocks. | Small — a frame, a header, a stamp line, an index. | Medium-large — tile and table components; charts reused. |
| **Risk** | Nine framed plates on a four-screen page: the busiest. | Lowest; the quietest. | The 30px Summary figures become 19px tiles. |

**Plate inset rule, carried from the Wall entry:** the plates add no side inset (measured on
2026-09-10 at 375px — an inset squeezed the wrapped card by 48px), so the charts keep today's width and
the 3px spine is the frame's left edge.

## 3. The pick

**The owner picked C, The Instrument Board** (2026-09-11). The recommendation below was written before
the pick and is kept for the record; the build order at the end of this section is for C.

**Recommended before the pick: B, The Record Sheet.** It applies the Wall's grammar where the Wall applies it — one frame around
one record, the header on top, the stamp as the signature — and leaves the living ledger intact. It is
the smallest build and the only option that adds navigation to a page that is now four screens tall.
**A** if the owner wants every section to read as a Wall plate (the most literal match, the busiest
page). **C** if the coach's ten-second review outranks the member's own reading; its table and sticky
bar can be borrowed by B later.

**Build order for C** (re-ordered 2026-09-11 on the owner's heart-rate ruling — see §4a; the
wearable paths come first, the in-app strap rides along):

1. **The page's front** — the record header (`bsWallHeader` already exists), six instrument tiles with
   the ghost trace and the pace needle, the remaining scalars as dot-leader rows, the single zone bar
   the Wall card already draws. Every tile is gated on its value existing, so it ships against today's
   data and gets richer as the paths below land.
2. **Keep the per-set RPE in the breakdown** and carry plan and rest on the set rows (§4, defect 2) —
   one mapper, no route or provider work, and it is the coach's first question.
3. **The set-by-set and split-by-split tables** with the bar and PR burst under each row, the Splits
   page link kept.
4. **The sticky action bar** (reactions, comment count, share) opening the existing comments focus and
   share chooser.
5. **The wearable heart-rate paths, in yield order** (§4a): Apple Watch via HealthKit (samples are
   already fetched and only bucketed by day) → Garmin activity details (the webhook stores two scalars
   and nothing else) → WHOOP stays zones-only (its API exposes no trace). Each one lights the same
   Heart rate section for a different provider.
6. **The in-app strap** — carry `workout_sensor_samples` onto the post as `hrTrace` and derive zones
   (§4, defect 1). Unchanged in substance, moved down: it covers only sessions logged live in Shape
   with a strap paired to the phone.
7. **The morning tiles and the run lines** (moving vs elapsed, negative split, HR drift), each gated on
   the data existing.

New labels are i18n keys in all 13 locales. No migration.

## 4. Metrics: what the page could show and does not

Three groups, read from the write paths rather than wished for. **Two of them are defects, not gaps.**

1. **In-app sessions never get a heart-rate chart.** The live session stores every strap sample in
   `workout_sensor_samples` (`shapeBackend.js:2791`) but the post it publishes carries only
   `averageHeartRate` / `maxHeartRate` (`:3178`) — no `hrTrace`, no zones — so the Heart-rate section
   renders only for WHOOP and Strava imports. A Shape session with a strap shows two numbers and no
   trace.
2. **Live set rows lose their RPE.** `setLogs[].rpe` is stamped on the post (`:3193`), but
   `bsBuildBreakdown` (`iosAppBroadsheetClient.jsx:13231`) writes `setDurationSeconds` into the row's
   note column, so the RPE dial the demo cards draw never appears on a real set.

**Captured today, never shown (render only):** prescribed vs lifted (`targetLoad`/`targetReps` beside
the actuals); rest before each set (`restBeforeSeconds`; only the average reaches the card); set
duration; session RPE and how it felt (`workout_sessions.session_rpe` + the review's `feel`); start time
and duration (the page says "34m ago"); points earned (`score_ledger`: +10 `award_workout_session`, +12
`pr_wall`); moving vs elapsed on Strava imports (both stored); that morning's recovery %, HRV, resting
HR, sleep and strain (`daily_health_snapshot` for the session's date, WHOOP/Oura members only — shown
only when the snapshot exists); relative strength from the nearest `client_weigh_ins` row; fuel that
day from the meal logs.

**Derivable from stored series:** est. 1RM per set and best e1RM (the demo shows it, live rows do not);
per-exercise subtotals on multi-move sessions; density and work:rest; the negative-split index (the demo
note *says* it, nothing measures it); aerobic decoupling from `hrTrace` + `paceTrace`/`powerTrace`;
time in zones from a Strava trace when WHOOP zones are absent (against a measured max, else 220−age,
labelled estimated); grade-adjusted pace per split; normalized power — Strava's
`weighted_average_watts` is typed in the sync route (`strava/sync/route.ts:40`) and never stored, one
field.

**Needs new capture or a decision:** FTP (intensity factor, TSS, power zones); a max-HR / LTHR setting
so zones are the member's own; weather (Strava `average_temp` is not ingested); gear (`gear_id` is not
ingested); a three-tap pre-session check (energy · soreness · sleep quality — the check-in is daily,
not per session); HR recovery in the minute after Finish (the strap stops at Finish); per-length swim
laps, stroke count and SWOLF per lap (Strava laps not ingested); bar speed / tempo (a device); photos
on the detail page (the stats page is numbers-only by design — owner call).

**The rule every addition obeys:** a number is drawn from a stored value or it is not drawn. No strap →
no heart-rate section; no wearable → no morning strip; no splits → no split line.

## 4a. Where heart rate actually comes from (owner's ruling, 2026-09-11)

Owner: *"the heart rate strap only record if someone is wearing it, if our engine is able to register
great. isually the heard rate strap will be synced wither either garmin, whoop, etc then log that onto
shape. smart watches need to log the info we see also."* So the in-app Bluetooth strap is the bonus
path and the wearables are the main one. Read against each integration's write path, the wearables
deliver **less** than the page draws today, not more:

| Provider | What reaches a post today | What the page can draw from it | What it would take |
| --- | --- | --- | --- |
| **Strava** | `hrTrace`, `cadenceTrace`, `elevTrace`, `paceTrace`, `powerTrace` + per-mile splits (`strava/sync/route.ts:340`, `:387`) | Everything: trace, splits, cadence, elevation | Nothing. It is the reference shape. `weighted_average_watts` is typed at `:40` and never stored — one field for normalized power |
| **WHOOP** | avg/max HR, strain, kilojoules, distance, altitude gain, **`zoneDurations`** (`whoop/sync/route.ts:114`, `:119`) | Zone cells and the two scalars — **no trace** | Nothing available: the WHOOP API exposes zone totals, not samples. Zones-only is the honest ceiling |
| **Garmin** | avg HR + max HR only (`garmin/webhook/route.ts:172`, `:187`, `:231`) | Two numbers | A second call for activity **details** (HR / cadence / altitude / speed samples + laps), mapped to the Strava trace shape. The webhook payload the push carries has no samples |
| **Apple Watch** (Apple Health) | **nothing** — `WorkoutInput` is `externalId · activity · startedAt · endedAt · durationMin · calories · distanceM` (`apple-health/sync/route.ts:24`); the row is written `avg_hr: null`, `metrics: {}` (`:107`) | Nothing at all | The **samples are already fetched**: `collectHealthKitSnapshots` queries heart-rate samples over the whole window and buckets them **by day** (`healthkit.js:75`, `:94`). Slicing them into each workout's own window is the whole change |
| **Oura** | `intensity` only (`oura/sync/route.ts:86`) | Nothing HR-shaped | Out of scope; Oura is a recovery source, not a session source |
| **In-app strap** | avg/max HR on the post; **every sample already in `workout_sensor_samples`** (`shapeBackend.js:2791`, `:3179`) | Two numbers | Carry the samples onto the post (§4, defect 1) |

Two readings follow, and they change the build order in §3:

- **The Apple Watch is the highest-yield path and the smallest one.** The samples are collected today
  and thrown at the day bucket; nothing new is captured, nothing new is authorised, no migration. It is
  also the provider with the widest install base among members who own a watch at all.
- **Garmin is a real ingest, not a mapping.** The webhook stores what the push carries, and the push
  carries summaries. Samples need the activity-details call, so it is the one wearable path with new
  network work behind it.

⚠ **The app reads only one trace shape and one zone shape**, so every provider path must emit
`rawMetrics.hrTrace` and `zoneDurations` as Strava and WHOOP already do
(`iosAppBroadsheetClient.jsx:13267`, `:13391`) — a second shape would mean a second renderer and the
two would drift.

⚠ **Zones are never derived from a trace without a reference.** `bsBuildZones` draws provider zones
only; a trace-derived split needs a max-HR or LTHR setting the app does not have, and would have to be
labelled estimated. That is listed under *needs capture* in §4 above and is deliberately not in the
build order.

## 5. Method, limits

The board is a single HTML page; each phone renders the app's demo records verbatim (Priya Shah's
deadlift PR, Drew Oyelaran's long run — `COMMUNITY_ACTIVITIES`) on the dark paper with the app's own
tokens: Saira + JetBrains Mono, `BS_SD_ZONES`, tier colours, the plate's `${c}77` / `${c}1f` layers.
Rendered once in Chromium at 1280px and 400px: zero page errors, no horizontal overflow at 400px. The
one look found the section-head chip inside a plate rendering full-width above its label — the chip's
border class `b` collided with the plate's `.pl .b` layer selector — plus truncated set sub-labels and
an empty band above each plate head; fixed in one pass and re-checked in the DOM (every chip on its
label's line, nothing truncated, every plate layer painting). Google Fonts do not load through the
container proxy, so the local look ran on fallback faces; the published page loads the real ones. The
"morning" and "plan" values on the demo phones are examples of the shape, tagged NEW, not the demo
cast's stored data — the demo cast has no set rows or snapshots.
