// Trainer/Nutritionist Playlists page: three tool views in one fixed layout (coach review step
// 6b, 2026-11-09). Library: every playlist the coach saved, as album cards. Attach: where each one
// plays. Builder: edit one playlist. Driven by a `ctx` prop so it works for both roles.
//
// ⚠ WHAT IS REAL, AND WHERE IT IS READ. Nothing on this page is guessed:
//   · the playlists are the coach's own saved soundtracks (/api/coach/soundtracks, the
//     coach_soundtracks rows the app's Soundtracks page shares). Tracks, length and tempo are the
//     row's own `tracks`, `duration` and `bpm`; a row says only what it holds.
//   · a TRAINER's playlist plays on a program day: the builder's day chip writes
//     `day.playlist = { name, meta }` into the program (coach_plans.detail.builder), and assigning
//     the program copies it onto each client's session. The Attach view reads the programs
//     (/api/coach/plans?kind=program) and writes the same field back (PATCH /api/coach/plans, held
//     to the revision it read). A session already on a client's calendar keeps the playlist it was
//     sent with: the page says so.
//   · how many clients a program day reaches is the clients with that PROGRAM on their calendar
//     (/api/coach/plans/usage). Nothing records who is on one day, so a cell counts the program's.
//   · a playlist SENT TO CLIENTS is an entry in the row's `attached` ({ kind: 'all_clients' } or
//     { kind: 'client', clientId }); that is what the member's Train page (trainer) or Eat page
//     (nutritionist) reads (get_my_coach_playlists). Meal plans carry no playlist, so a
//     nutritionist's playlists reach clients this way only.
//   · there are no energy tags and no track-by-track list for a saved playlist: the full list is
//     in Spotify or Apple Music, and the page links there. Shape never plays music, so there is no
//     ▶ anywhere here and no listen count.
// ⚠ SAMPLE DATA ONLY IN THE SIGNED-OUT PREVIEW, under the demo band. A signed-in coach whose read
// failed is told it couldn't be read, never shown the sample playlists. `null` is unread, `0` is
// measured.

const PlaylistCtx = React.createContext(null);

const PL_RUST = "#c0533b";
// The rust at the strengths the page draws it (an edge, a chip's outline, a dashed ＋), as fixed rgba.
const PL_RUST_EDGE = "rgba(192,83,59,0.53)";
const PL_RUST_SOFT = "rgba(192,83,59,0.4)";
const PL_RUST_DASH = "rgba(192,83,59,0.67)";
const PL_MONO = "'JetBrains Mono', monospace";
const PL_INK2 = "var(--sh-ink2, #a09b94)";
const PL_INK3 = "var(--sh-ink3, #75706a)";
const PL_LINE = "rgba(var(--sh-ink-rgb, 242,237,228),0.08)";
// ⚠ THE MATRIX SCROLLS IN ITS OWN BOX, SO ITS HEADER CAN PIN. Nothing on a dashboard page can pin
// to the window: DashPage's <main> is overflow-x: hidden, which makes it the scroll container every
// sticky element pins to, and it never scrolls itself (the app bar isn't fixed either). So the
// matrix is a box capped to the window that scrolls both ways: the playlists' row pins at its top,
// the day names at its left.
const PL_MATRIX_MAX_H = "calc(100vh - 96px)";
const plProviderName = (provider) => (provider === "apple" ? "Apple Music" : "Spotify");

// Map a coach_soundtracks row (shared with the mobile app) into the shape this page renders. A
// field the row doesn't hold stays empty (null), never a made-up default.
function soundtrackToWeb(row) {
  // A provider's kind colour, always said in words beside it (plProviderName). A hex literal:
  // the matrix and covers append alpha to it (tests/newdesign-paper-pairs.test.mjs).
  const accent = row.provider === "apple" ? "#c4566a" : "#3f8f5f";
  const n = Number(row.tracks);
  return {
    id: row.id, name: row.name || "Untitled playlist", provider: row.provider === "apple" ? "apple" : "spotify",
    cover: `linear-gradient(150deg, ${accent}, ${typeof ssAlpha === "function" ? ssAlpha(accent, 0.35) : accent})`, accent,
    bpm: row.bpm && row.bpm !== "—" ? String(row.bpm) : null,
    trackCount: Number.isFinite(n) && n > 0 ? n : null,
    duration: row.duration && row.duration !== "—" ? String(row.duration) : null,
    note: row.tag || "", url: row.url || "",
    attached: Array.isArray(row.attached) ? row.attached.filter((a) => a && typeof a === "object") : [],
    sampleTracks: [], synced: true,
  };
}
// A sample playlist (trainerPlaylists.jsx / nutritionistPlaylists.jsx) in the same shape, for the
// signed-out preview only.
function plSampleToWeb(p) {
  return { ...p, bpm: p.bpm || null, trackCount: p.trackCount || null, duration: p.duration || null, note: p.note || "", url: p.url || "", attached: Array.isArray(p.attached) ? p.attached : [], sampleTracks: p.sampleTracks || [], synced: false };
}

// Load Apple MusicKit v3 once (injects the CDN script, resolves on 'musickitloaded').
// Same flow as public/integrations.html.
function loadMusicKit() {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.MusicKit) return Promise.resolve(window.MusicKit);
  return new Promise((resolve, reject) => {
    const done = () => (window.MusicKit ? resolve(window.MusicKit) : reject(new Error("MusicKit failed to load.")));
    if (document.querySelector("script[data-musickit]")) { document.addEventListener("musickitloaded", done, { once: true }); return; }
    const s = document.createElement("script");
    s.src = "https://js-cdn.music.apple.com/musickit/v3/musickit.js";
    s.async = true; s.setAttribute("data-musickit", "1");
    document.addEventListener("musickitloaded", done, { once: true });
    s.onerror = () => reject(new Error("Could not load Apple MusicKit."));
    document.head.appendChild(s);
  });
}

// ────────────────────────────────────────────────────────────
// The model: programs, their days, and who hears what
// ────────────────────────────────────────────────────────────
// A program's type, from its own tags (the builder's tag picker, DashBuilder.tagInfo): the first
// tag's label and colour, or null when it has none. The colour is always said in words beside it.
function plProgramType(plan) {
  try {
    const DB = typeof window !== "undefined" ? window.DashBuilder : null;
    if (!DB || typeof DB.programTags !== "function" || typeof DB.tagInfo !== "function") return null;
    const tags = DB.programTags(plan);
    if (!tags.length) return null;
    const info = DB.tagInfo(tags[0]);
    return info && info.label ? { label: info.label, color: info.c } : null;
  } catch (e) { return null; }
}
// ⚠ A DAY IS MATCHED ACROSS WEEKS BY ITS SLOT, NEVER BY ITS POSITION (Codex P1 on #2644). The
// builder deletes, inserts and copies days in one week only, so week 2's second day need not be
// week 1's second day. A day's slot is its weekday when it has one, else its name; a second day
// with the same slot in one week is that slot's second occurrence ("…#2").
function plDaySlots(days) {
  const seen = Object.create(null);
  return (Array.isArray(days) ? days : []).map((day, di) => {
    const wd = day && Number.isInteger(day.weekday) && day.weekday >= 0 && day.weekday <= 6 ? day.weekday : null;
    const base = wd != null ? "wd:" + wd : "name:" + String((day && day.name) || "Day " + (di + 1)).trim().toLowerCase();
    seen[base] = (seen[base] || 0) + 1;
    return seen[base] > 1 ? base + "#" + seen[base] : base;
  });
}
// A program's days as the Attach view lists them: one row per slot, named from the first week
// that has it, in the order the slots first appear. A program repeats its days across weeks, so a
// row's playlist is the one its slot carries in EVERY week that has it (`weeksWith` of `weeks`);
// a day set in only some weeks says so.
function plProgramDays(plan) {
  const builder = plan && plan.detail && plan.detail.builder;
  const weeks = builder && Array.isArray(builder.weeks) ? builder.weeks : [];
  const rows = new Map();
  weeks.forEach((week) => {
    const days = week && Array.isArray(week.days) ? week.days : [];
    const slots = plDaySlots(days);
    days.forEach((day, di) => {
      const key = slots[di];
      if (!rows.has(key)) rows.set(key, { index: rows.size, key, id: (day && day.id) || key, name: (day && day.name) || "Day " + (di + 1), weeks: 0, byName: Object.create(null) });
      const row = rows.get(key);
      row.weeks += 1;
      const name = day && day.playlist && typeof day.playlist.name === "string" ? day.playlist.name : "";
      if (name) row.byName[name] = (row.byName[name] || 0) + 1;
    });
  });
  return [...rows.values()].map((r) => {
    const names = Object.keys(r.byName);
    return { index: r.index, key: r.key, id: r.id, name: r.name, weeks: r.weeks, playlists: names.map((n) => ({ name: n, weeksWith: r.byName[n] })) };
  });
}
// The programs as the page reads them: { id, name, type, clients, revision, days, plan }.
// `clients` is the clients with the program on their calendar, null when that couldn't be read.
function plProgramsModel(plans, usage) {
  return (Array.isArray(plans) ? plans : []).filter((p) => p && p.kind !== "meal_plan").map((plan) => {
    const u = usage && usage.byId ? usage.byId[plan.id] : null;
    const clients = !usage ? null : u && Number(u.clients) > 0 ? Math.floor(Number(u.clients)) : (usage.capped ? null : 0);
    return { id: plan.id, name: plan.name || "Untitled program", type: plProgramType(plan), clients, revision: plan.detail && plan.detail.revision != null ? Number(plan.detail.revision) || 0 : 0, days: plProgramDays(plan), plan };
  });
}
// The signed-out preview's programs, from the sample workouts: each sample program's workouts as
// its days, a sample playlist on a day the sample attaches it to.
function plDemoPrograms(targets, playlists) {
  const groups = new Map();
  (targets || []).forEach((w) => {
    if (!groups.has(w.program)) groups.set(w.program, { id: "demo-" + w.program, name: w.program, type: null, clients: 0, revision: 0, days: [], plan: null });
    const g = groups.get(w.program);
    const on = (playlists || []).filter((p) => (p.attachedTo || []).includes(w.id));
    g.days.push({ index: g.days.length, id: w.id, name: w.name, weeks: 1, playlists: on.slice(0, 1).map((p) => ({ name: p.name, weeksWith: 1 })) });
    g.clients = Math.max(g.clients, Number(w.clientsDoing) || 0);
  });
  return [...groups.values()];
}
// Does this day play this playlist in every week (true), in some ('some'), or not at all (false)?
function plDayHas(day, name) {
  const hit = (day.playlists || []).find((x) => x.name === name);
  if (!hit) return false;
  return hit.weeksWith >= day.weeks ? true : "some";
}
// The program with one slot's playlist set (or cleared) in every week that has that slot
// (plDaySlots). A day plays one playlist, so setting one replaces the one it had. Returns the new
// builder, or null when nothing changes.
function plSetDayPlaylist(plan, slot, playlist) {
  const builder = plan && plan.detail && plan.detail.builder;
  if (!builder || !Array.isArray(builder.weeks)) return null;
  let changed = false;
  const next = playlist ? { name: playlist.name, meta: playlist.meta || "" } : null;
  const weeks = builder.weeks.map((week) => {
    const days = week && Array.isArray(week.days) ? week.days : [];
    const slots = plDaySlots(days);
    const at = slots.indexOf(slot);
    if (at < 0) return week;
    const day = days[at];
    const had = day.playlist && day.playlist.name ? day.playlist.name : "";
    if ((next ? next.name : "") === had) return week;
    changed = true;
    return { ...week, days: days.map((d, i) => (i === at ? { ...d, playlist: next } : d)) };
  });
  return changed ? { ...builder, weeks } : null;
}
// What a day's picker stores beside the name (dashBuilder's dbuPlaylistChoice): "28 tracks", or "".
function plPlaylistMeta(p) {
  const n = Number(p && p.trackCount);
  return Number.isFinite(n) && n > 0 ? n + (n === 1 ? " track" : " tracks") : "";
}
// The days that need music: on a program clients are on (or, when that couldn't be read, on any
// program), with no playlist in every week. `total` and `covered` count the same days.
function plMusicCoverage(programs) {
  const list = Array.isArray(programs) ? programs : [];
  const usageRead = list.every((p) => p.clients != null);
  const inUse = list.filter((p) => (usageRead ? p.clients > 0 : true));
  const days = [];
  inUse.forEach((p) => p.days.forEach((d) => days.push({ program: p, day: d, music: (d.playlists || []).some((x) => x.weeksWith >= d.weeks) })));
  const missing = days.filter((x) => !x.music);
  // The one raised: the missing day on the program most clients are on.
  // A day with music in only some weeks is partial, not silent: it says how many.
  missing.forEach((x) => { x.most = (x.day.playlists || []).reduce((m, y) => Math.max(m, y.weeksWith), 0); });
  missing.sort((a, b) => (Number(b.program.clients) || 0) - (Number(a.program.clients) || 0));
  return { usageRead, total: days.length, covered: days.length - missing.length, missing };
}
// Who hears a playlist: the clients on the programs whose days carry it, and who it was sent to.
// { programs: [{ program, days }], programClients: number|null, all: boolean, clients: [ids] }.
function plWhoHears(p, programs) {
  const on = (Array.isArray(programs) ? programs : []).map((prog) => ({ program: prog, days: prog.days.filter((d) => plDayHas(d, p.name)) })).filter((x) => x.days.length);
  const counts = on.map((x) => x.program.clients);
  const programClients = counts.some((c) => c == null) ? null : counts.reduce((s, c) => s + c, 0);
  const attached = Array.isArray(p.attached) ? p.attached : [];
  return {
    programs: on, programClients,
    all: attached.some((a) => a.kind === "all_clients"),
    clients: attached.filter((a) => a.kind === "client" && a.clientId).map((a) => a.clientId),
  };
}
// "Who hears it" in words, from plWhoHears. Program counts can overlap (a client on two programs).
function plWhoHearsText(w, role) {
  const parts = [];
  if (w.all) parts.push("Every client");
  else if (w.clients.length) parts.push("Sent to " + w.clients.length + (w.clients.length === 1 ? " client" : " clients"));
  if (role !== "nutritionist" && w.programs.length) {
    const days = w.programs.reduce((s, x) => s + x.days.length, 0);
    const on = days + (days === 1 ? " program day" : " program days");
    parts.push(w.programClients == null ? on : on + " · " + w.programClients + (w.programClients === 1 ? " client" : " clients"));
  }
  return parts.length ? parts.join(" · ") : "Not playing anywhere yet";
}
// A client's entry in a playlist's `attached`, as the app writes it (iosAppBroadsheetPros).
const plAllClientsEntry = () => ({ id: "all_clients", kind: "all_clients", name: "All my clients" });
const plClientEntry = (c) => ({ id: "client:" + c.id, kind: "client", clientId: c.id, name: c.name });
function plIsSentTo(p, target) {
  const list = Array.isArray(p.attached) ? p.attached : [];
  return target === "all" ? list.some((a) => a.kind === "all_clients") : list.some((a) => a.kind === "client" && a.clientId === target);
}
function plToggleSent(p, target) {
  const list = Array.isArray(p.attached) ? p.attached : [];
  if (target.id === "all") return plIsSentTo(p, "all") ? list.filter((a) => a.kind !== "all_clients") : [...list, plAllClientsEntry()];
  return plIsSentTo(p, target.id) ? list.filter((a) => !(a.kind === "client" && a.clientId === target.id)) : [...list, plClientEntry(target)];
}

// The roster for "sent to clients": the coach's real clients when useDashboard read them live,
// the sample clients only in the signed-out preview, else null (couldn't be read).
function plRosterFrom(dash, demo) {
  if (!dash || dash.loading) return { state: "loading", clients: null };
  if (dash.source === "live" || (demo && dash.source === "demo")) {
    const recs = Array.isArray(dash.clients) ? dash.clients : [];
    const clients = recs.map((r) => ({ id: r && r.profile ? r.profile.id : null, name: (r && r.profile && r.profile.name) || "Client", points: typeof dashRecordTier === "function" ? dashRecordTier(r) : null })).filter((c) => c.id);
    return { state: "ready", clients };
  }
  return { state: "unread", clients: null };
}

async function plJson(res) { try { return await res.json(); } catch (e) { return {}; } }

// ────────────────────────────────────────────────────────────
// The page
// ────────────────────────────────────────────────────────────
function PlaylistPage({ ctx }) {
  const { useState, useEffect } = React;
  const role = ctx.role === "nutritionist" ? "nutritionist" : "trainer";
  const storageKey = `shape.${ctx.role}.playlists.view`;
  const [view, setView] = useState(() => {
    try { const v = localStorage.getItem(storageKey); return v === "matrix" || v === "builder" ? v : "library"; } catch (e) { return "library"; }
  });
  // The read: 'loading' · 'live' (a signed-in coach's own rows) · 'demo' (signed out: 401) ·
  // 'unread' (signed in, the read failed).
  const [read, setRead] = useState({ state: "loading", rows: [] });
  const [readTick, setReadTick] = useState(0);
  const [plans, setPlans] = useState({ state: "loading", list: null });
  const [usage, setUsage] = useState(undefined); // undefined = reading · null = couldn't be read
  const [demoPlaylists, setDemoPlaylists] = useState(() => (ctx.playlists || []).map(plSampleToWeb));
  const [demoPrograms, setDemoPrograms] = useState(() => (role === "trainer" ? plDemoPrograms(ctx.attachTargets, ctx.playlists) : []));
  const [adding, setAdding] = useState(false);
  const [focus, setFocus] = useState(null); // { playlistId } or { programId, dayIndex } the Attach view lifts
  const [selectedId, setSelectedId] = useState(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    let cancelled = false;
    setRead((r) => ({ state: r.state === "live" ? "live" : "loading", rows: r.rows }));
    fetch("/api/coach/soundtracks", { credentials: "same-origin", cache: "no-store" })
      .then(async (r) => {
        if (cancelled) return;
        if (r.status === 401) { setRead({ state: "demo", rows: [] }); return; }
        if (!r.ok) { setRead({ state: "unread", rows: [] }); return; }
        const d = await plJson(r);
        if (cancelled) return;
        if (!Array.isArray(d.soundtracks)) { setRead({ state: "unread", rows: [] }); return; }
        // ⚠ ONLY THIS PAGE'S PLAYLISTS (Codex P2 on #2644). A coach who is both a trainer and a
        // nutritionist has both kinds in one table; the member's Train page reads the trainer's and
        // the Eat page the nutritionist's (get_my_coach_playlists). A row saved before roles (null)
        // shows on both pages, as the function reads it, and an edit never re-stamps a row's role.
        setRead({ state: "live", rows: d.soundtracks.filter((r) => r && (r.role == null || r.role === role)).map(soundtrackToWeb) });
      })
      .catch(() => { if (!cancelled) setRead({ state: "unread", rows: [] }); });
    return () => { cancelled = true; };
  }, [readTick]);

  // A trainer's programs and who is on them, once the coach is known to be signed in.
  useEffect(() => {
    if (role !== "trainer" || read.state !== "live") return undefined;
    let cancelled = false;
    fetch("/api/coach/plans?kind=program", { credentials: "same-origin", cache: "no-store" })
      .then(async (r) => { const d = await plJson(r); if (cancelled) return; setPlans(r.ok && Array.isArray(d.plans) ? { state: "ready", list: d.plans } : { state: "unread", list: null }); })
      .catch(() => { if (!cancelled) setPlans({ state: "unread", list: null }); });
    // Today on the account's own clock (one zone per account, printed through ShapeZone), as the
    // usage route takes it; this device's clock only when ShapeZone isn't there.
    const t = new Date();
    let today = "";
    try { const Z = window.ShapeZone; if (Z && typeof Z.dayKey === "function") today = Z.dayKey(Date.now()) || ""; } catch (e) { today = ""; }
    if (!today) today = t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0");
    fetch("/api/coach/plans/usage?today=" + today, { credentials: "same-origin", cache: "no-store" })
      .then(async (r) => { const d = await plJson(r); if (cancelled) return; setUsage(r.ok && d.usage && typeof d.usage === "object" ? { byId: d.usage, capped: !!d.capped } : null); })
      .catch(() => { if (!cancelled) setUsage(null); });
    return () => { cancelled = true; };
  }, [role, read.state, readTick]);

  const demo = read.state === "demo";
  const live = read.state === "live";
  // The rows as they are NOW, for a write that starts after another one landed (the render's copy
  // of a row can be one write behind).
  const rowsRef = React.useRef([]);
  rowsRef.current = demo ? demoPlaylists : read.rows;
  const useRoster = typeof useDashboard === "function" ? useDashboard : () => null;
  const dash = useRoster(role);
  const roster = plRosterFrom(dash, demo);

  const playlists = demo ? demoPlaylists : live ? read.rows : [];
  // The programs are ready once both reads answered: the programs, and who is on them (or that
  // that couldn't be read, when every count says so instead of 0).
  const programsState = role !== "trainer" ? "none" : demo ? "ready" : plans.state === "ready" && usage === undefined ? "loading" : plans.state;
  const programs = role !== "trainer" ? [] : demo ? demoPrograms : programsState === "ready" ? plProgramsModel(plans.list, usage) : null;
  const coverage = programs && programs.length ? plMusicCoverage(programs) : null;

  const setViewPersist = (v) => { setView(v); try { localStorage.setItem(storageKey, v); } catch (e) {} };
  const openAttach = (f) => { setFocus(f || null); setViewPersist("matrix"); };
  const openBuilder = (id) => { setSelectedId(id); setViewPersist("builder"); };

  // ── Writes ──
  const replaceRow = (row) => setRead((r) => ({ ...r, rows: r.rows.map((x) => (x.id === row.id ? row : x)) }));
  const importSoundtrack = async ({ name, url, note: tag, provider }) => {
    const prov = provider || (/music\.apple|apple\s*music/i.test(url || "") ? "apple" : "spotify");
    if (demo) return { error: "Sign in as a coach to save playlists." };
    try {
      const res = await fetch("/api/coach/soundtracks", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: (name || "").trim() || "New playlist", provider: prov, url: url || "", tag: (tag || "").trim(), role }),
      });
      const d = await plJson(res);
      if (res.ok && d.soundtrack) { setRead((r) => ({ ...r, rows: [soundtrackToWeb(d.soundtrack), ...r.rows] })); return { ok: true }; }
      return { error: d.error || "Couldn't save the playlist. Try again." };
    } catch (e) { return { error: "Couldn't save the playlist. Check your connection and try again." }; }
  };
  const savePlaylist = async (p, patch) => {
    if (demo) { setDemoPlaylists((list) => list.map((x) => (x.id === p.id ? { ...x, ...patch } : x))); return { ok: true }; }
    try {
      const res = await fetch("/api/coach/soundtracks", { method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.id, ...patch }) });
      const d = await plJson(res);
      if (res.ok && d.soundtrack) { replaceRow(soundtrackToWeb(d.soundtrack)); return { ok: true }; }
      return { error: d.error || "Couldn't save. Try again." };
    } catch (e) { return { error: "Couldn't save. Check your connection and try again." }; }
  };
  const deletePlaylist = async (p) => {
    const ok = window.ShapeConfirm && window.ShapeConfirm.open
      ? await window.ShapeConfirm.open({ title: "Delete this playlist?", name: p.name, message: "It comes off your Shape library and stops showing to the clients it was sent to. Sessions already sent keep their link. The playlist itself stays in " + plProviderName(p.provider) + ".", confirmLabel: "Delete playlist" })
      : false;
    if (!ok) return { cancelled: true };
    if (demo) { setDemoPlaylists((list) => list.filter((x) => x.id !== p.id)); return { ok: true }; }
    try {
      const res = await fetch("/api/coach/soundtracks", { method: "DELETE", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.id }) });
      if (res.ok) { setRead((r) => ({ ...r, rows: r.rows.filter((x) => x.id !== p.id) })); return { ok: true }; }
      const d = await plJson(res);
      return { error: d.error || "Couldn't delete. Try again." };
    } catch (e) { return { error: "Couldn't delete. Check your connection and try again." }; }
  };
  // Send a playlist to every client, or one client (the `attached` entries members read).
  const toggleSent = async (given, target) => {
    const p = rowsRef.current.find((x) => x.id === given.id) || given;
    const next = plToggleSent(p, target);
    if (demo) { setDemoPlaylists((list) => list.map((x) => (x.id === p.id ? { ...x, attached: next } : x))); return { ok: true }; }
    const was = p;
    replaceRow({ ...p, attached: next });
    const r = await savePlaylist(p, { attached: next });
    if (r.error) { replaceRow(was); setNote(r.error); }
    return r;
  };
  // Set a program day's playlist (or clear it), every week of that program.
  const setDay = async (program, dayIndex, playlist) => {
    if (demo) {
      setDemoPrograms((list) => list.map((g) => (g.id !== program.id ? g : { ...g, days: g.days.map((d) => (d.index !== dayIndex ? d : { ...d, playlists: playlist ? [{ name: playlist.name, weeksWith: d.weeks }] : [] })) })));
      return { ok: true };
    }
    const slot = (program.days.find((d) => d.index === dayIndex) || {}).key;
    const builder = slot ? plSetDayPlaylist(program.plan, slot, playlist ? { name: playlist.name, meta: plPlaylistMeta(playlist) } : null) : null;
    if (!builder) return { ok: true };
    try {
      const res = await fetch("/api/coach/plans", { method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: program.id, detail: { builder }, expectedRevision: program.revision }) });
      const d = await plJson(res);
      if (res.ok && d.plan) { setPlans((s) => ({ ...s, list: (s.list || []).map((x) => (x.id === d.plan.id ? d.plan : x)) })); return { ok: true }; }
      const msg = res.status === 409 ? "“" + program.name + "” changed somewhere else. Reload the page to see it, then try again." : d.error || "Couldn't save the program. Try again.";
      setNote(msg);
      return { error: msg };
    } catch (e) { const msg = "Couldn't save the program. Check your connection and try again."; setNote(msg); return { error: msg }; }
  };

  const mctx = { ...ctx, role, demo, live, playlists, programs, programsState, coverage, roster, importSoundtrack, savePlaylist, deletePlaylist, toggleSent, setDay, openAttach, openBuilder, setAdding };
  const attachFlag = coverage ? coverage.missing.length : 0;
  const eyebrow = read.state === "loading" ? "PLAYLISTS" : read.state === "unread" ? "PLAYLISTS · COULDN'T BE READ" : `${playlists.length} ${playlists.length === 1 ? "PLAYLIST" : "PLAYLISTS"}`;

  return (
    <PlaylistCtx.Provider value={mctx}>
      <DashPage
        navItems={ctx.navItems("playlists")}
        payoutCard={ctx.payoutCard}
        eyebrow={eyebrow}
        title="Playlists"
        subtitle={role === "nutritionist"
          ? "Save the Spotify or Apple Music playlists you cook to, and send them to your clients. They open in the client's own app."
          : "Save the Spotify or Apple Music playlists you train to, and put them on program days. They open in the client's own app."}
        actions={(live || demo) ? <button type="button" onClick={() => setAdding(true)} style={pillPrimary}>＋ New playlist</button> : null}
      >
        {demo && typeof DashDemoBand === "function" && <DashDemoBand />}
        {read.state === "loading" && <div data-pl-state="loading" style={plQuiet}>Reading your playlists…</div>}
        {read.state === "unread" && (
          <Card style={{ padding: 22 }}>
            <div data-pl-state="unread" style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>Your playlists couldn't be read.</div>
            <div style={{ fontSize: 13, color: PL_INK2, marginBottom: 14 }}>Nothing is shown in their place. Try again in a moment.</div>
            <button type="button" onClick={() => setReadTick((n) => n + 1)} style={pillGhost}>Try again</button>
          </Card>
        )}
        {(live || demo) && (
          <React.Fragment>
            <PlBrief />
            {note && <div role="status" data-pl-note style={{ margin: "0 0 14px", padding: "10px 14px", borderRadius: 8, border: `1px solid ${PL_RUST_SOFT}`, fontSize: 13, display: "flex", gap: 12, alignItems: "center" }}><span style={{ flex: 1 }}>{note}</span><button type="button" onClick={() => setNote("")} style={plLinkBtn}>Dismiss</button></div>}
            <PlaylistTabs value={view} onChange={setViewPersist} flag={attachFlag} />
            {view === "library" && <LibraryGrid />}
            {view === "matrix" && <AttachMatrix focus={focus} />}
            {view === "builder" && <BuilderDrawer selectedId={selectedId} setSelectedId={setSelectedId} />}
          </React.Fragment>
        )}
        {/* Room under the last row for the preview's fixed band, so it covers no card. */}
        {demo && <div aria-hidden="true" data-pl-band-room style={{ height: 56 }} />}
        {adding && <NewPlaylistDialog onClose={() => setAdding(false)} />}
      </DashPage>
    </PlaylistCtx.Provider>
  );
}

const pillGhost = { background: "transparent", color: INK, border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.25)", padding: "10px 20px", borderRadius: 999, fontFamily: sans, fontSize: 13, cursor: "pointer" };
const pillPrimary = { background: INK, color: PAPER, border: 0, padding: "10px 22px", borderRadius: 999, fontFamily: sans, fontSize: 13, fontWeight: 500, cursor: "pointer" };
const plQuiet = { padding: "28px 4px", fontSize: 13, color: PL_INK2 };
const plLinkBtn = { all: "unset", cursor: "pointer", fontFamily: PL_MONO, fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--sh-accent-ink, #2ee0c4)" };
const plChip = { display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 9px", borderRadius: 999, fontFamily: PL_MONO, fontSize: 10, letterSpacing: "0.06em", border: `1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.16)`, color: PL_INK2, whiteSpace: "nowrap" };

// ── The brief: one sentence and one action at the top ──
function plBriefModel(c) {
  if (c.role === "trainer") {
    if (c.programsState === "loading") return { text: "Reading your programs…", action: null };
    if (c.programsState === "unread") return { text: "Your programs couldn't be read, so this page can't say which days have music.", action: null };
    const cov = c.coverage;
    if (!cov || !cov.total) return { text: c.playlists.length ? "Put a playlist on a program day, and every client you assign that program to gets it." : "Save a playlist, then put it on a program day.", action: c.playlists.length ? { label: "Attach", focus: null } : { label: "＋ New playlist", add: true } };
    const scope = cov.usageRead ? "program days your clients are on" : "program days";
    const head = cov.covered + " of " + cov.total + " " + scope + " have music.";
    if (!cov.missing.length) return { text: head, action: null };
    const m = cov.missing[0];
    const who = m.program.clients == null ? "" : " (" + m.program.clients + (m.program.clients === 1 ? " client" : " clients") + ")";
    const what = m.most > 0 ? " has music in only " + m.most + " of " + m.day.weeks + " weeks" : " has no music";
    return { text: head, raised: m.program.name + " · " + m.day.name + what + who + ".", partial: m.most > 0, action: { label: "Attach", focus: { programId: m.program.id, dayIndex: m.day.index } } };
  }
  // A nutritionist's playlists reach clients only as sends.
  if (c.roster.state === "loading") return { text: "Reading your clients…", action: null };
  const sentAll = c.playlists.some((p) => plIsSentTo(p, "all"));
  if (!c.playlists.length) return { text: "Save a playlist you cook to, then send it to your clients.", action: { label: "＋ New playlist", add: true } };
  if (sentAll) return { text: "Every client gets a cooking playlist on their Eat page.", action: null };
  if (c.roster.state !== "ready") return { text: "Your clients couldn't be read, so this page can't say who gets a playlist.", action: { label: "Attach", focus: null } };
  const total = c.roster.clients.length;
  const reached = c.roster.clients.filter((cl) => c.playlists.some((p) => plIsSentTo(p, cl.id))).length;
  return { text: reached + " of " + total + (total === 1 ? " client gets" : " clients get") + " a cooking playlist.", action: reached < total ? { label: "Send to clients", focus: null } : null };
}
function PlBrief() {
  const c = React.useContext(PlaylistCtx);
  const m = plBriefModel(c);
  return (
    <div data-pl-brief style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", padding: "14px 18px", marginBottom: 18, borderRadius: 12, border: `1px solid ${m.raised ? PL_RUST_EDGE : PL_LINE}`, borderLeft: m.raised ? `3px solid ${PL_RUST}` : undefined, background: "rgba(var(--sh-ink-rgb, 242,237,228),0.03)", boxShadow: m.raised ? "var(--lift-2, 0 4px 14px rgba(0,0,0,0.14))" : "none" }}>
      <div style={{ flex: "1 1 320px", minWidth: 0 }}>
        <div data-pl-brief-text style={{ fontSize: 15, fontWeight: 500 }}>{m.text}</div>
        {m.raised && <div data-pl-raised style={{ fontSize: 13, color: PL_INK2, marginTop: 4 }}><span style={{ ...plChip, borderColor: PL_RUST_EDGE, color: PL_RUST, marginRight: 8 }}>{m.partial ? "Some weeks" : "No music"}</span>{m.raised}</div>}
      </div>
      {m.action && <button type="button" data-pl-brief-action onClick={() => (m.action.add ? c.setAdding(true) : c.openAttach(m.action.focus))} style={pillPrimary}>{m.action.label}</button>}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// A · Library: album cards
// ────────────────────────────────────────────────────────────
function LibraryGrid() {
  const c = React.useContext(PlaylistCtx);
  const [query, setQuery] = React.useState("");
  const [peek, setPeek] = React.useState(null);
  const items = c.playlists.filter((p) => !query || p.name.toLowerCase().includes(query.toLowerCase()));
  const peeked = peek ? c.playlists.find((p) => p.id === peek) : null;
  return (
    <React.Fragment>
      {c.playlists.length > 6 && <SearchBar query={query} setQuery={setQuery} placeholder="Search playlists…" />}
      {!c.playlists.length ? (
        <Card style={{ padding: 22 }}>
          <div data-pl-empty style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>No playlists yet.</div>
          <div style={{ fontSize: 13, color: PL_INK2, marginBottom: 14 }}>Pick one from your Spotify or Apple Music, or paste a link.</div>
          <button type="button" onClick={() => c.setAdding(true)} style={pillPrimary}>＋ New playlist</button>
        </Card>
      ) : (
        <div data-pl-grid style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
          {items.map((p) => <PlaylistCard key={p.id} p={p} onPeek={() => setPeek(p.id)} />)}
        </div>
      )}
      {peeked && <PlaylistDetail p={peeked} onClose={() => setPeek(null)} />}
    </React.Fragment>
  );
}

// The facts a playlist row holds, in one line: "28 tracks · 2h 14m · 75–95 BPM". Only what's there.
function plFacts(p) {
  const out = [];
  if (p.trackCount != null) out.push(p.trackCount + (p.trackCount === 1 ? " track" : " tracks"));
  if (p.duration) out.push(p.duration);
  if (p.bpm) out.push(p.bpm + " BPM");
  return out.join(" · ");
}

function PlaylistCard({ p, onPeek }) {
  const c = React.useContext(PlaylistCtx);
  const who = plWhoHears(p, c.programs);
  const heard = plWhoHearsText(who, c.role);
  const quiet = heard === "Not playing anywhere yet";
  const facts = plFacts(p);
  return (
    <div data-pl-card={p.id} style={{ display: "flex", flexDirection: "column", minWidth: 0 }}><Card style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", flex: 1 }}>
      <div aria-hidden="true" style={{ height: 64, background: p.cover, position: "relative" }}>
        <div style={{ position: "absolute", left: 12, bottom: 10, display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(0,0,0,0.45)", padding: "4px 9px", borderRadius: 999, fontSize: 9.5, fontFamily: PL_MONO, letterSpacing: "0.1em", color: "#f2ede4" }}>
          <ProviderMark kind={p.provider} size={11} />{p.provider === "apple" ? "APPLE MUSIC" : "SPOTIFY"}
        </div>
      </div>
      <div style={{ padding: "12px 14px 14px", display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
        <button type="button" data-pl-peek onClick={onPeek} style={{ all: "unset", cursor: "pointer", fontFamily: serif, fontSize: 17, lineHeight: 1.15, letterSpacing: "-0.01em", overflowWrap: "anywhere" }}>{p.name}</button>
        <div data-pl-facts style={{ fontFamily: facts ? PL_MONO : sans, fontSize: facts ? 10.5 : 11.5, color: PL_INK2, letterSpacing: facts ? "0.04em" : 0, minHeight: 14 }}>{facts || "Open it to add tracks, length and tempo"}</div>
        <div style={{ fontSize: 12, color: PL_INK2 }}>On {plProviderName(p.provider)}</div>
        <div data-pl-who style={{ fontSize: 12, color: quiet ? PL_INK3 : INK }}>{heard}</div>
        <div style={{ flex: 1 }} />
        <button type="button" data-pl-attach onClick={() => c.openAttach({ playlistId: p.id })} style={{ ...pillGhost, padding: "7px 14px", fontSize: 12, alignSelf: "flex-start", marginTop: 4 }}>Attach</button>
      </div>
    </Card></div>
  );
}

function PlaylistDetail({ p, onClose }) {
  const c = React.useContext(PlaylistCtx);
  const who = plWhoHears(p, c.programs);
  const facts = plFacts(p);
  React.useEffect(() => {
    const key = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);
  const names = (ids) => ids.map((id) => { const cl = c.roster.clients && c.roster.clients.find((x) => x.id === id); return cl ? cl.name : null; });
  return (
    <div onClick={onClose} style={modalOverlay}>
      <div role="dialog" aria-modal="true" aria-label={p.name} data-pl-detail onClick={(e) => e.stopPropagation()} style={{ ...modalCard, maxWidth: 560, padding: 0 }}>
        <div style={{ height: 120, background: p.cover, padding: 20, display: "flex", alignItems: "flex-end", position: "relative" }}>
          <button type="button" aria-label="Close" onClick={onClose} style={{ position: "absolute", top: 14, right: 14, background: "rgba(0,0,0,0.4)", border: 0, color: "#f2ede4", width: 32, height: 32, borderRadius: 999, cursor: "pointer", fontSize: 16 }}>×</button>
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(0,0,0,0.4)", padding: "4px 9px", borderRadius: 999, fontSize: 10, fontFamily: PL_MONO, letterSpacing: "0.1em", color: "#f2ede4", marginBottom: 8 }}>
              <ProviderMark kind={p.provider} size={11} />{p.provider === "apple" ? "APPLE MUSIC" : "SPOTIFY"}
            </div>
            <h3 style={{ fontFamily: serif, fontSize: 28, fontWeight: 400, margin: 0, letterSpacing: "-0.02em", color: "#f2ede4" }}>{p.name}</h3>
          </div>
        </div>
        <div style={{ padding: 22 }}>
          {facts && <div style={{ fontFamily: PL_MONO, fontSize: 11, color: PL_INK2, marginBottom: 12 }}>{facts}</div>}
          {p.note && <div style={{ fontSize: 14, lineHeight: 1.55, marginBottom: 16, fontStyle: "italic" }}>"{p.note}"</div>}
          <div style={{ ...plLabel, marginBottom: 8 }}>PLAYS ON</div>
          <div data-pl-plays-on style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 18, fontSize: 13 }}>
            {who.all && <div>Every client · their {c.role === "nutritionist" ? "Eat" : "Train"} page</div>}
            {!who.all && who.clients.length > 0 && <div>Sent to {names(who.clients).filter(Boolean).join(", ") || who.clients.length + " clients"}{names(who.clients).some((n) => !n) && names(who.clients).some(Boolean) ? " and others" : ""}</div>}
            {who.programs.map((x) => <div key={x.program.id}>{x.program.name} · {x.days.map((d) => d.name).join(", ")}{x.program.clients == null ? "" : " · " + x.program.clients + (x.program.clients === 1 ? " client" : " clients")}</div>)}
            {!who.all && !who.clients.length && !who.programs.length && <div style={{ color: PL_INK3 }}>Not playing anywhere yet.</div>}
          </div>
          <PlTrackList p={p} />
          <div style={{ display: "flex", gap: 8, marginTop: 18, flexWrap: "wrap" }}>
            <button type="button" onClick={() => { onClose(); c.openAttach({ playlistId: p.id }); }} style={{ ...pillPrimary, flex: 1 }}>Attach</button>
            <button type="button" onClick={() => { onClose(); c.openBuilder(p.id); }} style={pillGhost}>Edit</button>
            {p.url && <a href={p.url} target="_blank" rel="noopener noreferrer" style={{ ...pillGhost, textDecoration: "none" }}>Open in {plProviderName(p.provider)} ↗</a>}
          </div>
        </div>
      </div>
    </div>
  );
}

// What the track list says beside the tracks it shows (2026-11-05): the builder repeated a
// playlist's few sample tracks until the list was as long as its count, so a 28-track playlist
// showed five tracks over and over. It shows the tracks it has, once each, and this line says how
// many the playlist really holds and where the rest are. Null when every track is shown.
function plTrackListNote(shown, total, provider) {
  const n = Number(total) || 0;
  if (shown >= n) return null;
  const where = provider === "apple" ? "Apple Music" : "Spotify";
  return (shown ? shown + " of " + n + " tracks shown." : n + (n === 1 ? " track" : " tracks") + " in this playlist.") + " The full list is in " + where + ".";
}

// The tracks a playlist has here, once each. A saved playlist holds no track list (only its count),
// so it shows the note alone; the sample playlists in the preview show their few sample tracks.
function PlTrackList({ p }) {
  // The tracks it has, once each, never more than the playlist holds; the count is the playlist's own.
  const trackTotal = Number(p.trackCount) || 0;
  const sample = Array.isArray(p.sampleTracks) ? p.sampleTracks : [];
  const tracks = trackTotal > 0 ? sample.slice(0, trackTotal) : sample;
  const trackNote = plTrackListNote(tracks.length, trackTotal, p.provider);
  if (!tracks.length && !trackNote) return null;
  return (
    <div data-pl-tracks>
      <div style={{ ...plLabel, marginBottom: 8 }}>TRACKS</div>
      <div style={{ background: "rgba(var(--sh-ink-rgb, 242,237,228),0.03)", borderRadius: 8, overflow: "hidden" }}>
        {tracks.map(([artist, title, dur], i) => (
          <div key={i} data-pl-track style={{ display: "grid", gridTemplateColumns: "28px 1fr auto", gap: 10, padding: "9px 14px", alignItems: "center", borderTop: i === 0 ? "none" : "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.05)" }}>
            <div style={{ fontFamily: PL_MONO, fontSize: 10.5, color: PL_INK3 }}>{String(i + 1).padStart(2, "0")}</div>
            <div>
              <div style={{ fontSize: 12.5, marginBottom: 2 }}>{title}</div>
              <div style={{ fontSize: 10.5, color: PL_INK2 }}>{artist}</div>
            </div>
            <div style={{ fontFamily: PL_MONO, fontSize: 10.5, color: PL_INK3 }}>{dur}</div>
          </div>
        ))}
        {trackNote && <div data-track-note style={{ padding: "11px 14px", borderTop: tracks.length ? "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.05)" : "none", fontSize: 11.5, lineHeight: 1.5, color: PL_INK2 }}>{trackNote}</div>}
      </div>
    </div>
  );
}

function NewPlaylistDialog({ onClose }) {
  const ctx = React.useContext(PlaylistCtx);
  const [url, setUrl] = React.useState("");
  const [name, setName] = React.useState("");
  const [note, setNote] = React.useState("");
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [pickProvider, setPickProvider] = React.useState(null);
  // Two library sources — Spotify (server OAuth) and Apple Music (in-page MusicKit).
  // Both degrade gracefully to the paste-a-link path, which works for everyone.
  const [mode, setMode] = React.useState("form"); // 'form' | 'spotify' | 'apple'
  const [spotItems, setSpotItems] = React.useState(null);
  const [spotBusy, setSpotBusy] = React.useState(false);
  const [spotErr, setSpotErr] = React.useState("");
  const [spotConnected, setSpotConnected] = React.useState(null);
  const [appleItems, setAppleItems] = React.useState(null);
  const [appleBusy, setAppleBusy] = React.useState(false);
  const [appleErr, setAppleErr] = React.useState("");
  const [appleConnected, setAppleConnected] = React.useState(null);
  React.useEffect(() => {
    const key = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);
  const doImport = async () => {
    if (!url.trim() && !name.trim()) { setErr("Paste a playlist link or give it a name."); return; }
    setBusy(true); setErr("");
    const r = await ctx.importSoundtrack({ name, url, note, provider: pickProvider });
    setBusy(false);
    if (r && r.ok) onClose(); else setErr((r && r.error) || "Couldn't save the playlist. Try again.");
  };
  const loadSpotify = async () => {
    setSpotBusy(true); setSpotErr("");
    try {
      const res = await fetch("/api/integrations/spotify/playlists", { credentials: "include", cache: "no-store" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (d && d.connected === false) { setSpotConnected(false); }
        else { setSpotErr("Library import is still rolling out for your account — paste a link below instead."); }
        setMode("spotify");
        return;
      }
      setSpotConnected(true);
      setSpotItems(Array.isArray(d.playlists) ? d.playlists : []);
      setMode("spotify");
    } catch (_) {
      setSpotErr("Couldn't reach Spotify — paste a link below instead.");
      setMode("spotify");
    } finally { setSpotBusy(false); }
  };
  const loadApple = async () => {
    setAppleBusy(true); setAppleErr("");
    try {
      const tokRes = await fetch("/api/integrations/apple-music/developer-token", { cache: "no-store" });
      const tok = await tokRes.json().catch(() => ({}));
      if (!tokRes.ok || !tok.developerToken) { setAppleErr("Apple Music isn't set up yet — paste a link below instead."); setMode("apple"); return; }
      const MK = await loadMusicKit();
      try { await MK.configure({ developerToken: tok.developerToken, app: { name: "Shape", build: "1.0.0" } }); } catch (_) { /* may already be configured */ }
      const music = MK.getInstance();
      const userToken = await music.authorize();
      if (!userToken) { setAppleConnected(false); setMode("apple"); return; }
      setAppleConnected(true);
      // Persist the connection so it shows as linked on /integrations too.
      fetch("/api/integrations/apple-music/connect", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ musicUserToken: userToken, storefront: music.storefrontId || null }) }).catch(() => {});
      // Apple has no server playlists route — list the library client-side via MusicKit.
      let rows = [];
      try {
        if (music.api && music.api.music) {
          const result = await music.api.music("v1/me/library/playlists", { limit: 100 });
          rows = (result && result.data && result.data.data) || [];
        } else if (music.api && music.api.library && music.api.library.playlists) {
          const r = await music.api.library.playlists();
          rows = Array.isArray(r) ? r : (r && r.data) || [];
        }
      } catch (_) { rows = []; }
      setAppleItems(rows.map(pl => {
        const at = pl.attributes || {};
        const art = at.artwork && at.artwork.url ? at.artwork.url.replace("{w}", "88").replace("{h}", "88") : null;
        return { id: pl.id, name: at.name || "Playlist", tracks: at.trackCount != null ? at.trackCount : "", url: at.url || ("https://music.apple.com/library/playlist/" + pl.id), image: art };
      }));
      setMode("apple");
    } catch (_) {
      setAppleErr("Couldn't reach Apple Music — paste a link below instead.");
      setMode("apple");
    } finally { setAppleBusy(false); }
  };
  const pick = (pl, prov) => { setUrl(pl.url || ""); setName(pl.name || ""); setPickProvider(prov || null); setMode("form"); };
  const connectHref = "/api/integrations/spotify/authorize?return=" + encodeURIComponent(typeof window !== "undefined" ? (window.location.pathname + window.location.search + window.location.hash) : "/newdesign/TrainerApp.html#playlists");
  const greenDot = { width: 8, height: 8, borderRadius: 999, background: "#1DB954", display: "inline-block" };
  const redDot = { width: 8, height: 8, borderRadius: 999, background: "#fa243c", display: "inline-block" };
  // The picker sub-view (mode !== 'form') is shared by both providers.
  const isApple = mode === "apple";
  const pItems = isApple ? appleItems : spotItems;
  const pConnected = isApple ? appleConnected : spotConnected;
  const pErr = isApple ? appleErr : spotErr;
  const pLabel = isApple ? "APPLE MUSIC" : "SPOTIFY";
  const pName = isApple ? "Apple Music" : "Spotify";
  const pAccent = isApple ? "#fb5c74" : TEAL_BRIGHT;
  return (
    <div onClick={onClose} style={modalOverlay}>
      <div role="dialog" aria-modal="true" aria-label="Add a playlist" data-pl-new onClick={e => e.stopPropagation()} style={{ ...modalCard, maxWidth: 520 }}>
        {mode !== "form" ? (
          <React.Fragment>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontFamily: PL_MONO, fontSize: 10.5, letterSpacing: "0.14em", color: pAccent }}>FROM YOUR {pLabel}</div>
              <button type="button" onClick={() => setMode("form")} style={{ all: "unset", cursor: "pointer", fontFamily: PL_MONO, fontSize: 10, letterSpacing: "0.12em", color: "rgba(var(--sh-ink-rgb, 242,237,228),0.7)" }}>← BACK</button>
            </div>
            {pConnected === false ? (
              <React.Fragment>
                <h3 style={{ fontFamily: serif, fontSize: 26, margin: "2px 0 0", fontWeight: 400 }}>Connect {pName}</h3>
                <p style={{ fontSize: 13.5, color: "rgba(var(--sh-ink-rgb, 242,237,228),0.7)", lineHeight: 1.55, margin: "10px 0 18px" }}>Connect your {pName} to pick a playlist from your library. You can always paste a link instead.</p>
                {isApple
                  ? <button type="button" onClick={loadApple} disabled={appleBusy} style={{ ...pillPrimary, opacity: appleBusy ? 0.6 : 1 }}>{appleBusy ? "Connecting…" : "Connect Apple Music →"}</button>
                  : <a href={connectHref} style={{ ...pillPrimary, display: "inline-block", textDecoration: "none", textAlign: "center" }}>Connect Spotify →</a>}
              </React.Fragment>
            ) : pErr ? (
              <React.Fragment>
                <h3 style={{ fontFamily: serif, fontSize: 26, margin: "2px 0 0", fontWeight: 400 }}>Your playlists</h3>
                <p style={{ fontSize: 13.5, color: "rgba(var(--sh-ink-rgb, 242,237,228),0.7)", lineHeight: 1.55, margin: "10px 0 18px", fontStyle: "italic" }}>{pErr}</p>
                <button type="button" onClick={() => setMode("form")} style={{ ...pillGhost, width: "100%" }}>Paste a link instead</button>
              </React.Fragment>
            ) : (
              <React.Fragment>
                <h3 style={{ fontFamily: serif, fontSize: 26, margin: "2px 0 0", fontWeight: 400 }}>Your playlists</h3>
                <p style={{ fontSize: 12, color: PL_INK2, margin: "8px 0 14px" }}>{(pItems || []).length} playlist{(pItems || []).length === 1 ? "" : "s"} · pick one to import</p>
                <div style={{ maxHeight: 320, overflowY: "auto", margin: "0 -4px" }}>
                  {(pItems || []).length === 0 ? (
                    <div style={{ fontSize: 13.5, color: PL_INK2, fontStyle: "italic", padding: "8px 4px" }}>No playlists found in your {pName} library.</div>
                  ) : (pItems.map(pl => (
                    <button type="button" key={pl.id} onClick={() => pick(pl, isApple ? "apple" : "spotify")} style={{ all: "unset", cursor: "pointer", width: "100%", boxSizing: "border-box", display: "flex", alignItems: "center", gap: 12, padding: "9px 4px", borderTop: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.08)" }}>
                      <div style={{ width: 44, height: 44, borderRadius: 6, overflow: "hidden", flexShrink: 0, background: "rgba(var(--sh-ink-rgb, 242,237,228),0.06)" }}>{pl.image ? <img src={pl.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}</div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 14.5, fontWeight: 500, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{pl.name}</div>
                        <div style={{ fontFamily: PL_MONO, fontSize: 10, color: PL_INK2, marginTop: 2 }}>{pl.tracks !== "" && pl.tracks != null ? pl.tracks + " tracks" : "playlist"}{pl.owner ? " · " + pl.owner : ""}</div>
                      </div>
                      <span aria-hidden="true" style={{ color: pAccent, fontSize: 18 }}>＋</span>
                    </button>
                  )))}
                </div>
              </React.Fragment>
            )}
          </React.Fragment>
        ) : (
          <React.Fragment>
            <div style={{ fontFamily: PL_MONO, fontSize: 10.5, letterSpacing: "0.14em", color: TEAL_BRIGHT, marginBottom: 8 }}>NEW PLAYLIST</div>
            <h3 style={{ fontFamily: serif, fontSize: 28, margin: 0, fontWeight: 400 }}>Add a playlist</h3>
            {ctx.demo && <p data-pl-demo-note style={{ fontSize: 12.5, color: PL_INK2, margin: "8px 0 0" }}>This is the preview. Sign in as a coach to save playlists.</p>}
            <button type="button" onClick={loadSpotify} disabled={spotBusy}
              style={{ all: "unset", cursor: spotBusy ? "default" : "pointer", boxSizing: "border-box", width: "100%", marginTop: 14, padding: "12px 14px", borderRadius: 10, border: "1px solid rgba(var(--sh-accent2-rgb, 10,197,168),0.4)", background: "rgba(var(--sh-accent2-rgb, 10,197,168),0.06)", display: "flex", alignItems: "center", gap: 10, opacity: spotBusy ? 0.6 : 1 }}>
              <span style={greenDot} />
              <span style={{ fontSize: 13.5, fontWeight: 500, color: INK }}>{spotBusy ? "Loading…" : "Pick from your Spotify"}</span>
              <span style={{ marginLeft: "auto", fontFamily: PL_MONO, fontSize: 9, letterSpacing: "0.1em", color: PL_INK2, border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.18)", borderRadius: 999, padding: "2px 7px" }}>BETA</span>
            </button>
            <button type="button" onClick={loadApple} disabled={appleBusy}
              style={{ all: "unset", cursor: appleBusy ? "default" : "pointer", boxSizing: "border-box", width: "100%", marginTop: 8, padding: "12px 14px", borderRadius: 10, border: "1px solid rgba(250,36,60,0.4)", background: "rgba(250,36,60,0.06)", display: "flex", alignItems: "center", gap: 10, opacity: appleBusy ? 0.6 : 1 }}>
              <span style={redDot} />
              <span style={{ fontSize: 13.5, fontWeight: 500, color: INK }}>{appleBusy ? "Loading…" : "Pick from your Apple Music"}</span>
              <span style={{ marginLeft: "auto", fontFamily: PL_MONO, fontSize: 9, letterSpacing: "0.1em", color: PL_INK2, border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.18)", borderRadius: 999, padding: "2px 7px" }}>BETA</span>
            </button>
            <div style={{ fontFamily: PL_MONO, fontSize: 9.5, letterSpacing: "0.12em", color: PL_INK3, textAlign: "center", margin: "12px 0" }}>OR PASTE A LINK</div>
            <label style={lbl}>Playlist URL<input value={url} onChange={e => { setUrl(e.target.value); setPickProvider(null); }} placeholder="Spotify or Apple Music playlist link" style={{ ...input, marginTop: 6 }} /></label>
            <label style={lbl}>Name (optional override)<input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Heavy Squat Day" style={{ ...input, marginTop: 6 }} /></label>
            <label style={lbl}>Note for clients<input value={note} maxLength={60} onChange={e => setNote(e.target.value)} placeholder="What's the vibe? Any cues?" style={{ ...input, marginTop: 6, fontFamily: sans }} /></label>
            {err && <div role="alert" data-pl-error style={{ marginTop: 12, fontSize: 13, color: PL_RUST }}>{err}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
              <button type="button" onClick={doImport} disabled={busy} style={{ ...pillPrimary, flex: 1, opacity: busy ? 0.6 : 1 }}>{busy ? "Saving…" : "Save playlist"}</button>
              <button type="button" onClick={onClose} style={pillGhost}>Cancel</button>
            </div>
          </React.Fragment>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// B · Attach: a matrix, grouped by program, with days that need music flagged
// ────────────────────────────────────────────────────────────
function AttachMatrix({ focus }) {
  const c = React.useContext(PlaylistCtx);
  const wrap = React.useRef(null);
  // ⚠ ONE WRITE AT A TIME PER PROGRAM AND PER PLAYLIST. A program day's write is held to the
  // revision the page read, and a send replaces the playlist's whole `attached`: a second click
  // while the first is in flight would send a stale revision (refused) or drop the first change.
  const [busy, setBusy] = React.useState([]);
  const playlists = c.playlists;
  const cols = playlists.length;
  React.useEffect(() => {
    if (!focus || !wrap.current) return;
    const sel = focus.playlistId ? `[data-pl-col="${focus.playlistId}"]` : `[data-pl-day="${focus.programId}:${focus.dayIndex}"]`;
    const el = wrap.current.querySelector(sel);
    if (el && el.scrollIntoView) { try { el.scrollIntoView({ block: "center", inline: "center" }); } catch (e) {} }
  }, [focus]);
  if (!cols) return <Card style={{ padding: 22 }}><div data-pl-empty style={{ fontSize: 14 }}>Save a playlist first, then attach it here.</div></Card>;
  const run = async (locks, fn) => {
    if (locks.some((l) => busy.includes(l))) return;
    setBusy((b) => [...b, ...locks]);
    try { await fn(); } finally { setBusy((b) => b.filter((l) => !locks.includes(l))); }
  };
  const held = (locks) => locks.some((l) => busy.includes(l));
  const colOn = (p) => focus && focus.playlistId === p.id;
  const header = (
    <thead>
      <tr>
        <th style={{ ...thFirst, top: 0, position: "sticky", zIndex: 3 }}>{c.role === "nutritionist" ? "CLIENTS" : "PROGRAM DAYS"}</th>
        {playlists.map((p) => (
          <th key={p.id} data-pl-col={p.id} style={{ ...th, top: 0, position: "sticky", zIndex: 2, minWidth: 92, maxWidth: 132, boxShadow: colOn(p) ? `inset 0 -2px 0 ${p.accent}` : undefined }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
              <div aria-hidden="true" style={{ width: 28, height: 28, borderRadius: 6, background: p.cover }} />
              <div title={p.name} style={{ fontSize: 11, fontFamily: sans, fontWeight: 500, color: INK, textAlign: "center", lineHeight: 1.25, whiteSpace: "normal", textTransform: "none", letterSpacing: 0, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.name}</div>
              <div style={{ fontSize: 9.5, color: PL_INK3, fontFamily: PL_MONO, letterSpacing: "0.06em", textTransform: "none" }}>{plProviderName(p.provider)}</div>
            </div>
          </th>
        ))}
      </tr>
    </thead>
  );
  // A cell: filled reads "✓ N" in the playlist's colour; empty is ＋ (dashed where the day needs music).
  const cell = (key, locks, on, label, count, needs, onClick, accent) => (
    <td key={key} style={td}>
      <button type="button" aria-pressed={on === true} aria-label={label} disabled={held(locks)} onClick={() => run(locks, onClick)} data-pl-cell={key} data-on={on === true ? "1" : on === "some" ? "some" : "0"}
        style={{ minWidth: 56, height: 32, padding: "0 10px", borderRadius: 8, cursor: held(locks) ? "default" : "pointer", fontFamily: PL_MONO, fontSize: 11, fontWeight: 600, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
          border: on ? `1.5px solid ${accent}` : needs ? `1.5px dashed ${PL_RUST_DASH}` : "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.12)",
          background: on === true ? accent : "transparent", color: on === true ? "#fff" : on === "some" ? INK : needs ? PL_RUST : PL_INK3, opacity: held(locks) ? 0.5 : 1 }}>
        {on === true ? "✓" + (count == null ? "" : " " + count) : on === "some" ? "✓ some weeks" : "＋"}
      </button>
    </td>
  );
  const programSection = c.role === "trainer" && (
    c.programsState === "loading" ? <tbody><tr><td colSpan={cols + 1} style={{ ...tdFirst, color: PL_INK2 }}>Reading your programs…</td></tr></tbody>
    : c.programsState === "unread" ? <tbody><tr><td colSpan={cols + 1} data-pl-programs-unread style={{ ...tdFirst, color: PL_INK2 }}>Your programs couldn't be read. Reload to try again.</td></tr></tbody>
    : !c.programs.length ? <tbody><tr><td colSpan={cols + 1} style={{ ...tdFirst, color: PL_INK2 }}>No programs yet. Build one in Programs, then put playlists on its days here.</td></tr></tbody>
    : c.programs.map((prog) => (
      <tbody key={prog.id} data-pl-program={prog.id}>
        <tr>
          <th scope="rowgroup" colSpan={cols + 1} style={{ ...tdFirst, position: "sticky", left: 0, textAlign: "left", fontWeight: 500, background: "var(--sh-ground, #1a1612)", paddingTop: 18 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {prog.type
                ? <span style={{ ...plChip, color: INK }}><span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 999, background: prog.type.color }} />{prog.type.label}</span>
                : <span style={plChip}>No type</span>}
              <span style={{ fontSize: 14 }}>{prog.name}</span>
              <span style={{ fontFamily: PL_MONO, fontSize: 10.5, color: PL_INK2 }}>{prog.clients == null ? "clients couldn't be read" : prog.clients + (prog.clients === 1 ? " client" : " clients")}</span>
            </span>
          </th>
        </tr>
        {prog.days.map((d) => {
          const music = (d.playlists || []).some((x) => x.weeksWith >= d.weeks);
          const most = (d.playlists || []).reduce((m, x) => Math.max(m, x.weeksWith), 0);
          const needs = !music && (prog.clients == null || prog.clients > 0);
          const lifted = focus && focus.programId === prog.id && focus.dayIndex === d.index;
          return (
            <tr key={d.index} data-pl-day={prog.id + ":" + d.index} data-needs={needs ? "1" : "0"} style={lifted ? { boxShadow: "var(--lift-2, 0 4px 14px rgba(0,0,0,0.14))" } : undefined}>
              <td style={{ ...tdFirst, borderLeft: needs ? `3px solid ${PL_RUST}` : "3px solid transparent" }}>
                <div style={{ fontSize: 13.5, fontWeight: 500 }}>{d.name}</div>
                {needs && <div data-pl-no-music style={{ fontSize: 11, color: PL_RUST, fontFamily: PL_MONO, marginTop: 3 }}>{most > 0 ? "Music in " + most + " of " + d.weeks + " weeks" : "No music"}{prog.clients ? " · " + prog.clients + (prog.clients === 1 ? " client" : " clients") : ""}</div>}
                {d.weeks > 1 && !needs && <div style={{ fontSize: 10.5, color: PL_INK3, fontFamily: PL_MONO, marginTop: 2 }}>{d.weeks} weeks</div>}
              </td>
              {playlists.map((p) => {
                const on = plDayHas(d, p.name);
                const key = prog.id + ":" + d.index + ":" + p.id;
                const label = (on === true ? "Take " + p.name + " off " : "Put " + p.name + " on ") + prog.name + " · " + d.name;
                return cell(key, ["prog:" + prog.id], on, label, prog.clients, needs, () => c.setDay(prog, d.index, on === true ? null : p), p.accent);
              })}
            </tr>
          );
        })}
      </tbody>
    ))
  );
  const roster = c.roster;
  const clientRows = roster.state === "ready" ? roster.clients : [];
  const sendSection = (
    <tbody data-pl-sends>
      <tr>
        <th scope="rowgroup" colSpan={cols + 1} style={{ ...tdFirst, textAlign: "left", fontWeight: 500, paddingTop: 18 }}>
          <span style={{ fontSize: 14 }}>Sent to clients</span>
          <span style={{ fontSize: 12, color: PL_INK2, marginLeft: 10, fontWeight: 400 }}>on their {c.role === "nutritionist" ? "Eat" : "Train"} page</span>
        </th>
      </tr>
      <tr data-pl-send="all">
        <td style={tdFirst}><div style={{ fontSize: 13.5, fontWeight: 500 }}>Every client</div></td>
        {playlists.map((p) => { const on = plIsSentTo(p, "all"); const key = "all:" + p.id; return cell(key, ["pl:" + p.id], on, (on ? "Stop sending " : "Send ") + p.name + " to every client", null, false, () => c.toggleSent(p, { id: "all" }), p.accent); })}
      </tr>
      {roster.state === "loading" && <tr><td colSpan={cols + 1} style={{ ...tdFirst, color: PL_INK2 }}>Reading your clients…</td></tr>}
      {roster.state === "unread" && <tr><td colSpan={cols + 1} data-pl-roster-unread style={{ ...tdFirst, color: PL_INK2 }}>Your clients couldn't be read, so one-by-one sends aren't shown.</td></tr>}
      {clientRows.map((cl) => (
        <tr key={cl.id} data-pl-send={cl.id}>
          <td style={tdFirst}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
              {typeof DashClientGem === "function" && <DashClientGem points={cl.points} title={cl.name} />}{cl.name}
            </span>
          </td>
          {playlists.map((p) => { const on = plIsSentTo(p, cl.id); const key = cl.id + ":" + p.id; return cell(key, ["pl:" + p.id], on, (on ? "Stop sending " : "Send ") + p.name + " to " + cl.name, null, false, () => c.toggleSent(p, cl), p.accent); })}
        </tr>
      ))}
    </tbody>
  );
  return (
    <Card style={{ padding: 0 }}>
      <div style={{ padding: "16px 22px", borderBottom: `1px solid ${PL_LINE}` }}>
        <div style={{ fontFamily: serif, fontSize: 20, fontWeight: 400 }}>{c.role === "nutritionist" ? "Clients × playlists" : "Program days × playlists"}</div>
        <div style={{ fontSize: 12.5, color: PL_INK2, marginTop: 4, lineHeight: 1.5 }}>
          {c.role === "nutritionist"
            ? "A playlist you send shows on the client's Eat page and opens in their own Spotify or Apple Music. Meal plans don't carry a playlist."
            : "A day plays one playlist, every week of its program. The client sees its name on that day's session from the next time you assign the program; a session already on a calendar keeps what it was sent with. ✓ N is the clients on that program. To have it open in their own app, send it to them below."}
        </div>
      </div>
      <div ref={wrap} data-pl-matrix style={{ overflow: "auto", maxHeight: PL_MATRIX_MAX_H }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 12.5 }}>
          {header}
          {programSection}
          {sendSection}
        </table>
      </div>
    </Card>
  );
}

const th = { padding: "14px 10px", textAlign: "center", fontFamily: PL_MONO, fontSize: 10.5, letterSpacing: "0.12em", color: PL_INK2, borderBottom: `1px solid ${PL_LINE}`, verticalAlign: "bottom", background: "var(--sh-ground, #1a1612)" };
const thFirst = { ...th, textAlign: "left", minWidth: 180, paddingLeft: 22, left: 0 };
const td = { padding: "8px 8px", borderTop: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.05)", textAlign: "center" };
const tdFirst = { padding: "12px 22px", borderTop: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.05)", position: "sticky", left: 0, background: "var(--sh-ground, #1a1612)", zIndex: 1, minWidth: 180 };
const plLabel = { fontSize: 10.5, fontFamily: PL_MONO, letterSpacing: "0.12em", color: PL_INK2 };

// ────────────────────────────────────────────────────────────
// C · Builder: edit one playlist
// ────────────────────────────────────────────────────────────
function BuilderDrawer({ selectedId, setSelectedId }) {
  const c = React.useContext(PlaylistCtx);
  const items = c.playlists;
  const active = items.find((x) => x.id === selectedId) || items[0] || null;
  if (!items.length) return <Card style={{ padding: 22 }}><div data-pl-empty style={{ fontSize: 14, marginBottom: 12 }}>No playlists yet.</div><button type="button" onClick={() => c.setAdding(true)} style={pillPrimary}>＋ New playlist</button></Card>;
  return (
    <div className="pl-builder" style={{ display: "grid", gridTemplateColumns: "minmax(220px, 300px) minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
      <div role="listbox" aria-label="Your playlists" style={{ border: `1px solid ${PL_LINE}`, borderRadius: 10, overflow: "hidden" }}>
        {items.map((p) => {
          const on = active && active.id === p.id;
          return (
            <button type="button" role="option" aria-selected={on} key={p.id} data-pl-pick={p.id} onClick={() => setSelectedId(p.id)}
              style={{ all: "unset", display: "grid", gridTemplateColumns: "36px 1fr", gap: 12, padding: "11px 14px", width: "100%", boxSizing: "border-box", cursor: "pointer", background: on ? "rgba(var(--sh-ink-rgb, 242,237,228),0.06)" : "transparent", borderBottom: `1px solid ${PL_LINE}`, alignItems: "center" }}>
              <div aria-hidden="true" style={{ width: 36, height: 36, borderRadius: 6, background: p.cover }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                <div style={{ fontSize: 10.5, color: PL_INK2, fontFamily: PL_MONO }}>{plProviderName(p.provider)}{p.trackCount != null ? " · " + p.trackCount + " tracks" : ""}</div>
              </div>
            </button>
          );
        })}
      </div>
      {active && <BuilderDetailPane key={active.id} p={active} />}
    </div>
  );
}

function BuilderDetailPane({ p }) {
  const c = React.useContext(PlaylistCtx);
  const [draft, setDraft] = React.useState({ name: p.name, bpm: p.bpm || "", duration: p.duration || "", note: p.note || "", url: p.url || "" });
  const [state, setState] = React.useState({ busy: false, msg: "", error: false });
  const [menu, setMenu] = React.useState(false);
  const menuRef = React.useRef(null);
  React.useEffect(() => {
    if (!menu) return undefined;
    const down = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenu(false); };
    const key = (e) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("mousedown", down); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [menu]);
  const dirty = draft.name.trim() !== p.name || draft.bpm.trim() !== (p.bpm || "") || draft.duration.trim() !== (p.duration || "") || draft.note.trim() !== (p.note || "") || draft.url.trim() !== (p.url || "");
  const who = plWhoHears(p, c.programs);
  // A program day names its playlist (day.playlist.name): renaming here doesn't rename it there.
  const dayCount = who.programs.reduce((s, x) => s + x.days.length, 0);
  const renamed = draft.name.trim() && draft.name.trim() !== p.name && dayCount > 0;
  const save = async () => {
    if (!draft.name.trim()) { setState({ busy: false, msg: "A playlist needs a name.", error: true }); return; }
    setState({ busy: true, msg: "", error: false });
    const r = await c.savePlaylist(p, { name: draft.name.trim(), bpm: draft.bpm.trim(), duration: draft.duration.trim(), tag: draft.note.trim(), url: draft.url.trim() });
    setState(r.ok ? { busy: false, msg: c.demo ? "Changed in the preview only. Sign in to save." : "Saved.", error: false } : { busy: false, msg: r.error, error: true });
  };
  const remove = async () => {
    setMenu(false);
    const r = await c.deletePlaylist(p);
    if (r && r.error) setState({ busy: false, msg: r.error, error: true });
  };
  const field = (label, k, props) => (
    <label style={{ ...lbl, marginTop: 0 }}>{label}
      <input value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} style={{ ...input, marginTop: 6, ...(k === "url" ? {} : { fontFamily: sans, fontSize: 13.5 }) }} {...(props || {})} />
    </label>
  );
  return (
    <div data-pl-builder={p.id} style={{ minWidth: 0 }}><Card style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ height: 96, background: p.cover, padding: "16px 20px", display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(0,0,0,0.4)", padding: "4px 9px", borderRadius: 999, fontSize: 10, fontFamily: PL_MONO, letterSpacing: "0.1em", color: "#f2ede4", marginBottom: 6 }}>
            <ProviderMark kind={p.provider} size={11} />{p.provider === "apple" ? "APPLE MUSIC" : "SPOTIFY"}
          </div>
          <div style={{ fontFamily: serif, fontSize: 26, fontWeight: 400, letterSpacing: "-0.02em", color: "#f2ede4", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
        </div>
        {p.url && <a href={p.url} target="_blank" rel="noopener noreferrer" style={{ color: "#f2ede4", fontSize: 12.5, textDecoration: "none", background: "rgba(0,0,0,0.4)", padding: "7px 12px", borderRadius: 999, whiteSpace: "nowrap" }}>Open in {plProviderName(p.provider)} ↗</a>}
      </div>

      <div style={{ padding: 22 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 14, marginBottom: 20, fontSize: 10.5, fontFamily: PL_MONO, letterSpacing: "0.08em", color: PL_INK2 }}>
          <div><div data-pl-stat="tracks" style={{ color: INK, fontFamily: serif, fontSize: 22, marginBottom: 2 }}>{p.trackCount != null ? p.trackCount : "—"}</div>TRACKS</div>
          <div><div data-pl-stat="length" style={{ color: INK, fontFamily: serif, fontSize: 22, marginBottom: 2 }}>{p.duration || "—"}</div>LENGTH</div>
          <div><div data-pl-stat="tempo" style={{ color: INK, fontFamily: serif, fontSize: 22, marginBottom: 2 }}>{p.bpm || "—"}</div>TEMPO (BPM)</div>
        </div>

        <div className="pl-builder-cols" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 22 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {field("Name", "name", { maxLength: 160 })}
            {renamed && <div data-pl-rename-note style={{ fontSize: 12, color: PL_INK2, marginTop: -4 }}>{dayCount === 1 ? "1 program day shows" : dayCount + " program days show"} it as “{p.name}” and keep{dayCount === 1 ? "s" : ""} that name until you attach it again.</div>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {field("Tempo (BPM)", "bpm", { maxLength: 24, placeholder: "e.g. 120–140" })}
              {field("Length", "duration", { maxLength: 24, placeholder: "e.g. 58m" })}
            </div>
            {field("Note for clients", "note", { maxLength: 60, placeholder: "What's the vibe? Any cues?" })}
            {field(plProviderName(p.provider) + " link", "url", { maxLength: 500, placeholder: "https://…" })}
          </div>
          <div>
            <div style={{ ...plLabel, marginBottom: 8 }}>PLAYS ON</div>
            <div data-pl-plays-on style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 10 }}>
              {plWhoHearsText(who, c.role)}
              {who.programs.map((x) => <div key={x.program.id} style={{ color: PL_INK2, fontSize: 12.5 }}>{x.program.name} · {x.days.map((d) => d.name).join(", ")}</div>)}
            </div>
            <button type="button" onClick={() => c.openAttach({ playlistId: p.id })} style={{ ...plLinkBtn, marginBottom: 18 }}>Change where it plays →</button>
            <PlTrackList p={p} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 22, paddingTop: 18, borderTop: `1px solid ${PL_LINE}`, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" data-pl-save onClick={save} disabled={!dirty || state.busy} style={{ ...pillPrimary, opacity: !dirty || state.busy ? 0.5 : 1, cursor: !dirty || state.busy ? "default" : "pointer" }}>{state.busy ? "Saving…" : "Save"}</button>
          <div ref={menuRef} style={{ position: "relative" }}>
            <button type="button" aria-label="More for this playlist" aria-haspopup="menu" aria-expanded={menu} data-pl-more onClick={() => setMenu(!menu)} style={{ ...pillGhost, padding: "8px 14px" }}>⋯</button>
            {menu && (
              <div role="menu" style={{ position: "absolute", left: 0, bottom: "calc(100% + 6px)", minWidth: 180, background: "var(--sh-ground, #1a1612)", border: `1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.14)`, borderRadius: 10, boxShadow: "0 14px 34px rgba(0,0,0,0.35)", padding: 6, zIndex: 5 }}>
                <button type="button" role="menuitem" data-pl-delete onClick={remove} style={{ all: "unset", cursor: "pointer", display: "block", width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 6, fontSize: 13, color: PL_RUST }}>Delete playlist…</button>
              </div>
            )}
          </div>
          {state.msg && <span role="status" data-pl-save-msg style={{ fontSize: 12.5, color: state.error ? PL_RUST : PL_INK2 }}>{state.msg}</span>}
        </div>
      </div>
    </Card></div>
  );
}

// ────────────────────────────────────────────────────────────
// Shared bits
// ────────────────────────────────────────────────────────────
function PlaylistTabs({ value, onChange, flag }) {
  const c = React.useContext(PlaylistCtx);
  const tabs = [
    { id: "library", label: "Library" },
    { id: "matrix", label: "Attach" },
    { id: "builder", label: "Builder" },
  ];
  return (
    <div role="tablist" aria-label="Playlists views" style={{ display: "flex", gap: 4, marginBottom: 18, borderBottom: `1px solid ${PL_LINE}` }}>
      {tabs.map((t) => {
        const on = value === t.id;
        return (
          <button type="button" role="tab" aria-selected={on} key={t.id} data-pl-tab={t.id} onClick={() => onChange(t.id)}
            style={{ all: "unset", cursor: "pointer", padding: "11px 16px", display: "inline-flex", alignItems: "center", gap: 8, borderBottom: `2px solid ${on ? TEAL_BRIGHT : "transparent"}`, marginBottom: -1, fontFamily: sans, fontSize: 14, fontWeight: 500, color: on ? INK : "rgba(var(--sh-ink-rgb, 242,237,228),0.7)" }}>
            {t.label}
            {t.id === "matrix" && flag > 0 && c.role === "trainer" && <span data-pl-tab-flag style={{ ...plChip, padding: "1px 7px", borderColor: PL_RUST_EDGE, color: PL_RUST }}>{flag} no music</span>}
          </button>
        );
      })}
    </div>
  );
}

function SearchBar({ query, setQuery, placeholder }) {
  return (
    <div style={{ position: "relative", marginBottom: 16 }}>
      <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(var(--sh-ink-rgb, 242,237,228),0.4)" strokeWidth="2" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }}>
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <input aria-label={placeholder} value={query} onChange={e => setQuery(e.target.value)} placeholder={placeholder}
        style={{ width: "100%", boxSizing: "border-box", background: "rgba(var(--sh-ink-rgb, 242,237,228),0.04)", border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.1)", borderRadius: 10, padding: "11px 14px 11px 40px", fontFamily: sans, fontSize: 13.5, color: INK, outline: "none" }} />
    </div>
  );
}

const modalOverlay = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 };
const modalCard = { background: "var(--sh-ground, #1a1612)", border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.1)", borderRadius: 14, width: "100%", padding: 28, maxHeight: "90vh", overflow: "auto", boxShadow: "0 40px 80px rgba(0,0,0,0.5)" };
const lbl = { display: "block", fontSize: 11, fontFamily: PL_MONO, letterSpacing: "0.12em", color: PL_INK2, marginBottom: 0, marginTop: 14 };
const input = { width: "100%", boxSizing: "border-box", background: "rgba(var(--sh-ink-rgb, 242,237,228),0.04)", border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.1)", borderRadius: 8, padding: "10px 14px", fontFamily: PL_MONO, fontSize: 13, color: INK, outline: "none", letterSpacing: 0 };

Object.assign(window, { PlaylistPage });
