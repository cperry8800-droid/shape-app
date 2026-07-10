# The launch, on the wire — one self-advancing Daily briefing

**Date:** 2026-07-10 · **Status:** Spec for owner review (build follows approval)

Concept board (owner-picked): <https://claude.ai/code/artifact/562cd222-1012-4efc-9a2e-edadf0caefc9>

## The problem

A member's cold open is **three full-screen stops** before the app: the
4-second cosmos animation (`BSSplash style="cosmos"`, auto-advance,
`iosAppBroadsheetMain.jsx`), the membership gate (members see the bare
`BSPaywallLoading` "Checking membership…" mono screen while auth restores,
then auto-advance — `stage === 'gate'`), and the tap-gated "Shape Daily"
(`BSSplash style="classified"` — already fetching the member's REAL day via
`bsBuildDailyDigest`, but it demands a "Step inside" tap every single open,
including a lunchtime relaunch to check one message). The cosmos ground says
"space app," not "training paper"; the membership screen is a stop that exists
only because the check has nowhere else to live; and the Daily — the best
screen of the three — punishes the member for its own quality by gating entry
on a gesture, every time.

## Owner-picked direction (2026-07-10, from the concept board)

1. **One stage, not three.** A ~1-second **wire-ticker brand beat** (mono
   dispatch lines drifting on the dark ground, one lighting up teal —
   `INCOMING · THE SHAPE DAILY · {NAME}`) dissolves into **"The telegram"**:
   the member's real day set as one wire message (mono, STOP separators, the
   directive lit teal), which **self-advances into the app after ~5 seconds**
   (draining rule + "Entering… / Tap to skip"; any tap enters immediately).
2. **The membership check rides the beat.** No "Checking membership…" screen
   ever renders — the beat holds (ticker keeps drifting) until the check
   resolves. Every signed-in account is a member by construction (signup
   routes through checkout), so members only ever saw that flash anyway.
3. **The members wall stays — signed-out only, re-set in wire.** `BSPaywall`
   is the app's only conversion gate (Join · Preview · Sign in) and the server
   already 402s non-members on paid routes, so it keeps its logic verbatim and
   gets the wire look: dim ticker ground, the STOP-separated feature line
   (incl. **"OR BUILD YOUR OWN WORKOUTS"** — the #1618 self-serve builder),
   clipped solid-teal JOIN CTA. Tap-gated; a decision page never auto-advances.
4. **Warm relaunch skips everything.** A per-account, per-local-day seen-stamp
   sends a same-day reopen **straight to the app** — the briefing is a morning
   ritual, not a toll.
5. **Signed-out preview keeps the tap-gated invite edition** (Inside Shape ·
   In the world) exactly as shipped — a conversion moment shouldn't dismiss
   itself.

## The flow (stage machinery, `iosAppBroadsheetMain.jsx` `BSAppShell`)

### Boot decision (new, synchronous)

On mount, instead of always opening on `'splash'`:

- **Warm skip:** localStorage `shape.dailySeen` holds `"<uid>:<localDay>"`
  (written when a member's telegram enters the app). When it matches today's
  local day (`en-CA` date, the `_localDate()` convention) AND the cached
  membership flag (`localStorage 'shape.member'`, the existing cache) is true
  → open on **`'app'`** directly. Nothing fetches, nothing flashes; the
  stage-`'app'` membership gate remains the safety net if the restore later
  disagrees (existing behavior). The stamp is **uid-scoped**, so a same-day
  logout → different-member login never inherits the skip.
- Otherwise → **`'beat'`** (replaces `'splash'`).

### `'beat'` — the wire-ticker brand beat

New `BSSplash style="wire-beat"`: full-screen ticker ground (5–7 rows of mono
dispatch dashes drifting slowly, transform-only CSS; ONE teal row —
`INCOMING · THE SHAPE DAILY · {FIRSTNAME}` when the cached auth has a name,
else `INCOMING · THE SHAPE DAILY`) with the Shape mark. Decorative
(`aria-hidden` ground + a visually-hidden "Loading Shape" status line).

- **Minimum dwell ~1.1s; holds until the membership inputs resolve**
  (`authReady && !membership.loading` — the same values the gate reads
  today). The beat IS the loading state; `BSPaywallLoading` is retired (its
  one other consumer, the stage-`'app'` fallback gate, renders the static
  wire ground instead — no "Checking membership…" copy anywhere).
- Routes on resolve: no stored `shape.locale` → `'lang'` (first-run picker,
  unchanged) → onward; `memberAllowed` → `'daily'`; else → `'gate'`.
- Tapping the beat does nothing (it's ~1s; a tap target here would race the
  membership resolve).

### `'daily'` — the telegram (members) / invite edition (signed-out preview)

The `style="classified"` splash keeps its shell (digest fetch with the
existing 3-retry auth guard; the **signed-out invite branch stays verbatim**,
tap-only "Step inside"). The **member branch is re-set as the telegram**:

- `SHAPE WIRE` topbar + short date · `TO: {NAME} · PRIORITY` · the wire lines
  (below) · a **draining 2px teal rule** + `ENTERING… / TAP TO SKIP` foot.
- **Self-advance: 5s**, timer starting only once the digest has resolved and
  the lines have rendered (the "Putting today together…" loading state
  carries NO timer — a slow fetch never burns the member's reading time).
  Any tap enters immediately — the full-screen root is a real keyboard
  control: `role="button"` + `tabIndex={0}` + a visible `:focus-visible`
  outline + Enter/Space handling (and the **invite edition's "Step inside"
  root gets the identical treatment** — today it's tap-only). Both paths
  write the seen-stamp, then `setStage('app')`.
- Fresh login (`handleLogin`) still lands directly on `'app'` — the telegram
  is a cold-open ritual, not a post-login stop (today's behavior, kept).
- Preview (`onPreview`) still sets preview mode → `'daily'` invite edition →
  "Step inside" → app + preview banner. Never stamps.

### Telegram content contract (honest data — lines assemble ONLY from the digest)

From `bsBuildDailyDigest()` (`{score, training, coach, nutrition, streak,
challenge}`) + the directive (below). A missing leg **omits its line** —
never a fabricated figure, never a placeholder number.

1. **Session line** — `training.hasWorkout` →
   `{TITLE} {12h TIME} STOP WITH {COACH} STOP` (time/coach fragments only
   when present; move count/duration fold in when the line stays short);
   plan-but-rest-day → `REST DAY ON THE BOOKS STOP`; no plan →
   `NO SESSION ON THE WIRE STOP FIND YOUR COACH INSIDE STOP` (the classified
   splash's existing honest branches, re-voiced).
2. **Directive line (teal, the page's one accent)** — see next section.
   Omitted when the engine has no real lever.
3. **Numbers line** — fragments for score (`SCORE {N} UP {delta}` — delta
   fragment only when > 0), protein (`PROTEIN {n} OF {target}` when target
   known, else `PROTEIN {n}G`), streak (`STREAK {n} DAYS`). Line omitted when
   no fragment exists.
4. **Coach line (optional)** — latest coach note via the digest's existing
   `bsDigestCoach` + `bsDigestClamp`: `{WHO}: {TEXT…} STOP`.
5. **Closer** — session day: `REPLY BY SHOWING UP END`; otherwise the last
   rendered line simply terminates `END`.

Type: mono uppercase ≥ 10.5px with ≥ 2.0 line-height (long all-caps runs need
air — the board's own caveat), STOP/END at low ink alpha, directive at the
teal accent.

### The directive — one computation, shared with Home

Home's lead already resolves the engine directive
(`iosAppBroadsheetClient.jsx` ~2602: `window.ShapeSignals.selfRecord()` →
`ShapeSignals.directive(rec)`, gated on
`dir.action && dir.lever !== 'none' && dir.verdict !== '—'`). The splash calls
the **identical two-call path with the identical gate** — `ShapeSignals` is
a window-global loaded by `main.jsx` services, available before the client
bundle. The evaluation joins `bsBuildDailyDigest`'s `Promise.all` as a
**bounded leg**: the evaluation is raced against a ~1.5s timeout
(`Promise.race`) and resolves `null` on timeout, absence, or error — so a
slow or hung `ShapeSignals` evaluation can never delay the digest render (the
digest's other legs stay authoritative for timing), and a `null` directive
simply omits the line.

The **lever → head words** map (checkin → "Send your weekly check-in.",
training → "Keep the streak alive.", nutrition → "Log a meal today.", goal →
"Your goal pace slipped.", score → "Grab a win today.") is extracted to the
new pure module as `BS_LEVER_HEADS`; **Home's `engineMove` map switches its
`tr()` `defaultValue`s to read `BS_LEVER_HEADS`** — one implementation, i18n
overrides ride on top, the two surfaces cannot drift. The telegram renders
`{HEAD} — {dir.reason}` uppercased, teal.

### The wall — `BSPaywall` wire restyle (logic verbatim)

Dim drifting ticker ground behind the content; `SHAPE WIRE / MEMBERS ONLY`
rule-bound head; serif "Shape is for *members*." (teal italic); the feature
list becomes ONE wire line — `TRAINING STOP NUTRITION STOP COACHES STOP RADIO
STOP THE SCORE STOP OR BUILD YOUR OWN WORKOUTS END`; **clipped solid-teal
`JOIN · $5/MO →`** (squared, top-right notch — the house CTA, replacing the
999-radius pill); `PREVIEW THE APP FIRST →` as a quiet hairline row; `SIGN IN
→` / `SIGN OUT` as mono text-actions. `onJoin`/`onPreview`/`onSignIn`/
`onLogout` handlers, the signed-in/out branches, and the
`ShapeAnalytics.track('paywall_viewed')` mount call carry over byte-identical.
44px targets throughout. Solid teal = the one commerce action on the page.

## Pure module + tests (TDD)

**`mobile-app/src/services/dailyWire.mjs`** (+ `tests/daily-wire.test.mjs`,
registered in `npm test`):

- `bsLaunchRoute({ stamp, uid, todayLocal, memberCached })` → `'app' | 'beat'`
  — the warm-skip decision. Vectors: same uid + same day + cached member →
  `'app'`; different uid / different day / no membership cache / no stamp →
  `'beat'`; malformed stamp → `'beat'`.
- `bsAfterBeat({ allowed, hasLocale })` → `'lang' | 'daily' | 'gate'`.
- `bsWireLines(digest, directive)` → ordered `[{ text, hot }]` with STOP/END
  placement. **Signed-out sentinel contract:** the digest itself carries the
  membership state — `bsWireLines` returns `null` when `digest` is null/absent
  OR `digest.signedIn !== true` (the caller renders the invite edition
  instead); a member digest with missing legs is the honest-omission path,
  never conflated with signed-out. Vectors: full digest; rest day; no plan;
  numbers-only; directive present/absent; `null` digest → `null`;
  `signedIn: false` → `null`; closer variants; no fabricated fragments when
  legs are null.
- `bsWireDirective(dir)` + `BS_LEVER_HEADS` — mirror of Home's gate
  (`lever === 'none'` / `verdict === '—'` / missing action → null).

## Motion & accessibility

- The **beat's drifting ticker is the launch's only loop**, and it lives only
  on the beat and the wall grounds. The member telegram plays one-shot
  entrances (lines rise ~350ms staggered) and the single 5s linear drain — no
  infinite animation on the briefing itself (house one-loop rule).
- **`prefers-reduced-motion`:** the beat renders static (no drift), the
  telegram renders fully assembled instantly, and the drain is replaced by a
  static rule + an explicit `ENTER →` affordance — **no auto-advance under
  reduced motion** (timing pressure removed, WCAG 2.2.1); tap/Enter/Space
  enters.
- The telegram is real text (screen-reader readable); the root is a real
  keyboard control — `role="button"` + `aria-label="Enter the app"` +
  `tabIndex={0}` + a visible `:focus-visible` outline + Enter/Space handling.
  The invite edition's "Step inside" root carries the same contract.

## What dies / what stays

- **Dies:** the cosmos launch stage (the `BSNightSky` component stays — the
  auth screens deliberately use it); `BSPaywallLoading` ("Checking
  membership…"); the member classified layout (masthead/greeting/lead/
  register — superseded by the telegram); the mandatory "Step inside" tap for
  members.
- **Stays verbatim:** the signed-out invite edition; the wall's logic +
  analytics; login-lands-in-app; preview mode + banner; the digest builder
  (gains one directive leg); the gate's `memberAllowed`/`memberGateLoading`
  derivation; the stage-`'app'` fallback gate (safety net).
- **Out of scope:** the website (no equivalent splash); i18n (the launch
  surfaces stay English like today's classified — they join the paused
  rollout as their own surface later); the Tweaks panel's `splashBg` preview
  pickers (the live boot just stops consuming them — the panel is dev-only).

## Acceptance criteria

1. Member cold open: beat (~1s, longer only if membership resolve is slow) →
   telegram with REAL data → auto-enters at 5s; tap enters early; no
   membership screen anywhere.
2. Member same-day relaunch: straight to the app — zero splash frames.
3. Next-morning open: the briefing shows again (stamp rolled over at the
   member's LOCAL midnight).
4. Signed-out: beat → wire wall (Join/Preview/Sign in live) → Preview → the
   unchanged tap-gated invite edition; no stamp written.
5. Lapsed signed-in account: beat → wall with Sign out (existing branch).
6. First run: beat → language picker → membership routing (locale flow
   unchanged).
7. Missing digest legs omit their lines; a rest day and a no-plan day read
   their honest lines; the directive appears only on a real engine lever and
   matches Home's lead subject that morning.
8. Reduced motion: static, assembled, tap-to-enter — no timer.
9. Suite green with the new `daily-wire` vectors; JSX parse · `tsc` ·
   PowerShell `/m/` build exit 0 · LF.

## Build plan

**One build PR** (mobile-only): `dailyWire.mjs` + tests → stage machinery
(boot decision, `'beat'`, retire `BSPaywallLoading`) → the telegram member
branch → the wall restyle → Home's `BS_LEVER_HEADS` defaultValue swap.
Standard gates (CI green + CodeRabbit, all findings addressed). On-device
pass (owner): cold/warm/next-day × signed-out wall + preview × reduced motion
× Black/Sage/Cream papers (the launch surfaces are fixed-dark, papers only
affect the app behind them — confirm no theme-token leaks).
