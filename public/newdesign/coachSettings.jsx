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
  ["checkin_submitted", "Check-in filed", "A client submitted their weekly check-in"],
];

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
  // ⚠ `source` AND `tuning` COME FROM THE ONE HOOK THE SHELL ALREADY DRIVES. This page
  // renders none of the roster, but useDashboard is where "is this a live account" and
  // "what did the engine make of the stored overrides" are already resolved — and
  // `tuning.refused` is the half this panel cannot do without (below).
  const { source, tuning } = useDashboard(role);
  const live = source === "live";
  const store = useCoachDoc("coach_settings", live);
  const doc = store.doc || {};
  const tunables = (DashSignals.TUNABLES || []).filter((t) => !t.role || t.role === role);
  const landing = cstLandingOptions(role);
  const [localDemo, setLocalDemo] = React.useState(null); // preview edits — this tab only
  // ⚠ "READY OR ERROR" IS NOT THE SAME QUESTION AS "MAY I EDIT". An edit made while
  // the document is still loading used to land in `localDemo`, paint, count as tuned,
  // and then be thrown away the moment the read resolved and `effective` switched to
  // `doc` — with the header meanwhile claiming "Preview — changes stay on this tab",
  // which was false in both halves. dashWeek was fixed for exactly this on 2026-09-09.
  // The controls are disabled until the store has an answer.
  const settling = live && store.kind === "loading";
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
  const storeLine = !live && source === null ? "Loading…"
    : !live ? "Preview — changes stay on this tab"
    : store.kind === "loading" ? "Loading your settings…"
    : store.kind === "error" ? "Couldn't save — your last change didn't stick, try again"
    : store.kind === "signedout" || store.kind === "unavailable" ? "Couldn't read your settings just now — changes won't be kept"
    : "Saved to your account";
  const tunedCount = tunables.filter((t) => effThresholds[t.key] != null).length;

  return (
    <React.Fragment>
      {source === "demo" && <DashDemoBand />}
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
          <CoachNotificationCard signedIn={live} />
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

  const load = React.useCallback(async () => {
    if (!signedIn || !(window.shapeDb && window.shapeDb.client)) { setState(unreadable); return; }
    try {
      // The cookie-session bridge first: getUser()/rpc off a cookie-only session
      // reads as anon otherwise, and the coach is told they are signed out.
      try { if (window.shapeDb.getSession) await window.shapeDb.getSession(); } catch (e) { /* the cookie still carries it */ }
      const c = window.shapeDb.client;
      const { data, error } = await c.rpc("get_notification_center");
      if (error || !data) { setState(unreadable); return; }
      const m = {};
      (Array.isArray(data.prefs) ? data.prefs : []).forEach((p) => { (m[p.type] = m[p.type] || {})[p.channel] = p.enabled; });
      const s = data.settings || {};
      setState({
        settings: {
          muted: s.muted === true,
          quiet_start: Number.isFinite(s.quiet_start) ? s.quiet_start : 22,
          quiet_end: Number.isFinite(s.quiet_end) ? s.quiet_end : 7,
          daily_cap: Number.isFinite(s.daily_cap) ? s.daily_cap : 4,
        },
        matrix: m,
      });
    } catch (e) { setState(unreadable); }
  }, [signedIn]);
  React.useEffect(() => { load(); }, [load]);

  // ⚠ A FAILED WRITE IS ROLLED BACK, AND A LATER SUCCESS DOES NOT HIDE IT. Painting
  // optimistically and leaving the paint on a failure is how a coach ends up looking
  // at "Muted" over an unmuted row — and clearing the error on the NEXT successful
  // write then claims saving is healthy while the failed change is still on screen.
  // This is the defect useCoachDoc was post-mortemed for on 2026-09-10, one file over.
  const failSettings = (before, msg) => { setState((s) => ({ ...s, settings: before })); setErr(msg); };
  const failMatrix = (before, msg) => { setState((s) => ({ ...s, matrix: before })); setErr(msg); };
  const saveSettings = async (next) => {
    const before = state.settings;
    setState((s) => ({ ...s, settings: next }));
    try {
      const c = window.shapeDb.client;
      const u = await c.auth.getUser();
      const uid = u && u.data && u.data.user && u.data.user.id;
      if (!uid) { failSettings(before, "Couldn't confirm your account — nothing was saved."); return; }
      // ⚠ `tz` TRAVELS WITH IT. The column defaults to 'UTC' and this panel is the
      // first place a coach ever writes the row, so omitting it evaluated quiet hours
      // in UTC: a coach in Los Angeles setting 22 → 7 was silenced 15:00–00:00 local
      // and pushed at 3 a.m. `inQuietHours` resolves the hour through prefs.tz.
      const { error } = await c.from("notification_settings")
        .upsert({ user_id: uid, ...next, tz: cstTz(), updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (error) { failSettings(before, "Couldn't save that just now."); return; }
      setErr("");
    } catch (e) { failSettings(before, "Couldn't save that just now."); }
  };
  const toggle = async (type, channel, on) => {
    const before = state.matrix;
    setState((s) => ({ ...s, matrix: { ...s.matrix, [type]: { ...(s.matrix[type] || {}), [channel]: on } } }));
    try {
      const c = window.shapeDb.client;
      const u = await c.auth.getUser();
      const uid = u && u.data && u.data.user && u.data.user.id;
      if (!uid) { failMatrix(before, "Couldn't confirm your account — nothing was saved."); return; }
      // ⚠ AN OVERRIDE THAT RETURNS TO THE HOUSE DEFAULT IS DELETED, NOT STORED.
      // notification_preferences holds OVERRIDES only (its migration says so, and the
      // client panel deletes for the same reason): writing today's default freezes it
      // into the coach's data, so a later change to house policy silently exempts
      // every coach who ever touched that switch. The same rule the thresholds above
      // follow — it has to apply to both halves of this panel or to neither.
      const q = on === CST_DEFAULT_CHANNELS[channel]
        ? c.from("notification_preferences").delete().eq("user_id", uid).eq("type", type).eq("channel", channel)
        : c.from("notification_preferences").upsert({ user_id: uid, type, channel, enabled: on }, { onConflict: "user_id,type,channel" });
      const { error } = await q;
      if (error) { failMatrix(before, "Couldn't save that just now."); return; }
      setErr("");
    } catch (e) { failMatrix(before, "Couldn't save that just now."); }
  };

  if (!signedIn) {
    return cstCard(
      <React.Fragment>
        <span className="dash-eyebrow">Notifications</span>
        <div style={{ marginTop: 10, fontSize: 12.5, color: CST_INK50 }}>Sign in to set which of your notifications reach you.</div>
      </React.Fragment>
    );
  }
  if (state === null) {
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
        <button type="button" onClick={() => saveSettings({ ...s, muted: !s.muted })} style={{ ...cstChip(s.muted), minHeight: 30 }}>
          {s.muted ? "Muted — turn back on" : "Mute everything"}
        </button>
      </div>

      <div style={{ marginTop: 14, display: "flex", gap: 18, flexWrap: "wrap" }}>
        <div>
          {cstLabel("Quiet hours")}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
            <CstNumber value={s.quiet_start} min={0} max={23} step={1} label="Quiet hours start"
              onCommit={(n) => saveSettings({ ...s, quiet_start: n })} />
            <span style={{ fontFamily: CST_MONO, fontSize: 10, color: CST_INK50 }}>to</span>
            <CstNumber value={s.quiet_end} min={0} max={23} step={1} label="Quiet hours end"
              onCommit={(n) => saveSettings({ ...s, quiet_end: n })} />
          </div>
        </div>
        <div>
          {cstLabel("Most per day")}
          <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
            {CST_CAPS.map((n) => (
              <button key={n} type="button" onClick={() => saveSettings({ ...s, daily_cap: n })} style={{ ...cstChip(s.daily_cap === n), minHeight: 30, padding: "7px 10px" }}>{n}</button>
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
        alerts are sent outside it and arrive whatever is set here.
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

Object.assign(window, { CoachSettingsPage, CoachNotificationCard, CstNumber, cstLandingOptions, cstResolveLandingTab, CST_COACH_TYPES, CST_DEFAULT_CHANNELS });
