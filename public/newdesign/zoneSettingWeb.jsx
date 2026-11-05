// zoneSettingWeb.jsx: the account's time zone on the website (P9, owner 2026-11-05: "all time
// zones should be set by user", and times from another person "should automatically update to
// their own timezone").
//
// One store, three uses:
//   · THE SYNC. Once per page load, for a signed-in viewer: GET /api/me/timezone, then tell
//     shapeZone.mjs (window.ShapeZone) the account's zone with setAccountZone. An account with
//     none takes this device's zone as its first default, written `onlyIfUnset`, and the zone the
//     server answers is the one adopted: a zone the app set a moment ago stands.
//   · THE TRAVEL CARD, mounted on its own root by this file. A device on another clock ASKS
//     (travelAsk); nothing here switches by itself. "Keep" is remembered for that device zone
//     (declineDeviceZone); the × is "not now", for this page only.
//   · THE SETTINGS CONTROL, window.ShapeZoneSetting, on the member's Settings
//     (clientMeSettings.jsx) and the coach's (coachSettings.jsx).
//
// ⚠ BEFORE THE MIGRATION RUNS (`ready: false`) NOTHING SHOWS AND NOTHING IS WRITTEN: no picker, no
// card, no first default, and the zone shapeZone.mjs remembers is left as it was.
// ⚠ A FAILED READ IS NOT "NO ZONE". It shows "Couldn't read your time zone" and a Retry, never a
// picker over a value nobody read, and it writes no first default over a zone that may be set.
// ⚠ A SAVE WHOSE OUTCOME IS UNKNOWN IS READ BACK, NOT GUESSED. The route reads the row back after
// writing, so a 500 can follow a write that landed, and a dropped connection says nothing at all;
// both ask the server what is stored. A 400 or 503 is a refusal, and the old zone stands.
// ⚠ window.ShapeZone IS A MODULE SCRIPT and may evaluate after this file, so it is read at call
// time, waited for briefly, and without it nothing shows.
// ⚠ A COACH'S OPEN HOURS ARE WALL-CLOCK MINUTES IN THE ACCOUNT'S ZONE, so a new zone keeps 9 to 5
// at 9 to 5 on the new clock; booked sessions are instants and do not move. Coaches are told so
// wherever they can change the zone.
//
// English only: the website has no translation layer.

const ZSW_API = "/api/me/timezone";
const ZSW_COACH_ROLES = ["trainer", "nutritionist"];
const ZSW_INK = "var(--sh-ink, #f2ede4)";
const ZSW_INK2 = "var(--sh-ink2, #a09b94)";
const ZSW_ACCENT = "var(--sh-accent, #2ee0c4)";
const ZSW_DANGER = "var(--sh-danger, #e07856)";
const ZSW_CARD = "var(--sh-card, #25211d)";
const ZSW_LINE = "var(--sh-line, #302c27)";
const ZSW_MONO = "var(--sh-font-mono, 'JetBrains Mono', 'JetBrains Mono Fallback', monospace)";
const ZSW_HOURS_LINE = "Your open hours stay at the same times on the new clock: 9 to 5 stays 9 to 5. Sessions already booked don't move.";

function zswLibNow() {
  try { return (typeof window !== "undefined" && window.ShapeZone) || null; } catch (e) { return null; }
}

// What the store reaches for, read at call time so a test (or a late script) can stand in.
function zswDefaultDeps() {
  return {
    fetch: (url, init) => window.fetch(url, init),
    lib: zswLibNow,
    // The dashboard shells share one /api/me reading (portalSession.js); ClientMe.html has none.
    readMe: () => {
      const ps = window.ShapePortalSession;
      if (ps && typeof ps.read === "function") return ps.read();
      return window.fetch("/api/me", { credentials: "same-origin", cache: "no-store" }).then((r) => (r.ok ? r.json() : null));
    },
    onAuthChange: (fn) => {
      try {
        const auth = window.shapeDb && window.shapeDb.client && window.shapeDb.client.auth;
        if (auth && typeof auth.onAuthStateChange === "function") auth.onAuthStateChange(fn);
      } catch (e) { /* no subscription: the next page load reads the account again */ }
    },
    wait: (ms) => new Promise((r) => setTimeout(r, ms)),
    libWaitMs: 10000,
  };
}

function zswSameAsk(a, b) {
  return (!a && !b) || (!!a && !!b && a.account === b.account && a.device === b.device);
}

/**
 * The account-zone store. State: { phase, uid, coach, zone, save, ask, notice, retrying }.
 *   phase: idle | reading | signedout | off (pre-migration, or no shapeZone.mjs) | unreadable | ready
 *   save:  null | { kind: saving | saved | failed, via: settings | travel, zone, reason }
 *   ask:   null | { account, device }, the travel question to put
 *   notice: null | { kind: switched | unconfirmed, zone }, the travel card's after-word
 */
function zswCreateStore(overrides) {
  const deps = Object.assign(zswDefaultDeps(), overrides || {});
  const subs = new Set();
  let state = { phase: "idle", uid: null, coach: false, zone: null, save: null, ask: null, notice: null, retrying: false };
  let gen = 0;
  let started = null;
  let authed = false;
  let notNow = false;

  function askOf(s) {
    if (s.phase !== "ready" || !s.zone || notNow) return null;
    const Z = deps.lib();
    if (!Z) return null;
    let device = null;
    try { device = Z.deviceZone(); } catch (e) { device = null; }
    try {
      if (!Z.travelAsk({ account: s.zone, device, declined: Z.declinedZone() })) return null;
    } catch (e) { return null; }
    return { account: s.zone, device };
  }
  function set(patch) {
    const next = Object.assign({}, state, patch);
    const ask = askOf(next);
    next.ask = zswSameAsk(ask, state.ask) ? state.ask : ask;
    state = next;
    subs.forEach((fn) => { try { fn(); } catch (e) {} });
  }

  async function call(method, body) {
    try {
      const init = { method, credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } };
      if (body !== undefined) { init.headers["Content-Type"] = "application/json"; init.body = JSON.stringify(body); }
      const res = await deps.fetch(ZSW_API, init);
      let data = null;
      try { data = await res.json(); } catch (e) { data = null; }
      return { status: Number(res && res.status) || 0, ok: !!(res && res.ok), data };
    } catch (e) {
      return { status: 0, ok: false, data: null };
    }
  }

  // signedout | off | unreadable | { kind: "zone", zone: string | null }
  async function readZone() {
    const r = await call("GET");
    if (r.status === 401) return { kind: "signedout" };
    if (!r.ok || !r.data || typeof r.data.ready !== "boolean") return { kind: "unreadable" };
    if (r.data.ready === false) return { kind: "off" };
    const tz = r.data.timezone;
    if (tz !== null && tz !== undefined && typeof tz !== "string") return { kind: "unreadable" };
    return { kind: "zone", zone: tz ? String(tz).trim() || null : null };
  }

  async function whenLib() {
    let Z = deps.lib();
    const until = Date.now() + (deps.libWaitMs || 0);
    while (!Z && Date.now() < until) { await deps.wait(50); Z = deps.lib(); }
    return Z;
  }

  function connectAuth() {
    if (authed) return;
    authed = true;
    // ⚠ READ AGAIN, NEVER ASSUME. A SIGNED_OUT from the browser SDK is not proof the cookie session
    // ended (the website's SDK session can lag the cookie), so it is a reason to ask /api/me again;
    // a SIGNED_IN only counts when it is somebody else. portalSession.js clears its cache on the
    // same events; the read waits a tick so that clear lands first.
    deps.onAuthChange((event, session) => {
      const uid = session && session.user && session.user.id ? String(session.user.id) : null;
      if (event === "SIGNED_OUT" || (event === "SIGNED_IN" && uid && state.uid && uid !== state.uid)) {
        setTimeout(() => { restart(false); }, 0);
      }
    });
  }

  async function run(retrying) {
    const my = ++gen;
    connectAuth();
    set({ phase: "reading", save: null, notice: null, retrying: !!retrying });
    let me = null;
    try { me = await deps.readMe(); } catch (e) { me = null; }
    if (my !== gen) return;
    // { user: null } is a reading that nobody is signed in; null is no reading at all, and the
    // zone route's own 401 then decides.
    if (me && Object.prototype.hasOwnProperty.call(me, "user") && !me.user) {
      set({ phase: "signedout", uid: null, coach: false, zone: null, retrying: false });
      return;
    }
    const user = me && me.user ? me.user : null;
    const uid = user && user.id ? String(user.id) : null;
    const roles = user ? [].concat(Array.isArray(user.roles) ? user.roles : [], user.role || []) : [];
    const coach = roles.some((r) => ZSW_COACH_ROLES.indexOf(r) >= 0);
    const read = await readZone();
    if (my !== gen) return;
    if (read.kind !== "zone") { set({ phase: read.kind, uid, coach, zone: null, retrying: false }); return; }
    const Z = await whenLib();
    if (my !== gen) return;
    if (!Z) { set({ phase: "off", uid, coach, zone: null, retrying: false }); return; }
    let zone = read.zone;
    if (!zone) {
      let device = null;
      try { device = Z.deviceZone(); } catch (e) { device = null; }
      if (device) {
        const w = await call("PUT", { timezone: device, onlyIfUnset: true });
        if (my !== gen) return;
        if (w.status === 401) { set({ phase: "signedout", uid: null, coach: false, zone: null, retrying: false }); return; }
        if (w.status === 503 && w.data && w.data.code === "not_ready") { set({ phase: "off", uid, coach, zone: null, retrying: false }); return; }
        if (w.ok && w.data && typeof w.data.timezone === "string") {
          zone = w.data.timezone;
        } else if (w.status !== 400) {
          // The write may have landed: ask what is stored rather than calling it unset.
          const again = await readZone();
          if (my !== gen) return;
          if (again.kind !== "zone") { set({ phase: again.kind, uid, coach, zone: null, retrying: false }); return; }
          zone = again.zone;
        }
      }
    }
    try { Z.setAccountZone(zone); } catch (e) {}
    set({ phase: "ready", uid, coach, zone, retrying: false });
  }

  function start() {
    if (!started) started = run(false);
    return started;
  }
  function restart(retrying) {
    started = run(retrying);
    return started;
  }
  function retry() {
    if (state.phase !== "unreadable") return started || Promise.resolve();
    return restart(true);
  }

  // The stored answer, whatever was asked. `wanted` is what the person picked.
  function land(stored, wanted, via) {
    const Z = deps.lib();
    if (Z) { try { Z.setAccountZone(stored); } catch (e) {} }
    const ok = !!stored && stored === wanted;
    // ⚠ A ZONE PICKED IN SETTINGS ANSWERS THE TRAVEL QUESTION FOR THIS DEVICE. Choosing Tokyo on a
    // London laptop is a decision; asking "switch to London?" the moment it lands is not a question.
    if (ok && via === "settings" && Z) {
      try { const d = Z.deviceZone(); if (d && d !== stored) Z.declineDeviceZone(d); } catch (e) {}
    }
    set({
      zone: stored,
      save: { kind: ok ? "saved" : "failed", via, zone: wanted, reason: ok ? null : "unchanged" },
      notice: ok && via === "travel" ? { kind: "switched", zone: stored } : null,
    });
    return ok;
  }

  async function save(next, via) {
    const Z = deps.lib();
    const s = state;
    if (s.phase !== "ready" || !Z || (s.save && s.save.kind === "saving")) return false;
    let zone = null;
    try { zone = Z.normalizeZone(next); } catch (e) { zone = null; }
    if (!zone) { set({ save: { kind: "failed", via, zone: next, reason: "invalid" } }); return false; }
    if (zone === s.zone) return true;
    const my = gen;
    set({ save: { kind: "saving", via, zone }, notice: null });
    const w = await call("PUT", { timezone: zone });
    if (my !== gen) return false;
    if (w.ok && w.data && typeof w.data.timezone === "string") return land(w.data.timezone, zone, via);
    if (w.status === 401) { set({ phase: "signedout", uid: null, coach: false, zone: null, save: null }); return false; }
    if (w.status === 400 || w.status === 503) {
      set({ save: { kind: "failed", via, zone, reason: w.status === 400 ? "invalid" : "unchanged" } });
      return false;
    }
    const again = await readZone();
    if (my !== gen) return false;
    if (again.kind === "zone") return land(again.zone, zone, via);
    // Neither the save nor a read-back answered: no picker over a value nobody can vouch for now.
    set({
      phase: again.kind === "signedout" ? "signedout" : again.kind === "off" ? "off" : "unreadable",
      save: null,
      notice: via === "travel" ? { kind: "unconfirmed", zone } : null,
    });
    return false;
  }

  function keep() {
    const a = state.ask;
    const Z = deps.lib();
    if (!a || !Z) return;
    try { Z.declineDeviceZone(a.device); } catch (e) {}
    set({ save: null });
  }
  function later() { notNow = true; set({}); }
  function dismissNotice() { if (state.notice) set({ notice: null }); }
  // The device's clock can move while a page is open (a laptop that travelled): ask again on focus.
  function refresh() { if (!zswSameAsk(askOf(state), state.ask)) set({}); }

  return {
    get: () => state,
    subscribe: (fn) => { subs.add(fn); return () => { subs.delete(fn); }; },
    lib: () => deps.lib(),
    start, retry, save, keep, later, dismissNotice, refresh,
  };
}

let _zswStore = null;
function zswStore() {
  if (!_zswStore) _zswStore = zswCreateStore();
  return _zswStore;
}

function zswUseState(st) {
  return React.useSyncExternalStore(st.subscribe, st.get, st.get);
}

const ZSW_NOTE = { fontSize: 12, color: ZSW_INK2, lineHeight: 1.5, marginTop: 8 };
const ZSW_BTN = { fontFamily: "inherit", fontSize: 12.5, padding: "7px 12px", borderRadius: 999, border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.25)", background: "transparent", color: ZSW_INK, cursor: "pointer" };
const ZSW_BTN_MAIN = { ...ZSW_BTN, border: "1px solid " + ZSW_ACCENT, background: ZSW_ACCENT, color: "var(--sh-ground, #1a1612)", fontWeight: 600 };

function zswStatus(s, Z) {
  const sv = s.save;
  if (!sv) return { text: "", tone: ZSW_INK2 };
  if (sv.kind === "saving") return { text: "Saving…", tone: ZSW_INK2 };
  if (sv.kind === "saved") return { text: "Saved. Times on Shape show in " + (Z.zoneCity(sv.zone) || sv.zone) + ".", tone: ZSW_ACCENT };
  const still = s.zone ? "Your time zone is still " + (Z.zoneLabel(s.zone) || s.zone) + "." : "Nothing was changed.";
  return { text: (sv.reason === "invalid" ? "Shape doesn't know that time zone. " : "Couldn't save that. ") + still, tone: ZSW_DANGER };
}

/**
 * The Settings control: "Time zone", a picker over every zone (the account's and this device's
 * always among them), "Use this device's time zone" when the device's differs, and what the last
 * save did. Renders nothing signed out, before the migration, and while the first read is out.
 * `wrap(body)` frames it in the host page's card, so a hidden control leaves no empty card.
 */
function ZswZoneSetting({ coach, wrap, labelClassName, labelStyle, store }) {
  const st = store || zswStore();
  const s = zswUseState(st);
  const rid = typeof React.useId === "function" ? React.useId() : "";
  const id = "zsw-zone" + String(rid).replace(/[^A-Za-z0-9_-]/g, "");
  React.useEffect(() => { st.start(); }, [st]);
  const Z = st.lib();
  const showRead = s.phase === "unreadable" || (s.phase === "reading" && s.retrying);
  if (!Z || (s.phase !== "ready" && !showRead)) return null;
  const frame = typeof wrap === "function" ? wrap : (body) => body;
  // A host class (the coach page's eyebrow) styles the heading itself; otherwise a plain one.
  const heading = labelClassName ? { display: "block", ...(labelStyle || {}) } : { display: "block", fontSize: 13.5, color: ZSW_INK, ...(labelStyle || {}) };
  const hours = coach || s.coach ? <div style={ZSW_NOTE}>{ZSW_HOURS_LINE}</div> : null;

  if (showRead) {
    const busy = s.phase === "reading";
    return frame(
      <div data-zone-setting="unreadable">
        <div className={labelClassName} style={heading}>Time zone</div>
        <div role="status" style={{ ...ZSW_NOTE, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span>{busy ? "Reading your time zone…" : "Couldn't read your time zone."}</span>
          <button type="button" disabled={busy} onClick={() => st.retry()} style={{ ...ZSW_BTN, opacity: busy ? 0.5 : 1 }}>Retry</button>
        </div>
      </div>
    );
  }

  let device = null;
  try { device = Z.deviceZone(); } catch (e) { device = null; }
  const zone = s.zone;
  const saving = !!(s.save && s.save.kind === "saving");
  let options = Z.zoneOptions({ include: [zone, device].filter(Boolean) });
  // A stored zone this browser cannot place still shows as itself, never as a neighbour.
  if (zone && !options.some((o) => o.zone === zone)) options = [{ zone, label: zone }].concat(options);
  const value = saving ? s.save.zone : (zone || "");
  const status = zswStatus(s, Z);
  return frame(
    <div data-zone-setting="ready">
      <label htmlFor={id} className={labelClassName} style={heading}>Time zone</label>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 10 }}>
        <select
          id={id} value={value} disabled={saving}
          onChange={(e) => { st.save(e.target.value, "settings"); }}
          style={{ flex: "1 1 220px", maxWidth: 340, minWidth: 0, minHeight: 34, padding: "6px 10px", borderRadius: 6, border: "1px solid " + ZSW_LINE, background: ZSW_CARD, color: ZSW_INK, fontFamily: ZSW_MONO, fontSize: 12.5, opacity: saving ? 0.6 : 1 }}
        >
          {!zone && <option value="" disabled>Not set</option>}
          {options.map((o) => <option key={o.zone} value={o.zone}>{o.label}</option>)}
        </select>
        {device && device !== zone && (
          <button type="button" disabled={saving} onClick={() => { st.save(device, "settings"); }} style={{ ...ZSW_BTN, opacity: saving ? 0.5 : 1 }}>
            Use this device's time zone ({Z.zoneLabel(device) || device})
          </button>
        )}
      </div>
      <div role="status" aria-live="polite" style={{ ...ZSW_NOTE, minHeight: 18, color: status.tone }}>{status.text}</div>
      <div style={ZSW_NOTE}>
        {zone
          ? "Your day and your reminders run on this clock."
          : "Not set yet, so Shape uses this device's clock. Pick one and your day and your reminders run on it."}
      </div>
      {hours}
    </div>
  );
}

// Bottom left, clear of the chat button (bottom right); at phone width full width, above it.
function ZswTravelStyle() {
  return (
    <style>{`
      .zsw-travel{position:fixed;left:20px;bottom:20px;z-index:80;box-sizing:border-box;width:360px;max-width:calc(100vw - 32px);padding:14px 16px;border-radius:12px;background:var(--sh-card, #25211d);color:var(--sh-ink, #f2ede4);border:1px solid var(--sh-line, #302c27);box-shadow:0 10px 30px rgba(0,0,0,.28);font-family:var(--sh-font-body, 'Space Grotesk', 'Space Grotesk Fallback', sans-serif);font-size:13px;line-height:1.45}
      @media (max-width:640px){.zsw-travel{left:16px;right:16px;width:auto;bottom:76px}}
    `}</style>
  );
}

function ZswClockGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ flex: "none", color: ZSW_ACCENT }}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7v5l3.2 2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The travel question: this device is on another clock; switch, or keep the account's. */
function ZswTravelCard({ store }) {
  const st = store || zswStore();
  const s = zswUseState(st);
  React.useEffect(() => {
    if (!s.notice) return undefined;
    const t = setTimeout(() => st.dismissNotice(), 6000);
    return () => clearTimeout(t);
  }, [s.notice, st]);
  const Z = st.lib();
  if (!Z || (!s.ask && !s.notice)) return null;
  const close = (label, onClick) => (
    <button type="button" aria-label={label} onClick={onClick} style={{ marginLeft: "auto", border: 0, background: "transparent", color: ZSW_INK2, fontSize: 18, lineHeight: 1, padding: "0 2px", cursor: "pointer" }}>×</button>
  );

  if (!s.ask) {
    const text = s.notice.kind === "switched"
      ? "Times on Shape now show in " + (Z.zoneCity(s.notice.zone) || s.notice.zone) + "."
      : "Couldn't confirm the switch. Check your time zone in Settings.";
    return (
      <div className="zsw-travel" role="status" aria-live="polite" data-zone-travel="notice">
        <ZswTravelStyle />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <ZswClockGlyph />
          <span style={{ color: s.notice.kind === "switched" ? ZSW_INK : ZSW_DANGER }}>{text}</span>
          {close("Close", () => st.dismissNotice())}
        </div>
      </div>
    );
  }

  const { account, device } = s.ask;
  // Any save in flight holds both buttons (the store takes one at a time); only this card's says so.
  const busy = !!(s.save && s.save.kind === "saving");
  const saving = busy && s.save.via === "travel";
  const failed = !!(s.save && s.save.kind === "failed" && s.save.via === "travel");
  const coach = s.coach || (typeof window !== "undefined" && !!window.__shapeCoachShell);
  const cityA = Z.zoneCity(account) || account;
  const cityD = Z.zoneCity(device) || device;
  return (
    <div className="zsw-travel" role="region" aria-label="Time zone on this device" data-zone-travel="ask">
      <ZswTravelStyle />
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <ZswClockGlyph />
        <strong style={{ fontWeight: 600 }}>This device is on another clock</strong>
        {close("Not now", () => st.later())}
      </div>
      <div style={{ marginTop: 8, color: ZSW_INK2 }}>
        Your times on Shape show in {Z.zoneLabel(account) || account}. This device is set to {Z.zoneLabel(device) || device}.
      </div>
      {coach && <div style={{ marginTop: 6, color: ZSW_INK2 }}>{ZSW_HOURS_LINE}</div>}
      {failed && <div role="alert" style={{ marginTop: 6, color: ZSW_DANGER }}>Couldn't switch. Your times stay in {cityA}.</div>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
        <button type="button" disabled={busy} onClick={() => { st.save(device, "travel"); }} style={{ ...ZSW_BTN_MAIN, opacity: busy ? 0.6 : 1 }}>
          {saving ? "Switching…" : "Switch to " + cityD}
        </button>
        <button type="button" disabled={busy} onClick={() => st.keep()} style={{ ...ZSW_BTN, opacity: busy ? 0.5 : 1 }}>
          Keep {cityA}
        </button>
      </div>
    </div>
  );
}

Object.assign(window, {
  ShapeZoneSetting: ZswZoneSetting,
  ShapeZoneTravelCard: ZswTravelCard,
  shapeZoneWebStore: zswStore,
  shapeZoneCreateStore: zswCreateStore,
});

// Once per page load: read the account's zone, and give the travel card a root of its own, so it
// shows on every tab of these pages and not only on Settings.
(function zswBoot() {
  if (typeof window === "undefined" || !window.document || window.__shapeZoneWebBooted) return;
  window.__shapeZoneWebBooted = true;
  const st = zswStore();
  st.start();
  try { window.addEventListener("focus", () => st.refresh()); } catch (e) {}
  const mount = () => {
    try {
      const RD = window.ReactDOM;
      if (!RD || typeof RD.createRoot !== "function" || !document.body) return;
      const host = document.createElement("div");
      host.id = "shape-zone-travel";
      document.body.appendChild(host);
      RD.createRoot(host).render(<ZswTravelCard store={st} />);
    } catch (e) { /* no card: Settings still offers the switch */ }
  };
  if (document.body) mount(); else document.addEventListener("DOMContentLoaded", mount, { once: true });
})();
