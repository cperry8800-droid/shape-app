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
const CST_INK = "#f2ede4";
const CST_INK50 = "rgba(242,237,228,0.55)";
const CST_TEAL = "#2ee0c4";
const CST_AMBER = "#d8a23a";

const CST_CHANNELS = [["inapp", "App"], ["push", "Push"], ["email", "Email"]];
// ⚠ THE GATE'S OWN DEFAULTS, AND EMAIL IS OFF. `defaultChannels()` in
// src/lib/ai/notifications.mjs returns { inapp:true, push:true, email:false }, and
// `channelsForType` uses it for any channel with no stored override. Rendering an
// unset switch as ON for all three showed a coach Email ✓ in teal on "Client went
// red" while no email is ever sent — and their first tap then computed !true and
// saved an explicit `email:false`, so turning it on actually took two taps.
const CST_DEFAULT_CHANNELS = { inapp: true, push: true, email: false };
const CST_CAPS = [2, 3, 4, 6, 8];

// ⚠ THE COACH'S NOTIFICATION TYPES ARE DERIVED, NOT LISTED. src/lib/ai/notifications.mjs
// marks every type with an `audience`, and the delivery gate gives a type no channel
// when the coach has turned all three off. Hand-listing them here would drift from
// that registry the first time a type is added — and, worse, would invite listing a
// type the matrix cannot actually govern.
//
// ⚠ AND TWO NOTIFICATIONS A COACH REALLY RECEIVES ARE DELIBERATELY ABSENT.
// `credential_expiry` (cron) and `payment` (the Stripe webhook) reach coaches through
// `createNotification`, which does NOT consult notification_preferences — only
// `createPreferredNotification` and the AI notify layer do. A switch for those would
// be a switch that changes nothing, so they are not offered and the card says which
// notifications it governs.
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

function cstCard(children, extra) {
  return (
    <div className="dash-plate dash-plate--tick dash-plate--bracket" style={{ "--dac": CST_TEAL, paddingLeft: 24, ...(extra || {}) }}>
      {children}
    </div>
  );
}
function cstChip(on) {
  return { fontFamily: CST_MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", padding: "7px 12px", borderRadius: 4, border: "1px solid " + (on ? CST_TEAL : "rgba(242,237,228,0.18)"), background: on ? "rgba(46,224,196,0.10)" : "transparent", color: on ? CST_TEAL : "rgba(242,237,228,0.75)", cursor: "pointer" };
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
function CstNumber({ value, min, max, step, label, disabled, onCommit }) {
  const [draft, setDraft] = React.useState(String(value));
  // The stored value wins whenever it changes underneath us (another device, a reset).
  React.useEffect(() => { setDraft(String(value)); }, [value]);
  const commit = () => {
    const t = draft.trim();
    const n = t === "" ? NaN : Number(t);
    if (!Number.isFinite(n) || n < min || n > max) { setDraft(String(value)); return; }
    if (n !== value) onCommit(n);
  };
  return (
    <input
      type="number" min={min} max={max} step={step} value={draft} aria-label={label} disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
      style={{ width: 74, minHeight: 30, padding: "5px 8px", borderRadius: 4, border: "1px solid rgba(242,237,228,0.18)", background: "transparent", color: CST_INK, fontFamily: CST_MONO, fontSize: 12.5, opacity: disabled ? 0.45 : 1 }}
    />
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
function cstTz() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch (e) { return "UTC"; } }
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
  // roster and the dashboard and then issues one /shared-overview per roster member —
  // so opening Settings on a 100-client practice cost about a hundred API calls to
  // edit a number. `useCoachThresholds` is literally the hook `useDashboard` uses for
  // `tuning`, so this is the same value with none of the fan-out.
  const tuning = useCoachThresholds(role);
  // ⚠ PERSISTENCE KEYS ON AUTHENTICATION, NOT ON THE ROSTER. The roster's `source` is
  // about DATA: null while its request is in flight, "demo" when that request FAILS.
  // Keying on it meant a roster outage made every edit tab-only and told a signed-in
  // coach to sign in while the settings backend was healthy. It decided the DEMO BAND
  // too — and on a page that renders no roster data, the honest band is simply whether
  // this is someone's own account.
  const signedIn = useSignedIn();
  const live = signedIn === true;
  const store = useCoachDoc("coach_settings", live);
  const doc = store.doc || {};
  // Every tunable, for every role: see the note on TUNABLES — the engine routes flags
  // by ownership rather than evaluating a different rule set, so a threshold hidden
  // from a role still moved what that role saw.
  const tunables = DashSignals.TUNABLES || [];
  const landing = cstLandingOptions(role);
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

  return (
    <React.Fragment>
      {signedIn === false && <DashDemoBand />}
      <DashPage
        navItems={nav("settings")}
        payoutCard={card}
        eyebrow="OFFICE · SETTINGS"
        title="How your practice reads"
        subtitle="The thresholds that decide when a client is flagged to you, where your dashboard opens, and which of your own notifications reach you. Nothing here changes what a client sees."
      >
        {/* ── the signal engine ───────────────────────────────────────────── */}
        {cstCard(
          <React.Fragment>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
              <span className="dash-eyebrow">Flags · when a client reaches you</span>
              <span style={{ marginLeft: "auto", fontFamily: CST_MONO, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: tunedCount ? CST_TEAL : CST_INK50 }}>
                {tunedCount ? tunedCount + " tuned" : "House defaults"}
              </span>
            </div>
            <div style={{ fontFamily: CST_MONO, fontSize: 9.5, color: CST_INK50, marginTop: 6 }}>{storeLine}</div>
            <div style={{ marginTop: 14 }}>
              {tunables.map((t) => {
                const val = effThresholds[t.key];
                const wasRefused = refused.has(t.key);
                // A stored value the engine refused is NOT a tuning — the roster runs
                // on the house default, so the row must say so rather than showing the
                // refused number in teal as if it were live.
                const isTuned = val != null && !wasRefused;
                const shown = isTuned ? val : DashSignals.DEFAULT_THRESHOLDS[t.key];
                return (
                  <div key={t.key} style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap", paddingTop: 12, marginTop: 12, borderTop: "1px solid rgba(242,237,228,0.08)" }}>
                    <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, color: CST_INK }}>{t.label}</div>
                      <div style={{ fontSize: 11.5, color: CST_INK50, lineHeight: 1.45, marginTop: 3 }}>{t.help}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
                      <CstNumber
                        value={shown} min={t.min} max={t.max} step={t.step} disabled={settling}
                        label={t.label + " (" + t.unit + ")"}
                        onCommit={(n) => setThreshold(t.key, n)}
                      />
                      <span style={{ fontFamily: CST_MONO, fontSize: 9.5, color: wasRefused ? CST_AMBER : CST_INK50, minWidth: 34 }}>
                        {wasRefused ? "not used" : t.unit}
                      </span>
                      {/* ⚠ THE HOUSE DEFAULT IS ALWAYS ON SCREEN, so a coach can see what
                          they changed from without a reset being the only way to find out. */}
                      <button
                        type="button" onClick={() => setThreshold(t.key, null)} disabled={settling || (!isTuned && !wasRefused)}
                        title={"House default: " + DashSignals.DEFAULT_THRESHOLDS[t.key] + " " + t.unit}
                        style={{ ...cstChip(false), minHeight: 30, opacity: isTuned ? 1 : 0.4, cursor: isTuned ? "pointer" : "default" }}
                      >
                        House {DashSignals.DEFAULT_THRESHOLDS[t.key]}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 14, fontSize: 11.5, color: CST_INK50, lineHeight: 1.5 }}>
              {/* The line that stops a coach reading these as a way to see more. */}
              A flag still needs real logged days behind it — these move the line, they never
              invent evidence. A client who logs nothing is never flagged for logging nothing.
            </div>
          </React.Fragment>
        )}

        {/* ── where the dashboard opens ───────────────────────────────────── */}
        <div style={{ marginTop: 16 }}>
          {cstCard(
            <React.Fragment>
              <span className="dash-eyebrow">Your dashboard opens on</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                {landing.map(([slug, label]) => (
                  <button key={slug} type="button" disabled={settling} onClick={() => setLanding(slug)}
                    style={{ ...cstChip((effective.landingTab || "today") === slug), minHeight: 30, opacity: settling ? 0.45 : 1 }}>{label}</button>
                ))}
              </div>
              <div style={{ marginTop: 10, fontSize: 11.5, color: CST_INK50, lineHeight: 1.5 }}>
                Applies when you open the dashboard without a tab in the address — a link
                straight to a tab still goes there.
              </div>
            </React.Fragment>
          )}
        </div>

        {/* ── notifications ───────────────────────────────────────────────── */}
        <div style={{ marginTop: 16 }}>
          <CoachNotificationCard signedIn={signedIn} />
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
function CoachNotificationCard({ signedIn }) {
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

  const authUid = async (c) => {
    const u = await c.auth.getUser();
    return (u && u.data && u.data.user && u.data.user.id) || null;
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
        <span className="dash-eyebrow">Notifications</span>
        <div style={{ marginTop: 10, fontSize: 12.5, color: CST_INK50 }}>Sign in to set which of your notifications reach you.</div>
      </React.Fragment>
    );
  }
  if (signedIn === undefined || state === null) {
    return cstCard(
      <React.Fragment>
        <span className="dash-eyebrow">Notifications</span>
        <div style={{ marginTop: 10, fontSize: 12.5, color: CST_INK50 }}>Loading…</div>
      </React.Fragment>
    );
  }
  if (state.settings === null) {
    return cstCard(
      <React.Fragment>
        <span className="dash-eyebrow">Notifications</span>
        <div style={{ marginTop: 10, fontSize: 12.5, color: CST_INK50 }}>
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
  return cstCard(
    <React.Fragment>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <span className="dash-eyebrow">Notifications · your own</span>
        <span style={{ marginLeft: "auto", fontFamily: CST_MONO, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: s && s.muted ? CST_AMBER : CST_INK50 }}>
          {s && s.muted ? "All muted" : "On"}
        </span>
      </div>
      {err ? <div style={{ marginTop: 8, fontSize: 11.5, color: CST_AMBER }}>{err}</div> : null}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
        <button type="button" onClick={() => saveSettings({ muted: !s.muted })} style={{ ...cstChip(s.muted), minHeight: 30 }}>
          {s.muted ? "Muted — turn back on" : "Mute everything"}
        </button>
      </div>

      <div style={{ marginTop: 14, display: "flex", gap: 18, flexWrap: "wrap" }}>
        <div>
          {cstLabel("Quiet hours")}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
            <CstNumber value={s.quiet_start} min={0} max={23} step={1} label="Quiet hours start"
              onCommit={(n) => saveSettings({ quiet_start: n })} />
            <span style={{ fontFamily: CST_MONO, fontSize: 10, color: CST_INK50 }}>to</span>
            <CstNumber value={s.quiet_end} min={0} max={23} step={1} label="Quiet hours end"
              onCommit={(n) => saveSettings({ quiet_end: n })} />
          </div>
        </div>
        <div>
          {cstLabel("Most per day")}
          <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
            {CST_CAPS.map((n) => (
              <button key={n} type="button" onClick={() => saveSettings({ daily_cap: n })} style={{ ...cstChip(s.daily_cap === n), minHeight: 30, padding: "7px 10px" }}>{n}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 16, overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 380 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "0 8px 8px 0" }}>{cstLabel("What")}</th>
              {CST_CHANNELS.map(([ch, label]) => (
                <th key={ch} style={{ padding: "0 8px 8px", width: 70 }}>{cstLabel(label)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CST_COACH_TYPES.map(([type, label, help]) => (
              <tr key={type} style={{ borderTop: "1px solid rgba(242,237,228,0.08)" }}>
                <td style={{ padding: "10px 8px 10px 0" }}>
                  <div style={{ fontSize: 13, color: CST_INK }}>{label}</div>
                  <div style={{ fontSize: 11, color: CST_INK50, lineHeight: 1.4, marginTop: 2 }}>{help}</div>
                </td>
                {CST_CHANNELS.map(([ch]) => (
                  <td key={ch} style={{ padding: "10px 8px", textAlign: "center" }}>
                    <button type="button" role="switch" aria-checked={isOn(type, ch)} aria-label={label + " · " + ch}
                      onClick={() => toggle(type, ch, !isOn(type, ch))}
                      style={{ width: 34, minHeight: 24, borderRadius: 4, cursor: "pointer", border: "1px solid " + (isOn(type, ch) ? CST_TEAL : "rgba(242,237,228,0.18)"), background: isOn(type, ch) ? "rgba(46,224,196,0.14)" : "transparent", color: isOn(type, ch) ? CST_TEAL : CST_INK50, fontFamily: CST_MONO, fontSize: 11 }}>
                      {isOn(type, ch) ? "✓" : "×"}
                    </button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 12, fontSize: 11.5, color: CST_INK50, lineHeight: 1.5 }}>
        {/* Said plainly, because the alternative is a coach believing they muted
            something they did not. */}
        These are the notifications this panel governs. Credential-expiry and payment
        alerts are sent outside the preference matrix and arrive whatever is set here.
        {" "}Quiet hours and the daily cap apply to the client alerts above;
        waiting-list requests are delivered as they happen.
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

Object.assign(window, { CoachSettingsPage, CoachNotificationCard, CstNumber, cstLandingOptions, cstResolveLandingTab, CST_COACH_TYPES, CST_REGISTRY_COACH_TYPES, CST_DEFAULT_CHANNELS });
