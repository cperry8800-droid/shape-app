// CoachSettingsPage — the coach's office settings (review 2026-09-09, R14).
// A #settings tab in both coach shells: how the signal engine reads THEIR practice,
// where the dashboard opens, and which of their own notifications reach them.
//
// ⚠ EVERY CONTROL HERE DRIVES SOMETHING, AND THE ONES THAT COULD NOT ARE ABSENT.
// R14 also asks for week start, units, theme, locale and a roster default filter and
// sort. They are deliberately not here:
//   · units / theme / locale — the review lists this separately as C5, "no units,
//     theme or language on the web" for BOTH roles. It is a cross-cutting change to
//     the theme tokens and the web i18n layer, not an office setting.
//   · roster default filter + sort — the roster (dashRoster.jsx) has no filter or
//     sort control at all, so a DEFAULT for one would be a preference for a feature
//     that does not exist. R16 is where the control belongs; the default follows it.
//   · week start — the Week view, coach_week_reviews and coach_week_publishes are all
//     keyed on the ISO Monday, and those keys are already written. Moving the start
//     day silently re-buckets a coach's saved reviews.
// A settings panel whose toggles control nothing is worse than a missing panel: it
// tells a coach their practice is tuned when it is not.
const CST_MONO = "'JetBrains Mono', monospace";
const CST_INK = "var(--sh-ink, #f2ede4)";
const CST_INK50 = "var(--sh-ink2, #a09b94)";
const CST_TEAL = "var(--sh-accent, #2ee0c4)";
const CST_AMBER = "var(--sh-gold, #d8a23a)";

const CST_CHANNELS = [["inapp", "App"], ["push", "Push"], ["email", "Email"]];
// ⚠ THE GATE'S OWN DEFAULTS, AND EMAIL IS OFF. `defaultChannels()` in
// src/lib/ai/notifications.mjs returns { inapp:true, push:true, email:false }, and
// `channelsForType` uses it for any channel with no stored override. Rendering an
// unset switch as ON for all three showed a coach Email ✓ in teal on "Client went
// red" while no email is ever sent — and their first tap then computed !true and
// saved an explicit `email:false`, so turning it on actually took two taps.
const CST_DEFAULT_CHANNELS = { inapp: true, push: true, email: false };
// ⚠ EMAIL IS OFFERED ONLY FOR A NEW LEAD (owner, 2026-10-16: email for what matters, the rest
// "save for notifications"). Red and amber clients are app and push only: no Email switch, and the
// server never emails them. A copy of public/newdesign/notificationSurfaces.mjs EMAIL_TYPES, held
// to it by tests/notification-email.test.mjs, because this page is not a module.
const CST_EMAIL_TYPES = ["waitlist_join"];
const CST_CAPS = [2, 3, 4, 6, 8];
// An hour field reads "22:00": its ":00" sits against the digits.
const CST_HOUR_SUFFIX = { marginLeft: -5 };

// ⚠ THE COACH'S NOTIFICATION TYPES ARE DERIVED, NOT LISTED. src/lib/ai/notifications.mjs
// marks every type with an `audience`, and the delivery gate gives a type no channel
// when the coach has turned all three off. Hand-listing them here would drift from
// that registry the first time a type is added — and, worse, would invite listing a
// type the matrix cannot actually govern.
//
// ⚠ AND EVERY OTHER NOTIFICATION A COACH RECEIVES HAS A ROW TOO (owner, 2026-10-26: "make sure users
// have the ability to customize/toggle which notifications they want"). Credential and payment
// notices were left out because createNotification wrote them past the preference matrix, so a
// switch would have changed nothing. The push dispatcher and the bell now read every row against the
// switch it answers to (notificationSurfaces.mjs preferenceTypeFor), so each row here governs them.
// tests/notification-switches.test.mjs holds this list to that map and to the app's.
const CST_COACH_TYPES = [
  ["client_red", "Client went red", "A client you act on crossed into red"],
  ["client_amber", "Client went amber", "A client moved to amber — worth a look, not an alarm"],
  // ⚠ GOVERNED BY THE MATRIX, AND ABSENT FROM THE REGISTRY — so a list derived from
  // NOTIFY_TYPES alone silently dropped it. `waitlist_join` is sent by
  // src/app/api/waitlist/join/route.ts through `createPreferredNotification`, which
  // consults notification_preferences; it is not an AI-notify-layer CANDIDATE, which is
  // why it carries no registry entry. The mobile coach settings have always shown it,
  // so the web was the odd one out — and the footer below claimed credential-expiry and
  // payment were the ONLY notifications this panel does not govern, which made the
  // omission a false claim rather than a gap.
  ["waitlist_join", "Waiting-list requests", "Someone joined your waiting list"],
  // Shared habits (src/app/api/cron/habit-watch): a coach can be picked like anyone joined to the
  // member by an accepted follow, so they need the same switch (Codex on #2413). Sent through
  // preferredNotificationOutcome, which reads the matrix; the cron applies quiet hours and the cap.
  ["friend_habit", "Friends' habits", "When a friend hasn't done a habit they shared with you"],
  ["client_message", "Client messages", "When a client or their care team writes"],
  ["direct_message", "Messages", "When a member writes to you"],
  ["new_client", "New clients", "When someone signs up with you"],
  // A client of yours hired another coach, or you were hired by one who has (coach-thread.ts tellSharedCoaches).
  ["shared_client", "Shared clients", "When a client of yours also hires another coach"],
  ["sessions", "Sessions", "Requests, payments and cancellations"],
  ["payments", "Payments", "Sales and monthly renewals"],
  ["credentials", "Credentials", "Verified, a fix needed, or a renewal due"],
  ["follows", "Followers", "New followers and follow requests"],
  ["account", "From Shape", "Notes about your account"],
];
// The registry's coach types, which this panel must cover in full — the extra entries
// above are preference-gated sends that never become candidates.
// ⚠ `checkin_submitted` IS IN THE REGISTRY AND IS NOT HERE, BECAUSE NOTHING SENDS IT.
// `coachCandidates` emits only client_red / client_amber, and a repo-wide search finds
// no event-driven creator either — so all three of its switches were inert while the
// panel presented them as governed controls, which is the exact failure this file's
// header rails against. Registered rather than wired: giving check-in submissions a
// notification is a feature, not a settings fix. (The MOBILE coach settings still list
// it — same inert row, registered too.)
const CST_REGISTRY_COACH_TYPES = ["client_red", "client_amber"];

// ── The page in sections (owner, 2026-11-10: "settings page needs to be organized much better", then
// "create tabs at the top that get to different sections in settings instead of scrolling all the way
// down"). The switch Business uses (DashSegmented), remembered per role the way Business remembers
// its own, and a link can name one: #settings?section=notifications. Guides has its own tab because the
// dashboard tour says it is in "Settings → Guides" (dashTour.js).
// ⚠ OBJECTS, NEVER `["key", "Label"]` ROWS, here and in the groups below:
// tests/coach-settings.test.mjs reads every two-space-indented `["key",` line in this file as a
// notification switch.
const CST_SECTIONS = [
  { key: "general", label: "General" },
  { key: "flags", label: "Client flags" },
  { key: "notifications", label: "Notifications" },
  { key: "calendar", label: "Calendar" },
  { key: "guides", label: "Guides" },
  { key: "account", label: "Account" },
];
const CST_SECTION_KEYS = CST_SECTIONS.map((s) => s.key);
// A section's cards side by side on a wide screen, one column on a narrow one.
const CST_GRID = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: 16, alignItems: "start" };

// The flag numbers read as a few questions, and each coach's own first (owner, 2026-11-10: "make sure
// these are relevant to each coach. Trainer vs nutritionist"). The ROWS still come from the engine
// (DashSignals.tunablesFor: the ones this role's evaluation reads, in its words, with its house
// values): a group only names keys, so a threshold the engine adds lands under "More" rather than
// going missing, and one it drops is skipped rather than offered. A role's own groups come first; the
// last are the ones another coach owns while they're on the client, and the context a coach sees and
// never counts.
const CST_FLAG_CONTACT = { key: "contact", icon: "contact", label: "Contact & check-ins", blurb: "When a client goes quiet, hasn't started, misses the weekly check-in, or is waiting on you.", keys: ["QUIET_DAYS", "CONTACT_GAP_DAYS", "REPLY_WAIT_HOURS", "NOT_STARTED_DAYS", "CHECKIN_GRACE_DAYS", "CHECKIN_RED_WEEKS"] };
const CST_FLAG_CONTEXT = { key: "context", icon: "example", label: "Context · shown, never counted", blurb: "On the client so you can ask about it. It never colours a row or sends an alert.", keys: ["SCORE_DROP_PCT"] };
// A trainer's context also reads the training load and the steps (the coach-alerts plan, PR 1).
const CST_FLAG_CONTEXT_TRAINER = { ...CST_FLAG_CONTEXT, keys: ["SCORE_DROP_PCT", "LOAD_SPIKE_X", "STEPS_DROP_PCT"] };
const CST_FLAG_GROUPS_BY_ROLE = {
  trainer: [
    { key: "training", icon: "training", label: "Training & sessions", blurb: "When workouts or sessions slip, nothing is booked, a program runs out, or a strength or endurance goal stalls.", keys: ["WORKOUT_DONE_PCT", "WORKOUT_MISSED_ROW", "WORKOUT_MIN_DUE", "COMPLETION_DROP_PCT", "MISSED_SESSIONS", "NO_BOOKING_DAYS", "PROGRAM_END_DAYS", "GOAL_SLIP_DAYS"] },
    { key: "recovery", icon: "recovery", label: "Recovery", blurb: "When sleep or a wearable's recovery runs low, so you can ease the load.", keys: ["SLEEP_DEFICIT_H", "RECOVERY_LOW"] },
    CST_FLAG_CONTACT,
    { key: "nutrition", icon: "nutrition", label: "Nutrition · when you're their only coach", blurb: "With a nutritionist on the client these are theirs, and you see them as context. Without one they're yours, and calories and protein never turn a row red.", keys: ["FOOD_GAP_DAYS", "LEDGER_OVER_PCT", "PROTEIN_UNDER_PCT"] },
    CST_FLAG_CONTEXT_TRAINER,
  ],
  nutritionist: [
    { key: "intake", icon: "nutrition", label: "Logging & intake", blurb: "When logging thins out, or intake runs off the plan's targets.", keys: ["FOOD_GAP_DAYS", "FOOD_LOG_DAYS", "LEDGER_OVER_PCT", "PROTEIN_UNDER_PCT"] },
    { key: "plans", icon: "progress", label: "Plans & progress", blurb: "When a plan runs out, a weight goal stalls, your sessions slip, or nothing is booked.", keys: ["PROGRAM_END_DAYS", "GOAL_SLIP_DAYS", "MISSED_SESSIONS", "NO_BOOKING_DAYS"] },
    CST_FLAG_CONTACT,
    { key: "recovery", icon: "recovery", label: "Recovery · the trainer's when one is on", blurb: "Sleep and recovery are the trainer's to act on. When you're the client's only coach, they're yours.", keys: ["SLEEP_DEFICIT_H", "RECOVERY_LOW"] },
    CST_FLAG_CONTEXT,
  ],
};
function cstFlagGroups(role) {
  return CST_FLAG_GROUPS_BY_ROLE[role === "nutritionist" || role === "dietitian" ? "nutritionist" : "trainer"];
}
// The notification switches under four headings. CST_COACH_TYPES stays the list of rows, with the
// same rule: a type no group names lands under "More".
const CST_NOTIFY_GROUPS = [
  { key: "clients", label: "Your clients", keys: ["client_red", "client_amber", "client_message", "new_client", "shared_client"] },
  { key: "business", label: "Bookings & money", keys: ["sessions", "payments", "waitlist_join"] },
  { key: "people", label: "People", keys: ["direct_message", "follows", "friend_habit"] },
  { key: "account", label: "Your account", keys: ["credentials", "account"] },
];
// `rows` under the groups that name them, in each group's order; a row no group names goes last,
// under `rest`, and a name with no row is skipped. A group left empty is dropped.
function cstGrouped(groups, rows, keyOf, rest) {
  const byKey = new Map(rows.map((r) => [keyOf(r), r]));
  const placed = new Set();
  const out = [];
  groups.forEach((g) => {
    const got = [];
    g.keys.forEach((k) => { if (byKey.has(k) && !placed.has(k)) { placed.add(k); got.push(byKey.get(k)); } });
    if (got.length) out.push({ ...g, rows: got });
  });
  const left = rows.filter((r) => !placed.has(keyOf(r)));
  if (left.length) out.push({ ...rest, rows: left });
  return out;
}

function cstCard(children, extra) {
  return (
    <div className="dash-plate dash-plate--tick dash-plate--bracket" style={{ "--dac": CST_TEAL, paddingLeft: 24, ...(extra || {}) }}>
      {children}
    </div>
  );
}
function cstChip(on) {
  return { fontFamily: CST_MONO, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", padding: "8px 13px", borderRadius: 7, border: "1px solid " + (on ? CST_TEAL : "var(--sh-line2, #413d38)"), background: on ? "var(--sh-accent-tint, #182d26)" : "transparent", color: on ? "var(--sh-accent-ink, #2ee0c4)" : CST_INK, cursor: "pointer" };
}
// The card's head: an icon in an accent tile, the mono eyebrow, and a status on the right
// (owner, 2026-11-10: "improve look of boxes etc"). Icons are 20-unit strokes in the accent,
// never an emoji.
const CST_ICONS = {
  opens: "M3 5.5A1.5 1.5 0 0 1 4.5 4h11A1.5 1.5 0 0 1 17 5.5v9a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 14.5zM3 8h14M7 8v8",
  example: "M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10zM10 12.3a2.3 2.3 0 1 0 0-4.6 2.3 2.3 0 0 0 0 4.6z",
  skin: "M10 3a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM10 3v14",
  flag: "M5 17V3.5M5 4h9.5l-2 3.5 2 3.5H5",
  contact: "M4 5.5A1.5 1.5 0 0 1 5.5 4h9A1.5 1.5 0 0 1 16 5.5v6a1.5 1.5 0 0 1-1.5 1.5H9l-3.5 3v-3A1.5 1.5 0 0 1 4 11.5z",
  checkins: "M4 6a1.5 1.5 0 0 1 1.5-1.5h9A1.5 1.5 0 0 1 16 6v8.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 4 14.5zM4 8.5h12M7.5 3v3M12.5 3v3M7.5 12.2l1.7 1.6 3.3-3.3",
  body: "M2.5 10.5h3.5l2-4.5 3.5 9 2-4.5h4",
  progress: "M3 14.5l4.5-4.5 3 3L17 6.5M12.5 6.5H17V11",
  bell: "M6 8.5a4 4 0 0 1 8 0c0 4 1.8 5.5 1.8 5.5H4.2S6 12.5 6 8.5zM8.5 16.5a1.6 1.6 0 0 0 3 0",
  switches: "M4 6h7M14 6h2M4 14h2M9 14h7M12.5 4.3v3.4M7.5 12.3v3.4",
  zone: "M10 3a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM3 10h14M10 3c2 2 3 4.5 3 7s-1 5-3 7c-2-2-3-4.5-3-7s1-5 3-7z",
  calendar: "M4 6a1.5 1.5 0 0 1 1.5-1.5h9A1.5 1.5 0 0 1 16 6v8.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 4 14.5zM4 8.5h12M7.5 3v3M12.5 3v3",
  training: "M3 8v4M5.5 6.5v7M14.5 6.5v7M17 8v4M5.5 10h9",
  recovery: "M15.5 12.5A6 6 0 0 1 7.5 4.5a6 6 0 1 0 8 8z",
  nutrition: "M10 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12zM10 7.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z",
};
function cstIcon(name) {
  const d = CST_ICONS[name];
  if (!d) return null;
  return (
    <span className="cst-icon" aria-hidden="true">
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
    </span>
  );
}
function cstPill(text, tone, dot) {
  return <span className={"cst-pill" + (tone ? " is-" + tone : "")}>{dot ? <span className="cst-dot" /> : null}{text}</span>;
}
function cstHead(icon, label, right) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      {cstIcon(icon)}
      <span className="dash-eyebrow">{label}</span>
      {right ? <span style={{ marginLeft: "auto", display: "inline-flex", gap: 6, flexWrap: "wrap" }}>{right}</span> : null}
    </div>
  );
}
// ⚠ A NUMBER FIELD THAT COMMITS ON BLUR, NOT ON EVERY KEYSTROKE, AND THAT REFUSES AN
// EMPTY VALUE. Two measured problems with the naive form:
//   · `Number("")` is 0 and finite, so selecting the field and pressing Backspace
//     passed a min-0 guard and SAVED 0 — the check-in grace disabled, or quiet hours
//     moved to midnight, with one keypress.
//   · typing "14" wrote "1" first: a full read-modify-write round trip per digit, and
//     the roster momentarily ran at FOOD_GAP_DAYS 1, flagging every client. If the
//     second write failed the account was left pinned at the intermediate value.
// The field holds its own text while being typed and reports once, on blur or Enter;
// an out-of-range or empty value snaps back to what is stored rather than saving.
function CstNumber({ value, min, max, step, label, disabled, onCommit, suffix, tone, suffixStyle }) {
  const [draft, setDraft] = React.useState(String(value));
  // The stored value wins whenever it changes underneath us (another device, a reset).
  React.useEffect(() => { setDraft(String(value)); }, [value]);
  const commit = () => {
    const t = draft.trim();
    const n = t === "" ? NaN : Number(t);
    if (!Number.isFinite(n) || n < min || n > max) { setDraft(String(value)); return; }
    if (n !== value) onCommit(n);
  };
  // One box: the number and its unit inside it (dash.css .cst-field). `tone` is "tuned" (the accent)
  // or "refused" (amber).
  return (
    <span className={"cst-field" + (tone ? " is-" + tone : "") + (disabled ? " is-off" : "")}>
      <input
        type="number" min={min} max={max} step={step} value={draft} aria-label={label} disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
      />
      {suffix != null ? <span className="cst-field-unit" style={suffixStyle}>{suffix}</span> : null}
    </span>
  );
}

// ⚠ WHOLE-ROW WRITES ARE SERIALIZED, BECAUSE COMPLETION ORDER MUST NOT DECIDE THE
// RESULT. `notification_settings` is upserted as a whole row, so two quick changes —
// blurring a quiet-hours field and immediately picking a daily cap — raced: if the
// earlier request finished last its older snapshot overwrote the newer change, and an
// earlier FAILURE could roll the panel back over an edit the coach had already made.
// One lane, so each write sees the result of the one before it.
let _cstLane = Promise.resolve();
function cstSerial(fn) {
  const next = _cstLane.then(fn, fn);
  _cstLane = next.then(() => {}, () => {});
  return next;
}

// A notice that names the field it is about: a bare "Couldn't save that just now."
// over a panel that has already rolled the change back tells a coach nothing about
// WHICH of their changes did not land.
const CST_FIELD_NAMES = { muted: "the mute switch", quiet_start: "quiet hours", quiet_end: "quiet hours", daily_cap: "the daily cap" };
function cstFieldName(keys) {
  const seen = [];
  (keys || []).forEach((k) => { const n = CST_FIELD_NAMES[k] || k; if (seen.indexOf(n) < 0) seen.push(n); });
  return seen.length ? seen.join(" and ") : "that";
}
function cstTypeName(type) {
  const row = CST_COACH_TYPES.filter((r) => r[0] === type)[0];
  return row ? row[1] : type;
}
// The zone quiet hours are kept in: the account's (P9, shapeZone.mjs's window.ShapeZone, read at call
// time), else this browser's, else UTC. A laptop in another zone no longer moves them.
function cstTz() {
  try { const Z = window.ShapeZone; const z = Z && typeof Z.viewerZone === "function" ? Z.viewerZone() : null; if (z) return z; } catch (e) { /* this browser's */ }
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch (e) { return "UTC"; }
}
function cstLabel(text) {
  return <div style={{ fontFamily: CST_MONO, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: CST_INK50 }}>{text}</div>;
}

// The tabs a coach may open on, taken from the SAME nav config the sidebar renders,
// so a tab added there is offered here without anyone remembering this file.
// `client` is excluded: `#client/<id>` needs an id, and a landing route that cannot
// resolve one lands the coach on a page about nobody.
function cstLandingOptions(role) {
  const items = (role === "nutritionist" ? nutriNavItems : trainerNavItems)("today");
  return items.map((i) => [i.slug, i.label]).filter(([slug]) => slug !== "client");
}

function CoachSettingsPage({ role }) {
  const nav = role === "nutritionist" ? nutriNavItems : trainerNavItems;
  const card = role === "nutritionist" ? nutriPayoutCard : trainerPayoutCard;
  // ⚠ THE TWO LIGHTWEIGHT HOOKS, NOT THE WHOLE DASHBOARD PIPELINE. This page reads
  // `tuning.refused` and nothing else off the engine, but `useDashboard` fetches the
  // roster and the dashboard and then reads every roster member's overview (one
  // /shared-overview GET per member until 2026-09-30, one batched POST per 50 since) —
  // so opening Settings on a 100-client practice cost about a hundred API calls to
  // edit a number, and would still cost the whole roster read. `useCoachThresholds` is literally the hook `useDashboard` uses for
  // `tuning`, so this is the same value with none of the fan-out.
  const tuning = useCoachThresholds(role);
  // ⚠ PERSISTENCE KEYS ON AUTHENTICATION, NOT ON THE ROSTER. The roster's `source` is
  // about DATA: null while its request is in flight, "demo" when that request FAILS.
  // Keying on it meant a roster outage made every edit tab-only and told a signed-in
  // coach to sign in while the settings backend was healthy. It decided the DEMO BAND
  // too — and on a page that renders no roster data, the honest band is simply whether
  // this is someone's own account.
  // ⚠ THE HOOK RESOLVES AN ACCOUNT, NOT A FLAG. undefined = still resolving or
  // unreadable (both mean "no edit may land yet"), null = confirmed signed out, a
  // string = signed in as that account. Everything below keys on the account so a
  // sign-in from another tab cannot leave this one showing — or writing — the previous
  // coach's settings.
  const acct = useSignedIn();
  const signedIn = acct === undefined ? undefined : acct !== null;
  const live = signedIn === true;
  const store = useCoachDoc("coach_settings", live, acct);
  const doc = store.doc || {};
  // The tunables this role's evaluation reads, in its words and with its house values: see the note on
  // TUNABLES — the engine routes flags by ownership rather than evaluating a different rule set, so
  // every threshold that moves what a role sees is on its page (tunablesFor drops only one no
  // evaluation of this role reads).
  const tunables = typeof DashSignals.tunablesFor === "function" ? DashSignals.tunablesFor(role) : (DashSignals.TUNABLES || []);
  const landing = cstLandingOptions(role);
  // The paper (light by default, the previous dark tones one tap away) is the
  // account's, shared with the app through app_tweaks — dashData.jsx's own hook.
  // It loads after this module on every host, so the read is a page-life constant.
  const paperCtl = typeof useDashPaper === "function" ? useDashPaper() : ["light", null, { kind: "none" }];
  const [localDemo, setLocalDemo] = React.useState(null); // preview edits — this tab only
  // ⚠ "READY OR ERROR" IS NOT THE SAME QUESTION AS "MAY I EDIT". An edit made while
  // the document is still loading used to land in `localDemo`, paint, count as tuned,
  // and then be thrown away the moment the read resolved and `effective` switched to
  // `doc` — with the header meanwhile claiming "Preview — changes stay on this tab",
  // which was false in both halves. dashWeek was fixed for exactly this on 2026-09-09.
  // The controls are disabled until the store has an answer.
  // Unknown authentication is settling too: enabling the controls before that answer
  // lands is exactly how an early edit gets routed to the wrong place and then lost.
  const settling = signedIn === undefined || (live && store.kind === "loading");
  const canPersist = store.kind === "ready" || store.kind === "error";
  const persisting = live && canPersist;
  const effective = persisting ? doc : (localDemo || (live ? {} : doc));
  const effThresholds = (effective.thresholds && typeof effective.thresholds === "object") ? effective.thresholds : {};
  // What the ENGINE made of those overrides. A stored value it refused is not a tuning
  // — rendering it as one shows the coach a number their roster is not running on,
  // which is the whole reason resolveThresholds refuses rather than clamps.
  const refused = new Set(((tuning && tuning.refused) || []).map((r) => r.key));

  // ⚠ THE PANEL DOES NOT WRITE ENGINE STATE. Thresholds travel as a value now — the
  // dashboard hook resolves them per call — so all this page does is save the document
  // and say so. The event tells surfaces already mounted to re-read it.
  const announce = () => {
    // Drop the shared cache FIRST: the event's listeners re-read immediately, and a
    // stale entry would hand them the document as it was before this write.
    try { dashInvalidateCoachSettings(); } catch (e) {}
    try { window.dispatchEvent(new CustomEvent(DASH_THRESHOLDS_EVENT)); } catch (e) { /* the next load reads it */ }
  };
  const patch = (mut) => {
    if (settling) return Promise.resolve(false);
    if (persisting) return store.apply((d) => mut(d || {})).then((ok) => { if (ok) announce(); return ok; });
    setLocalDemo((d) => mut(d || doc || {}));
    return Promise.resolve(false);
  };
  const setThreshold = (key, value) =>
    patch((d) => {
      const t = { ...((d.thresholds && typeof d.thresholds === "object") ? d.thresholds : {}) };
      // ⚠ A KNOB RETURNED TO THE HOUSE DEFAULT IS REMOVED, NOT STORED AS ITS VALUE.
      // Otherwise a coach who never chose 3 is pinned to 3 forever, and a later change
      // to house policy silently skips every coach who once touched that row.
      if (value == null) delete t[key]; else t[key] = value;
      return { ...d, thresholds: t };
    });
  const setLanding = (slug) => patch((d) => ({ ...d, landingTab: slug }));

  // ⚠ A LIVE ACCOUNT IS NEVER TOLD TO SIGN IN. `useCoachDoc` maps a null read to
  // `signedout`, but `getUserGoals` returns null for an UNREADABLE read too — and when
  // `live` is true the roster API has already answered as this coach, so "signed out"
  // is impossible. Saying it anyway is the conflation corrected on 2026-09-10 one
  // module over. `loading` also covers the frame before `source` resolves, so the
  // sign-in line cannot flash on a healthy load.
  const storeLine = signedIn === undefined ? "Loading…"
    : !live ? "Preview — changes stay on this tab"
    : store.kind === "loading" ? "Loading your settings…"
    : store.kind === "error" ? "Couldn't save — your last change didn't stick, try again"
    : store.kind === "signedout" || store.kind === "unavailable" ? "Couldn't read your settings just now — changes won't be kept"
    : "Saved to your account";
  // ⚠ A REFUSED OVERRIDE IS NOT A TUNING, AND COUNTING IT MAKES THE CARD CONTRADICT
  // ITSELF: the header said "1 tuned" while the row beneath it said "not used" and both
  // the roster and the server ran the house default — for exactly the untrusted-document
  // case the validation exists to handle.
  const tunedCount = tunables.filter((t) => effThresholds[t.key] != null && !refused.has(t.key)).length;
  const storeTone = live && store.kind === "ready" ? CST_TEAL : live && store.kind !== "loading" ? CST_AMBER : CST_INK50;
  // The account's time zone control (zoneSettingWeb.jsx, its own script), read at render.
  const ZoneSetting = typeof window.ShapeZoneSetting === "function" ? window.ShapeZoneSetting : null;

  // ── the sections ──────────────────────────────────────────────────────────
  // The store off the account this page already resolved (`acct`), not a second useSignedIn.
  const prefs = useRememberedChoicesFor(live, acct);
  const [section, setSection] = useRememberedChoice(prefs, "settingsSection:" + role, CST_SECTION_KEYS, "general");
  // A link that names a section opens on it, and counts as the coach's choice, as on Business.
  React.useEffect(() => {
    const asked = typeof dashRouteParam === "function" ? dashRouteParam("section") : null;
    if (asked && CST_SECTION_KEYS.includes(asked)) setSection(asked);
  }, []);
  // …and so does one followed while Settings is already open: the shell keeps this page mounted
  // when only the hash's ?section= changes (the tour's "See all guides" sends #settings?section=guides).
  // Bound to the current setter, whose account changes once the sign-in resolves.
  React.useEffect(() => {
    const follow = () => {
      const asked = typeof dashRouteParam === "function" ? dashRouteParam("section") : null;
      if (asked && CST_SECTION_KEYS.includes(asked)) setSection(asked);
    };
    window.addEventListener("hashchange", follow);
    return () => window.removeEventListener("hashchange", follow);
  }, [setSection]);
  const hasAccount = typeof CoachAccountSettings === "function";
  const hasGuides = typeof CoachGuidesCard === "function";
  const sections = CST_SECTIONS.filter((s) => (s.key !== "account" || hasAccount) && (s.key !== "guides" || hasGuides));
  const active = sections.some((s) => s.key === section) ? section : "general";
  // ⚠ EVERY PANEL STAYS MOUNTED, AND A TAB ONLY HIDES THE OTHERS. Each card reads its own data when it
  // mounts (the notification centre, the calendar link, the zone, the account), so unmounting a tab
  // would read it again, flash "Loading…" on every switch, and drop a card's notice mid-save.
  // `hidden` on a wrapper with no display of its own: an inline display would override it.
  const panel = (key, body) => (
    <div key={key} role="tabpanel" aria-label={(CST_SECTIONS.find((s) => s.key === key) || {}).label} hidden={active !== key}>{body}</div>
  );

  const flagRow = (t) => {
    const val = effThresholds[t.key];
    const wasRefused = refused.has(t.key);
    // A stored value the engine refused is NOT a tuning — the roster runs on the house default, so
    // the row must say so rather than showing the refused number in teal as if it were live.
    const isTuned = val != null && !wasRefused;
    // This role's house value (a trainer's food-log gap is 5 days, a nutritionist's 3).
    const house = t.house != null ? t.house : DashSignals.DEFAULT_THRESHOLDS[t.key];
    const shown = isTuned ? val : house;
    return (
      <div key={t.key} style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", paddingTop: 14, marginTop: 14, borderTop: "1px solid var(--sh-line, #302c27)" }}>
        <div style={{ flex: "1 1 200px", minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: CST_INK }}>{t.label}</div>
          <div style={{ fontSize: 12, color: CST_INK50, lineHeight: 1.45, marginTop: 3 }}>{t.help}</div>
        </div>
        {/* The unit sits inside the field at a fixed width, so every field in a group lines up. */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
          <CstNumber
            value={shown} min={t.min} max={t.max} step={t.step} disabled={settling}
            label={t.label + " (" + t.unit + ")"}
            onCommit={(n) => setThreshold(t.key, n)}
            tone={wasRefused ? "refused" : isTuned ? "tuned" : null}
            suffix={wasRefused ? "not used" : t.unit}
            suffixStyle={{ minWidth: 60, color: wasRefused ? CST_AMBER : undefined }}
          />
          {/* ⚠ THE HOUSE DEFAULT IS ALWAYS ON SCREEN, so a coach can see what
              they changed from without a reset being the only way to find out. Quiet at the
              default; the accent, with ↺, once the row is tuned and a tap puts it back. */}
          <button
            type="button" onClick={() => setThreshold(t.key, null)} disabled={settling || (!isTuned && !wasRefused)}
            title={"House default: " + house + " " + t.unit}
            className={"cst-house" + (isTuned || wasRefused ? " is-live" : "")}
          >
            {isTuned || wasRefused ? "↺ " : ""}House {house}
          </button>
        </div>
      </div>
    );
  };
  const flagGroups = cstGrouped(cstFlagGroups(role), tunables, (t) => t.key, { key: "more", label: "More", blurb: "" });

  return (
    <React.Fragment>
      {signedIn === false && <DashDemoBand />}
      <DashPage
        navItems={nav("settings")}
        payoutCard={card}
        eyebrow="OFFICE · SETTINGS"
        title="How your practice reads"
        subtitle="Where your dashboard opens and how it looks, when a client is flagged to you, which notifications reach you, your calendar link and your account. Apart from your time zone, which your open hours follow, nothing here changes what a client sees."
      >
        <div style={{ maxWidth: 1200 }}>
          <div style={{ marginBottom: 16 }}>
            <DashSegmented label="Settings sections" value={active} onChange={setSection}
              items={sections.map((s) => ({ key: s.key, label: s.label }))} />
          </div>

          {panel("general", (
            <div style={CST_GRID}>
              {/* ── where the dashboard opens ─────────────────────────────── */}
              {cstCard(
                <React.Fragment>
                  {cstHead("opens", "Your dashboard opens on")}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
                    {landing.map(([slug, label]) => (
                      <button key={slug} type="button" disabled={settling} onClick={() => setLanding(slug)}
                        style={{ ...cstChip((effective.landingTab || "today") === slug), minHeight: 30, opacity: settling ? 0.45 : 1 }}>{label}</button>
                    ))}
                  </div>
                  <div style={{ marginTop: 12, fontSize: 12, color: CST_INK50, lineHeight: 1.5 }}>
                    Applies when you open the dashboard without a tab in the address — a link
                    straight to a tab still goes there.
                  </div>
                </React.Fragment>
              )}

              {/* ── the example dashboard (owner, 2026-11-09) ─────────────── */}
              {/* A signed-in coach's own pages show their own clients, so with none yet they're empty.
                  The example shows the dashboard with sample clients, in this tab, under its band. */}
              {live && typeof DashExampleLink === "function" && window.ShapeDashExample && !window.ShapeDashExample.on && (
                cstCard(
                  <React.Fragment>
                    {cstHead("example", "The example dashboard")}
                    <div style={{ marginTop: 12, fontSize: 13, color: CST_INK, lineHeight: 1.5 }}>
                      Every page with sample clients on it, so you can see what your dashboard does before your own clients fill it. Nothing you do in the example reaches your account.
                    </div>
                    <div style={{ marginTop: 10, fontSize: 13 }}><DashExampleLink /></div>
                  </React.Fragment>
                )
              )}

              {/* ── the account's time zone (P9) ──────────────────────────── */}
              {/* It drives where the hours editor keeps your open hours and every reader of your
                  listing's zone (the server copies it onto trainers / nutritionists). The control
                  frames itself, so before the migration or signed out there is no empty card. */}
              {ZoneSetting && (
                // The icon tile sits beside the control's own label, as on the other cards.
                <ZoneSetting coach labelClassName="dash-eyebrow" labelStyle={{ paddingLeft: 40, lineHeight: "30px" }}
                  wrap={(body) => cstCard(<div style={{ position: "relative" }}><span style={{ position: "absolute", left: 0, top: 0 }}>{cstIcon("zone")}</span>{body}</div>)} />
              )}

              {/* ── appearance ────────────────────────────────────────────── */}
              {cstCard(
                <React.Fragment>
                  {cstHead("skin", "Appearance")}
                  <div style={{ fontSize: 13, fontWeight: 500, margin: "14px 0 6px" }}>Skin</div>
                  <div style={{ fontSize: 12, color: CST_INK50, lineHeight: 1.5, marginBottom: 12 }}>
                    The dashboard's look. White and Bone are light, the rest dark; Night drops the blue
                    tones for evenings. It follows your account across devices, and the app follows
                    its light or dark.
                  </div>
                  {typeof DashPaperPicker === "function" && <DashPaperPicker value={paperCtl[0]} onChoose={paperCtl[1]} />}
                  {live === false && (
                    <div style={{ marginTop: 10, fontSize: 11.5, color: CST_INK50, lineHeight: 1.5 }}>
                      Signed out the choice stays on this browser; sign in to keep it on your account.
                    </div>
                  )}
                </React.Fragment>
              )}
            </div>
          ))}

          {/* ── the signal engine ─────────────────────────────────────────── */}
          {panel("flags", (
            <div style={{ display: "grid", gap: 16 }}>
              {cstCard(
                <React.Fragment>
                  {cstHead("flag", "Flags · when a client reaches you",
                    cstPill(tunedCount ? tunedCount + " tuned" : "House defaults", tunedCount ? "teal" : null))}
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 10, fontSize: 12, color: storeTone }}>
                    <span className="cst-dot" aria-hidden="true" />{storeLine}
                  </div>
                  {/* What these numbers are, said once at the top (owner, 2026-11-10: "what are these
                      options here"). */}
                  <div style={{ marginTop: 12, fontSize: 13, color: CST_INK, lineHeight: 1.55, maxWidth: 760 }}>
                    Each number decides when a client is flagged to you: in Needs you on Today, on your
                    Clients list, and in your red and amber alerts. One flag makes a client amber. Red takes
                    flags in two different areas (training and contact, say), a yes on the health screening,
                    or check-ins missed for weeks. The House chip shows Shape's default
                    for {role === "nutritionist" ? "nutritionists" : "trainers"}; it lights up once you
                    change a number, and a tap on it puts the default back.
                  </div>
                  <div style={{ marginTop: 8, fontSize: 11.5, color: CST_INK50, lineHeight: 1.5, maxWidth: 760 }}>
                    {/* The line that stops a coach reading these as a way to see more. */}
                    A flag still needs real logged days behind it — these move the line, they never
                    invent evidence. Calories and protein wait for 4 logged days in the week, and a
                    score drop for a week of 30 points or more.
                  </div>
                </React.Fragment>
              )}
              <div style={CST_GRID}>
                {flagGroups.map((g) => {
                  const n = g.rows.filter((t) => effThresholds[t.key] != null && !refused.has(t.key)).length;
                  return (
                    <React.Fragment key={g.key}>
                      {cstCard(
                        <React.Fragment>
                          {cstHead(g.icon, g.label, n ? cstPill(n + " tuned", "teal") : null)}
                          {g.blurb ? <div style={{ marginTop: 10, fontSize: 12.5, color: CST_INK50, lineHeight: 1.45 }}>{g.blurb}</div> : null}
                          <div>{g.rows.map(flagRow)}</div>
                        </React.Fragment>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          ))}

          {/* ── notifications ─────────────────────────────────────────────── */}
          {panel("notifications", (
            // ⚠ KEYED ON THE ACCOUNT. A remount is the whole reload — the card's own
            // read effect keys on `signedIn`, which does not change when one signed-in
            // coach is replaced by another.
            <CoachNotificationCard key={acct || "anon"} signedIn={signedIn} acct={acct} />
          ))}

          {/* ── the calendar feed ─────────────────────────────────────────── */}
          {panel("calendar", (
            // Keyed on the account for the notification card's reason: a link read for one
            // coach must never stay on screen under another's session.
            <CoachCalendarFeedCard key={acct || "anon"} signedIn={signedIn} />
          ))}

          {/* ── the guides: the welcome tour again, and each page's guide ──── */}
          {hasGuides && panel("guides", <CoachGuidesCard />)}

          {/* ── the account: profile details, export and close ──────────── */}
          {hasAccount && panel("account", (
            <CoachAccountSettings key={acct || "anon"} accountId={acct} />
          ))}
        </div>
      </DashPage>
    </React.Fragment>
  );
}

// The coach half of the notification centre — the same tables and RPC the client
// Settings page uses (notification_settings / notification_preferences via
// get_notification_center), over the coach-audience types only. It is a separate
// component rather than a parameter on the client's: that one also owns habit
// reminders, which a coach does not have, and the two type lists come from
// different halves of the registry.
function CoachNotificationCard({ signedIn, acct }) {
  const [state, setState] = React.useState(null); // null = loading
  const [err, setErr] = React.useState("");
  // ⚠ THREE STATES, NOT TWO. `state === null` is still loading; `settings === null`
  // is "the read did not come back" — and they are not the same sentence. A coach
  // whose RPC failed must not be shown a switch panel built from invented defaults,
  // because every control on it would then be a claim about settings nobody read.
  const unreadable = { settings: null, matrix: {} };
  // What the server last CONFIRMED. It is the rollback target and the base a queued
  // write merges its patch into — never a render closure, which carries optimistic
  // paints nothing has accepted yet.
  const confirmedRef = React.useRef({ settings: null, matrix: {} });
  // key → the notice that key's failure raised. ⚠ A SUCCESS CLEARS ONLY ITS OWN.
  // `setErr("")` on any success let a change that saved fine hide the notice belonging
  // to one that did not, and leaving the newest text up let the banner go on
  // describing a failure that had since been retried successfully.
  const failedRef = React.useRef(new Map());
  const genRef = React.useRef(0);

  const load = React.useCallback(async () => {
    const gen = (genRef.current += 1);
    const settle = (v) => {
      if (gen !== genRef.current) return;
      confirmedRef.current = v || { settings: null, matrix: {} };
      setState(v);
      failedRef.current = new Map();
      setErr("");
    };
    // ⚠ NOT SIGNED IN IS NOT UNREADABLE, AND CONFLATING THEM PUT A FALSE NOTICE ON
    // EVERY HEALTHY LOAD. `useSignedIn` resolves asynchronously, so this runs once
    // with signedIn=false on every mount; settling `unreadable` there left
    // `settings: null` behind, and the moment auth resolved the ladder below rendered
    // "Couldn't read your notification settings — reload to try again" at a coach
    // whose settings had not been asked for yet.
    if (!signedIn) { settle(null); return; }
    if (!(window.shapeDb && window.shapeDb.client)) { settle(unreadable); return; }
    settle(null); // a re-read is LOADING, not still the last read's answer
    try {
      // The cookie-session bridge first: getUser()/rpc off a cookie-only session
      // reads as anon otherwise, and the coach is told they are signed out.
      try { if (window.shapeDb.getSession) await window.shapeDb.getSession(); } catch (e) { /* the cookie still carries it */ }
      const c = window.shapeDb.client;
      const { data, error } = await c.rpc("get_notification_center");
      if (error || !data) { settle(unreadable); return; }
      const m = {};
      (Array.isArray(data.prefs) ? data.prefs : []).forEach((p) => { (m[p.type] = m[p.type] || {})[p.channel] = p.enabled; });
      const st = data.settings || {};
      settle({
        settings: {
          muted: st.muted === true,
          quiet_start: Number.isFinite(st.quiet_start) ? st.quiet_start : 22,
          quiet_end: Number.isFinite(st.quiet_end) ? st.quiet_end : 7,
          daily_cap: Number.isFinite(st.daily_cap) ? st.daily_cap : 4,
        },
        matrix: m,
      });
    } catch (e) { settle(unreadable); }
  }, [signedIn]);
  React.useEffect(() => { load(); }, [load]);

  const noteFail = (keys, msg) => { keys.forEach((k) => failedRef.current.set(k, msg)); setErr(msg); };
  const noteOk = (keys) => {
    keys.forEach((k) => failedRef.current.delete(k));
    const rest = Array.from(failedRef.current.values());
    setErr(rest.length ? rest[rest.length - 1] : "");
  };
  // ⚠ A FAILED WRITE IS ROLLED BACK ONTO THE CONFIRMED COPY. Painting optimistically
  // and leaving the paint on a failure is how a coach ends up looking at "Muted" over
  // an unmuted row — the defect useCoachDoc was post-mortemed for on 2026-09-10.
  const failSettings = (before, keys, msg) => { setState((s) => ({ ...s, settings: before })); noteFail(keys, msg); };
  const failMatrix = (before, keys, msg) => { setState((s) => ({ ...s, matrix: before })); noteFail(keys, msg); };

  // ⚠ AND THE WRITE IS BOUND TO THE ACCOUNT THE PANEL WAS OPENED FOR. Resolving the
  // user at click time is what let a switch in another tab upsert A's displayed change
  // under B's id. The click-time id must MATCH the one this card is rendering; an id
  // that does not, or will not resolve, refuses the write rather than guessing.
  const authUid = async (c) => {
    const u = await c.auth.getUser();
    const now = (u && u.data && u.data.user && u.data.user.id) || null;
    if (!now) return null;
    if (acct && now !== acct) return null;
    return now;
  };

  // `patch` is the CHANGE, never the whole row.
  const saveSettings = (patch) => cstSerial(async () => {
    const base = confirmedRef.current;
    if (!base.settings) return;
    const next = { ...base.settings, ...patch };
    const keys = Object.keys(patch);
    const what = cstFieldName(keys);
    // ⚠ A READ THAT SETTLES WHILE THIS IS IN FLIGHT REPLACES confirmedRef, and it is
    // the newer claim: a rollback fired after it would paint a state nobody holds any
    // more, under a notice about a change that is no longer on screen. Identity is the
    // check rather than a counter, because what this write must not clobber is the
    // exact object it derived `before` from.
    const stale = () => confirmedRef.current !== base;
    setState((s) => ({ ...s, settings: next }));
    try {
      const c = window.shapeDb.client;
      const uid = await authUid(c);
      if (stale()) return;
      if (!uid) { failSettings(base.settings, keys, "Couldn't confirm your account — " + what + " wasn't saved."); return; }
      // ⚠ ONLY THE PATCH IS SENT, AND THAT IS THE ROOT FIX RATHER THAN A STYLE CALL.
      // Upserting all four columns from a snapshot taken at page load silently reverts
      // whatever another surface changed since: the mobile app's `saveNotifySettings`
      // and the member panel's own `saveSettings` both send only their patch, and a
      // coach who set quiet hours on their phone had them thrown back to this page's
      // stale copy by an unrelated tap on Mute. The column defaults (false/22/7/4) are
      // byte-for-byte what this panel invents when the row is absent, so a partial
      // upsert that CREATES the row lands exactly what is already on screen.
      // ⚠ `tz` TRAVELS WITH IT. The column defaults to 'UTC' and this panel is the
      // first place a coach ever writes the row, so omitting it evaluated quiet hours
      // in UTC: a coach in Los Angeles setting 22 → 7 was silenced 15:00–00:00 local
      // and pushed at 3 a.m. `inQuietHours` resolves the hour through prefs.tz.
      const { error } = await c.from("notification_settings")
        .upsert({ user_id: uid, ...patch, tz: cstTz(), updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (stale()) return;
      if (error) { failSettings(base.settings, keys, "Couldn't save " + what + " just now."); return; }
      confirmedRef.current = { ...base, settings: next };
      noteOk(keys);
    } catch (e) { if (!stale()) failSettings(base.settings, keys, "Couldn't save " + what + " just now."); }
  });

  const toggle = (type, channel, on) => cstSerial(async () => {
    const base = confirmedRef.current;
    // The same guard as the settings half: an unreadable read leaves `matrix` at `{}`,
    // which is truthy — writing from it would drop every stored override off the
    // mirror and then confirm the emptied copy on the next success.
    if (!base.settings) return;
    const isDefault = on === CST_DEFAULT_CHANNELS[channel];
    // The confirmed copy mirrors what is STORED, so a switch returning to the house
    // default drops its key rather than pinning today's default as an override.
    const row = { ...(base.matrix[type] || {}) };
    if (isDefault) delete row[channel]; else row[channel] = on;
    const next = { ...base.matrix, [type]: row };
    const keys = [type + "\u00b7" + channel];
    const what = cstTypeName(type) + " · " + channel;
    const stale = () => confirmedRef.current !== base;
    setState((s) => ({ ...s, matrix: next }));
    try {
      const c = window.shapeDb.client;
      const uid = await authUid(c);
      if (stale()) return;
      if (!uid) { failMatrix(base.matrix, keys, "Couldn't confirm your account — " + what + " wasn't saved."); return; }
      // ⚠ AN OVERRIDE THAT RETURNS TO THE HOUSE DEFAULT IS DELETED, NOT STORED.
      // notification_preferences holds OVERRIDES only (its migration says so, and the
      // client panel deletes for the same reason): writing today's default freezes it
      // into the coach's data, so a later change to house policy silently exempts
      // every coach who ever touched that switch. The same rule the thresholds above
      // follow — it has to apply to both halves of this panel or to neither.
      const q = isDefault
        ? c.from("notification_preferences").delete().eq("user_id", uid).eq("type", type).eq("channel", channel)
        : c.from("notification_preferences").upsert({ user_id: uid, type, channel, enabled: on }, { onConflict: "user_id,type,channel" });
      const { error } = await q;
      if (stale()) return;
      if (error) { failMatrix(base.matrix, keys, "Couldn't save " + what + " just now."); return; }
      confirmedRef.current = { ...base, matrix: next };
      noteOk(keys);
    } catch (e) { if (!stale()) failMatrix(base.matrix, keys, "Couldn't save " + what + " just now."); }
  });

  // ⚠ THE KNOWN ANSWER IS DECIDED FIRST, AND GETTING THAT ORDER WRONG COST A ROUND.
  // `useSignedIn` starts undefined, so collapsing it to a boolean told every
  // authenticated coach to sign in for the whole auth round trip. Fixing that by
  // testing `signedIn === undefined || state === null` FIRST created the opposite
  // regression: `load()` settles a signed-out visitor's state to null, so they sat on
  // "Loading…" forever and never reached the sign-in card. Signed out is a SETTLED
  // answer — it outranks a null state, which for them is not a load in progress.
  if (signedIn === false) {
    return cstCard(
      <React.Fragment>
        {cstHead("bell", "Notifications")}
        <div style={{ marginTop: 12, fontSize: 12.5, color: CST_INK50 }}>Sign in to set which of your notifications reach you.</div>
      </React.Fragment>
    );
  }
  if (signedIn === undefined || state === null) {
    return cstCard(
      <React.Fragment>
        {cstHead("bell", "Notifications")}
        <div style={{ marginTop: 12, fontSize: 12.5, color: CST_INK50 }}>Loading…</div>
      </React.Fragment>
    );
  }
  if (state.settings === null) {
    return cstCard(
      <React.Fragment>
        {cstHead("bell", "Notifications")}
        <div style={{ marginTop: 12, fontSize: 12.5, color: CST_INK50 }}>
          Couldn't read your notification settings just now. Nothing has changed —
          reload to try again.
        </div>
      </React.Fragment>
    );
  }
  const s = state.settings;
  // ⚠ A DEFAULT-ON TYPE WITH NO STORED ROW IS ON. The gate treats an absent row as
  // the registry's `defaultOn`, so rendering an unset switch as OFF would show a coach
  // a notification disabled that will in fact arrive.
  const isOn = (type, ch) => {
    const row = state.matrix[type];
    return (row && typeof row[ch] === "boolean") ? row[ch] : CST_DEFAULT_CHANNELS[ch];
  };
  // The switches under their headings; a type no heading names still gets its row, under "More".
  const groups = cstGrouped(CST_NOTIFY_GROUPS, CST_COACH_TYPES, (r) => r[0], { key: "more", label: "More" });
  // Two cards: how notifications arrive (mute, quiet hours, the cap), narrow, beside which ones do.
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
      <div style={{ flex: "1 1 280px", minWidth: 0 }}>
        {cstCard(
          <React.Fragment>
            {cstHead("bell", "Notifications · delivery", cstPill(s && s.muted ? "All muted" : "On", s && s.muted ? "amber" : "teal", true))}
            {err ? <div role="alert" style={{ marginTop: 8, fontSize: 11.5, color: CST_AMBER }}>{err}</div> : null}

            <div style={{ marginTop: 14 }}>
              <button type="button" onClick={() => saveSettings({ muted: !s.muted })} style={{ ...cstChip(s.muted), minHeight: 30 }}>
                {s.muted ? "Muted — turn back on" : "Mute everything"}
              </button>
            </div>

            <div style={{ marginTop: 16 }}>
              {cstLabel("Quiet hours")}
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                <CstNumber value={s.quiet_start} min={0} max={23} step={1} label="Quiet hours start" suffix=":00" suffixStyle={CST_HOUR_SUFFIX}
                  onCommit={(n) => saveSettings({ quiet_start: n })} />
                <span style={{ fontFamily: CST_MONO, fontSize: 10.5, color: CST_INK50, padding: "0 2px" }}>to</span>
                <CstNumber value={s.quiet_end} min={0} max={23} step={1} label="Quiet hours end" suffix=":00" suffixStyle={CST_HOUR_SUFFIX}
                  onCommit={(n) => saveSettings({ quiet_end: n })} />
              </div>
              <div style={{ marginTop: 6, fontSize: 11.5, color: CST_INK50, lineHeight: 1.45 }}>Hours on a 24-hour clock, in your time zone.</div>
            </div>

            <div style={{ marginTop: 16 }}>
              {cstLabel("Most per day")}
              <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                {CST_CAPS.map((n) => (
                  <button key={n} type="button" onClick={() => saveSettings({ daily_cap: n })} style={{ ...cstChip(s.daily_cap === n), minHeight: 32, minWidth: 38, padding: "7px 10px" }}>{n}</button>
                ))}
              </div>
            </div>
          </React.Fragment>
        )}
      </div>

      <div style={{ flex: "3 1 460px", minWidth: 0 }}>
        {cstCard(
          <React.Fragment>
            {cstHead("switches", "Notifications · what reaches you")}
            <div style={{ marginTop: 14, overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 380 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "0 8px 8px 0" }}>{cstLabel("What")}</th>
                    {CST_CHANNELS.map(([ch, label]) => (
                      <th key={ch} style={{ padding: "0 8px 8px", width: 70 }}>{cstLabel(label)}</th>
                    ))}
                  </tr>
                </thead>
                {groups.map((g) => (
                  <tbody key={g.key}>
                    <tr style={{ borderTop: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.08)" }}>
                      <th scope="rowgroup" colSpan={1 + CST_CHANNELS.length} style={{ textAlign: "left", padding: "16px 0 4px", fontFamily: CST_MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--sh-accent-ink, #2ee0c4)" }}>
                        {g.label}
                      </th>
                    </tr>
                    {g.rows.map(([type, label, help]) => (
                      <tr key={type} style={{ borderTop: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.08)" }}>
                        <td style={{ padding: "10px 8px 10px 0" }}>
                          <div style={{ fontSize: 13, color: CST_INK }}>{label}</div>
                          <div style={{ fontSize: 11, color: CST_INK50, lineHeight: 1.4, marginTop: 2 }}>{help}</div>
                        </td>
                        {CST_CHANNELS.map(([ch]) => (ch === "email" && !CST_EMAIL_TYPES.includes(type)
                          ? <td key={ch} style={{ padding: "10px 8px" }} aria-hidden="true" />
                          : <td key={ch} style={{ padding: "10px 8px", textAlign: "center" }}>
                            {/* A sliding pill (dash.css .cst-switch); its state is aria-checked. */}
                            <button type="button" role="switch" aria-checked={isOn(type, ch)} aria-label={label + " · " + ch}
                              onClick={() => toggle(type, ch, !isOn(type, ch))} className="cst-switch" />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
            <div style={{ marginTop: 12, fontSize: 11.5, color: CST_INK50, lineHeight: 1.5 }}>
              {/* Said plainly, because the alternative is a coach believing they muted
                  something they did not. */}
              Every notification you get is switched here. Quiet hours hold them until the morning;
              the daily cap applies to the client alerts and friends' habits above.
            </div>
          </React.Fragment>
        )}
      </div>
    </div>
  );
}

// ── The calendar feed (2026-10-07, owner-approved coach-tools plan, Schedule "Connect") ──
// A private link a coach subscribes to from Google, Apple or Outlook, which lists their Shape
// bookings there. GET/POST /api/calendar/feed-token reads and resets it; the feed itself is
// /api/calendar/feed/<token>.ics (src/lib/calendar-feed.ts).
// ⚠ READ-ONLY, AND THE CARD SAYS SO. A subscription is one-way: nothing done in Google comes
// back, and a change in Shape shows up only when the calendar app next fetches the link —
// which the APP decides (Apple honours the hourly hint; Google takes hours, sometimes a day).
// ⚠ THE LINK IS A CREDENTIAL: anyone holding it reads the coach's session times and client
// names. The card says that too, and a reset is the remedy, behind an in-page confirm (no
// `confirm()`, which a browser may suppress and which no test can drive).
const CST_FEED_API = "/api/calendar/feed-token";
const CST_FEED_INTRO = "Subscribe from Google, Apple or Outlook to see your Shape sessions there. Read-only; changes in Shape show up when your calendar app refreshes, usually within a few hours (Google can take up to a day).";

// One request to the link route → the card's next state. Every answer the route gives has a
// state here, so the card never sits on "Loading…" after a reply it did not expect.
async function cstFeedRequest(method) {
  try {
    // The cookie-session bridge first, as the notification card does: the route reads the
    // session from the cookie, and a page that signed in through the client library alone
    // has not written it yet.
    try { if (window.shapeDb && window.shapeDb.getSession) await window.shapeDb.getSession(); } catch (e) { /* the cookie may still carry it */ }
    const res = await fetch(CST_FEED_API, {
      method, credentials: "same-origin", cache: "no-store",
      headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
      body: method === "POST" ? JSON.stringify({ rotate: true }) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (res.ok && data && typeof data.url === "string" && typeof data.webcalUrl === "string") {
      return { kind: "ready", url: data.url, webcalUrl: data.webcalUrl, rotated: data.rotated === true };
    }
    if (res.status === 503 && data && data.code === "feed_not_set_up") return { kind: "notSetUp" };
    if (res.status === 401) return { kind: "signedOut" };
    if (res.status === 402 || res.status === 403) return { kind: "refused", message: (data && data.error) || "Calendar feeds are for coaches." };
    return { kind: "error" };
  } catch (e) {
    return { kind: "error" };
  }
}

// Google Calendar's own "add by URL" entry point takes the webcal:// form in `cid`.
function cstGoogleSubscribeUrl(webcalUrl) {
  return "https://calendar.google.com/calendar/r?cid=" + encodeURIComponent(webcalUrl);
}

function CoachCalendarFeedCard({ signedIn }) {
  const [state, setState] = React.useState({ kind: "loading" });
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState("");
  // ⚠ A REPLY IS ONLY USED IF IT IS THE NEWEST ASK. A load still in flight when a reset lands
  // would otherwise paint the OLD link back over the new one — the link the reset just killed.
  const genRef = React.useRef(0);
  const fieldRef = React.useRef(null);

  React.useEffect(() => {
    if (signedIn !== true) return;
    const gen = (genRef.current += 1);
    setState({ kind: "loading" });
    cstFeedRequest("GET").then((next) => { if (gen === genRef.current) setState(next); });
  }, [signedIn]);

  const retry = () => {
    const gen = (genRef.current += 1);
    setState({ kind: "loading" });
    setNote("");
    cstFeedRequest("GET").then((next) => { if (gen === genRef.current) setState(next); });
  };
  const reset = async () => {
    if (busy) return;
    const gen = (genRef.current += 1);
    setBusy(true);
    setNote("");
    const next = await cstFeedRequest("POST");
    setBusy(false);
    if (gen !== genRef.current) return;
    setConfirming(false);
    // ⚠ A FAILED RESET KEEPS THE LINK ON SCREEN, BECAUSE IT STILL WORKS. Replacing it with an
    // error state would tell the coach their calendar is broken when nothing changed.
    if (next.kind === "ready") { setState(next); setNote("New link ready. Subscribe again with it; the old one has stopped working."); }
    else if (next.kind === "notSetUp" || next.kind === "signedOut" || next.kind === "refused") setState(next);
    else setNote("Couldn't reset your link just now. The current one still works.");
  };
  const copy = async () => {
    if (state.kind !== "ready") return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(state.url); setNote("Copied."); return; }
    } catch (e) { /* fall through to selecting the text */ }
    try {
      const el = fieldRef.current;
      if (el) { el.focus(); el.select(); }
      if (document.execCommand && document.execCommand("copy")) { setNote("Copied."); return; }
    } catch (e) { /* the selection is still there to copy by hand */ }
    setNote("Select the link and copy it.");
  };

  // ⚠ THE LINK IS SHOWN ONLY TO A SIGNED-IN ACCOUNT. A read answered after a sign-out would
  // otherwise leave a credential on screen under the signed-out view.
  const ready = signedIn === true && state.kind === "ready" ? state : null;
  const live = !!ready;
  const field = {
    flex: "1 1 260px", minWidth: 0, minHeight: 34, padding: "6px 11px", borderRadius: 8, boxSizing: "border-box",
    border: "1px solid var(--sh-line2, #413d38)", background: "var(--sh-rest, #221e19)",
    color: live ? CST_INK : CST_INK50, fontFamily: CST_MONO, fontSize: 11.5,
  };
  const linkChip = (on) => ({ ...cstChip(false), minHeight: 30, display: "inline-flex", alignItems: "center", textDecoration: "none", opacity: on ? 1 : 0.45, pointerEvents: on ? "auto" : "none" });

  // The line under the controls: what this account can do with the card right now.
  const status = signedIn === undefined ? "Loading…"
    : signedIn === false ? "Sign in as a coach to get your private calendar link."
    : state.kind === "loading" ? "Loading your link…"
    : state.kind === "notSetUp" ? "Calendar feed isn't set up yet. Nothing to do on your side; it switches on once it's installed."
    : state.kind === "signedOut" ? "Sign in again to see your calendar link."
    : state.kind === "refused" ? state.message
    : state.kind === "error" ? "Couldn't load your calendar link just now."
    : "";

  return cstCard(
    <React.Fragment>
      {cstHead("calendar", "Calendar feed · read-only", cstPill(live ? "Link ready" : "Off", live ? "teal" : null, live))}
      <div style={{ marginTop: 12, fontSize: 12.5, color: CST_INK50, lineHeight: 1.5, maxWidth: 720 }}>{CST_FEED_INTRO}</div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12, alignItems: "center" }}>
        <input
          ref={fieldRef} type="text" readOnly aria-label="Your calendar feed link"
          value={ready ? ready.url : ""} placeholder={signedIn === false ? "Sign in to get your link" : "—"}
          disabled={!live} onFocus={(e) => { try { e.currentTarget.select(); } catch (err) {} }}
          style={field}
        />
        <button type="button" onClick={copy} disabled={!live} style={{ ...cstChip(false), minHeight: 30, opacity: live ? 1 : 0.45 }}>Copy</button>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
        <a href={ready ? ready.webcalUrl : undefined} aria-disabled={!live} style={linkChip(live)}>Add to calendar</a>
        <a href={ready ? cstGoogleSubscribeUrl(ready.webcalUrl) : undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!live} style={linkChip(live)}>Google Calendar ↗</a>
        {/* Set apart from the two ways in: it breaks every calendar already subscribed. */}
        <button type="button" onClick={() => { setConfirming(true); setNote(""); }} disabled={!live || confirming}
          style={{ ...cstChip(false), minHeight: 30, marginLeft: "auto", opacity: live && !confirming ? 1 : 0.45 }}>Reset link</button>
      </div>

      {confirming && live && (
        <div role="alertdialog" aria-label="Reset your calendar link" style={{ marginTop: 12, padding: "12px 14px", borderRadius: 4, border: "1px solid " + CST_AMBER, background: "rgba(var(--sh-gold-rgb, 216,162,58),0.08)" }}>
          <div style={{ fontSize: 12.5, color: CST_INK, lineHeight: 1.5 }}>
            Reset your link? Calendars subscribed to the current one stop updating, and you'll
            subscribe again with the new link.
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button type="button" onClick={reset} disabled={busy} style={{ ...cstChip(false), minHeight: 30, border: "1px solid " + CST_AMBER, color: CST_AMBER }}>{busy ? "Resetting…" : "Reset link"}</button>
            <button type="button" onClick={() => setConfirming(false)} disabled={busy} style={{ ...cstChip(false), minHeight: 30 }}>Keep it</button>
          </div>
        </div>
      )}

      {status ? (
        <div style={{ marginTop: 10, fontSize: 11.5, color: state.kind === "notSetUp" || state.kind === "error" ? CST_AMBER : CST_INK50, lineHeight: 1.5 }}>
          {status}
          {signedIn === true && state.kind === "error" ? <button type="button" onClick={retry} style={{ ...cstChip(false), minHeight: 26, marginLeft: 8 }}>Retry</button> : null}
        </div>
      ) : null}
      {note ? <div role="status" style={{ marginTop: 8, fontSize: 11.5, color: CST_TEAL }}>{note}</div> : null}
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--sh-line, #302c27)", fontSize: 11.5, color: CST_INK50, lineHeight: 1.5 }}>
        <svg aria-hidden width="11" height="13" viewBox="0 0 11 13" style={{ flex: "none", marginTop: 2 }}>
          <rect x="1" y="5.5" width="9" height="6.75" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <path d="M3 5.5V3.75a2.5 2.5 0 0 1 5 0V5.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
        <span>
          Anyone with this link can see your session times, your clients' names and what they
          booked about. Keep it to yourself, and reset it if it's shared by mistake.
        </span>
      </div>
    </React.Fragment>
  );
}

// Which tab the shell should open on when the address carries none. Returns null
// for every case that is not a positive answer — signed out, unreadable, nothing
// chosen, a slug this shell does not have.
// ⚠ THE CALLER RE-CHECKS THE HASH BEFORE USING IT. This is an async read, and a
// coach who has already clicked a tab in the meantime must not be yanked back.
async function cstResolveLandingTab(isKnownSlug) {
  try {
    // Through the shared read, so the shell's boot resolve, the dashboard hook and
    // this panel share one round trip rather than each making their own.
    const doc = await dashReadCoachSettings();
    const slug = doc && typeof doc.landingTab === "string" ? doc.landingTab : null;
    if (!slug || slug === "today") return null;
    return (typeof isKnownSlug === "function" && isKnownSlug(slug)) ? slug : null;
  } catch (e) { return null; }
}

Object.assign(window, { CoachSettingsPage, CoachNotificationCard, CoachCalendarFeedCard, CstNumber, cstLandingOptions, cstResolveLandingTab, CST_COACH_TYPES, CST_REGISTRY_COACH_TYPES, CST_DEFAULT_CHANNELS });
