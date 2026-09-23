// Reusable floating chat widget with optional tabs.
// Drop into any dashboard page:
//   <ChatWidget tabs={[{id, label, eyebrow, title, threads}, ...]} />
//   or legacy:  <ChatWidget threads={[...]} title="..." eyebrow="..." />

// ── Avatar + tier helpers (mirror the mobile app's chat avatars) ─────────────
// Tier ladders — clients: Base/Tempo/Form/Peak/Legend; coaches climb their own
// ladder: Certified/Pro/Elite/Master/Icon. Same names + colors as the rest of
// the app (mobile + profiles), so a person's tier reads identically everywhere.
const CW_TIER_COLORS = {
  raw: "#5fa96e", base: "#5fa96e", tempo: "var(--sh-gold, #d8a23a)", form: "#e0463c", peak: "#8fe3e6", legend: "var(--sh-accent3, #34d6c5)",
  certified: "#5fa96e", pro: "var(--sh-gold, #d8a23a)", elite: "#e0463c", master: "#8fe3e6", icon: "var(--sh-accent3, #34d6c5)",
};
const CW_CLIENT_LADDER = ["Base", "Tempo", "Form", "Peak", "Legend"];
const CW_COACH_LADDER = ["Certified", "Pro", "Elite", "Master", "Icon"];
function cwTierColor(tier) { return CW_TIER_COLORS[String(tier || "").toLowerCase().trim()] || "var(--sh-gold, #d8a23a)"; }
function cwInitials(name) {
  return String(name || "").replace(/^#\s*/, "").split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join("").toUpperCase() || "?";
}
// Pull the literal digits out of a colour that may be a paper token (`TEAL`,
// `TEAL_BRIGHT` and `INK` are pageShell's module-scope constants and are
// `var(--sh-…, #hex)` now). See the note on ssShade in pageShell.jsx: a token
// reaching parseInt yields NaN, and `NaN >> 16 & 255` is 0 — valid CSS, black.
function cwHexDigits(hex, dflt) {
  const s = String(hex || dflt);
  const m = s.match(/#([0-9a-fA-F]{3,6})/);
  return (m ? m[1] : s.replace("#", ""));
}
// An alpha CAN follow the paper, so it is composed through the token's `-rgb`
// twin rather than flattened to the literal — the same rule as ssAlpha in
// pageShell.jsx, and every --sh-* colour token declares a twin so this is sound
// whatever it is handed. cwShade below deliberately does NOT: CSS has no
// multiply, so a shade has to read the fallback.
function cwHexA(hex, a) {
  const s = String(hex || "");
  const tok = s.match(/var\(\s*(--[\w-]+)\s*,\s*#([0-9a-fA-F]{6})\s*\)/);
  if (tok) {
    const n = parseInt(tok[2], 16);
    return `rgba(var(${tok[1]}-rgb, ${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}), ${a})`;
  }
  const h = cwHexDigits(hex, "#888888");
  const d = h.length === 3 ? h.split("").map(x => x + x).join("") : h;
  const n = parseInt(d, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function cwShade(hex, f) { const h = cwHexDigits(hex, "#888888"); const s = h.length === 3 ? h.split("").map(x => x + x).join("") : h; const n = parseInt(s, 16); return `rgb(${Math.round(((n >> 16) & 255) * f)},${Math.round(((n >> 8) & 255) * f)},${Math.round((n & 255) * f)})`; }
// Presence-tier activity line (spec 2026-07-19): what the member is DOING now
// ('workout' | 'cooking') + minutes in, from the existing authenticated-read
// user_activity table. Presence info only — never set detail (that is the
// coach station's job, behind its own RLS).
// Known kinds ONLY. An unrecognised kind is absence, never a defaulted verb —
// rendering "In a workout" for a kind we don't understand fabricates a claim
// about what the member is doing (review: CodeRabbit, honest-data).
const CW_ACTIVITY_VERBS = { workout: "In a workout", cooking: "In the kitchen" };

function cwUseActivity(userId, open) {
  const [act, setAct] = React.useState(null);
  React.useEffect(() => {
    const sdb = window.shapeDb;
    const db = sdb && sdb.client;
    // Reset FIRST, unconditionally. Switching from member A to member B leaves
    // `act` populated across the await of getSession() + the new query, so the
    // preview would render A's presence line under B's name (review: CodeRabbit).
    setAct(null);
    if (!db || !userId || !open) return undefined;
    let on = true; let expTimer = null;
    (async () => {
      // user_activity is authenticated-read. A session that lives only in the
      // Next.js HTTP cookies leaves this client ANON until the bridge runs, so
      // the row would be invisible and the line would silently never show
      // (review: Codex P2).
      try { if (sdb.getSession) await sdb.getSession(); } catch (e) { /* fall through as anon */ }
      if (!on) return;
      try {
        const res = await db.from("user_activity").select("kind, started_at, expires_at")
          .eq("user_id", userId).gt("expires_at", new Date().toISOString()).maybeSingle();
        if (!on) return;
        const data = (res && res.error) ? null : (res && res.data);
        // Require a FINITE future expiry — malformed expires_at (NaN) must read
        // as absence, never an untimed forever-line.
        const expMs = data && data.expires_at ? new Date(data.expires_at).getTime() - Date.now() : 0;
        const known = !!(data && Object.prototype.hasOwnProperty.call(CW_ACTIVITY_VERBS, data.kind));
        const ok = known && expMs > 0;
        setAct(ok ? data : null);
        // Clear the line AT expiry (review round) — an open preview must not
        // keep saying "In a workout" after the activity row lapses.
        if (ok) expTimer = setTimeout(() => { if (on) setAct(null); }, expMs);
      } catch (e) { if (on) setAct(null); }
    })();
    return () => { on = false; if (expTimer) clearTimeout(expTimer); };
  }, [userId, open]);
  if (!act) return null;
  const verb = CW_ACTIVITY_VERBS[act.kind];
  if (!verb) return null;
  // A malformed started_at parses to NaN, and NaN != null — without the finite
  // check the UI would render a fabricated "NaN min in" (review: CodeRabbit).
  const startMs = act.started_at ? new Date(act.started_at).getTime() : NaN;
  const mins = Number.isFinite(startMs) ? Math.max(0, Math.floor((Date.now() - startMs) / 60000)) : null;
  return mins != null ? `${verb} · ${mins} min in` : verb;
}

// Facet avatar (matches the mobile app) — a tier-coloured rounded-diamond gem,
// initials inside, optional pulsing "online" ring.
function CwFacetAvatar({ size = 40, c = "var(--sh-accent3, #34d6c5)", initial = "S", live = false, onClick, photo }) {
  const inset = Math.max(2, Math.round(size * 0.055));
  return (
    <div onClick={onClick} title={onClick ? "View profile" : undefined} style={{ width: size, height: size, position: "relative", display: "grid", placeItems: "center", flex: "0 0 auto", cursor: onClick ? "pointer" : "default" }}>
      {live && <div style={{ position: "absolute", inset: -Math.round(size * 0.1), transform: "rotate(45deg)", borderRadius: "30%", border: "2px solid var(--sh-accent3, #34d6c5)", boxShadow: `0 0 12px ${cwHexA("var(--sh-accent3, #34d6c5)", 0.5)}`, animation: "cwAvPulse 2.4s ease-in-out infinite" }} />}
      <div style={{ position: "absolute", inset: 0, transform: "rotate(45deg)", borderRadius: "27%", background: `linear-gradient(135deg, ${c}, ${cwShade(c, 0.5)})`, boxShadow: `0 4px 14px ${cwHexA(c, 0.4)}, inset 1px 1px 2px rgba(255,255,255,0.35)` }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: "27%", background: "linear-gradient(135deg, rgba(255,255,255,0.28), transparent 42%)" }} />
        <div style={{ position: "absolute", inset, borderRadius: "23%", overflow: "hidden", background: "#0f0c0a", display: "grid", placeItems: "center" }}>
          {photo
            ? <img src={photo} alt="" style={{ position: "absolute", width: "152%", height: "152%", left: "50%", top: "50%", transform: "translate(-50%,-50%) rotate(-45deg)", objectFit: "cover" }} />
            : <span style={{ transform: "rotate(-45deg)", fontFamily: "var(--sh-font-display, 'Fraunces', 'Fraunces Fallback', 'Instrument Serif', serif)", fontWeight: 500, fontSize: size * 0.42, color: "var(--sh-ink, #f2ede4)", lineHeight: 1 }}>{(initial && String(initial).trim()) || "?"}</span>}
        </div>
      </div>
      {live && <span style={{ position: "absolute", bottom: 0, right: 0, transform: "translate(20%,20%)", width: Math.max(7, Math.round(size * 0.16)), height: Math.max(7, Math.round(size * 0.16)), borderRadius: 999, background: "var(--sh-accent3, #34d6c5)", border: "2px solid #100d0a" }} />}
    </div>
  );
}
if (typeof document !== "undefined" && !document.getElementById("cw-av-pulse")) { const st = document.createElement("style"); st.id = "cw-av-pulse"; st.textContent = "@keyframes cwAvPulse { 0%,100% { transform: rotate(45deg) scale(1); opacity: 0.9; } 50% { transform: rotate(45deg) scale(1.09); opacity: 0.4; } }"; document.head.appendChild(st); }
// Demo/preview faces — so seeded people (no real account) show real photos in
// preview mode, demonstrating avatars on chat bubbles + profiles. Real members
// (with a userId) use their own photo/initials, never these.
const CW_DEMO_FACES = ["/newdesign/faces/member-01.jpg", "/newdesign/faces/member-02.jpg", "/newdesign/faces/member-03.jpg", "/newdesign/faces/member-04.jpg", "/newdesign/faces/member-05.jpg", "/newdesign/faces/member-06.jpg", "/newdesign/faces/member-07.jpg", "/newdesign/faces/member-08.jpg", "/newdesign/faces/member-09.jpg", "/newdesign/faces/member-10.jpg", "/newdesign/faces/member-11.jpg", "/newdesign/faces/member-12.jpg"];
function cwDemoFace(name) {
  const n = String(name || "").trim();
  if (!n || n === "You" || n.charAt(0) === "#") return null;
  if (n === "Nora") return "/nora-avatar.png"; // Shape's concierge — real avatar, not a stock face
  let h = 0; for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0;
  return CW_DEMO_FACES[h % CW_DEMO_FACES.length];
}
// Stable per-name tier for people we have no live points for (demo/seeded
// threads) — same deterministic hash the mobile app uses. Coaches climb the
// coach ladder, clients the client ladder, so the names match everywhere.
function cwHashTier(name, coach) {
  const ladder = coach ? CW_COACH_LADDER : CW_CLIENT_LADDER;
  const s = String(name || "");
  let n = 0;
  for (let i = 0; i < s.length; i++) n = (n + s.charCodeAt(i) * (i + 1)) % 997;
  // skip rung 0 so demo people aren't all "Base/Certified".
  return ladder[1 + (n % (ladder.length - 1))];
}
function cwTierForPoints(pts, coach) {
  const ladder = coach ? CW_COACH_LADDER : CW_CLIENT_LADDER;
  const p = Number(pts) || 0;
  const i = p >= 15000 ? 4 : p >= 5000 ? 3 : p >= 2000 ? 2 : p >= 750 ? 1 : 0;
  return ladder[i];
}

// Nora's drafted change → the human-in-the-loop confirm card. Renders the
// server-provided summary + diff (before → after), then a Confirm that POSTs the
// signed token to /api/ai/proposals/confirm (cookie session) — nothing is applied
// until this click. Once it lands, Undo reverses it by auditId. Token-only: the
// UI never fabricates the change. Reuses the chat-widget tokens (no restyle).
function CwProposalCard({ a }) {
  const [status, setStatus] = React.useState("idle"); // idle|busy|done|undoing|undone|error
  const [err, setErr] = React.useState("");
  const [auditId, setAuditId] = React.useState(null);
  const mono = "'JetBrains Mono', monospace";
  const ink = "var(--sh-ink, #f2ede4)", muted = "var(--sh-ink2, #a09b94)", hair = "rgba(var(--sh-ink-rgb, 242,237,228),0.14)";
  const diff = Array.isArray(a.diff) ? a.diff : [];
  const fmtV = (v) => (v == null || v === "") ? "—" : String(v);
  const post = async (url, payload) => {
    const res = await fetch(url, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || data.error || "Something went wrong.");
    return data;
  };
  const confirm = async () => {
    if (status === "busy" || status === "done") return;
    setStatus("busy"); setErr("");
    try { const r = await post("/api/ai/proposals/confirm", { token: a.token }); setAuditId(r && r.auditId); setStatus("done"); }
    catch (e) { setErr(String(e && e.message || "Could not apply that change.")); setStatus("error"); }
  };
  const undo = async () => {
    if (!auditId || status === "undoing" || status === "undone") return;
    setStatus("undoing"); setErr("");
    try { await post("/api/ai/audit/undo", { auditId }); setStatus("undone"); }
    catch (e) { setErr(String(e && e.message || "Could not undo.")); setStatus("done"); }
  };
  return (
    <div style={{ width: "100%", maxWidth: "92%", border: `1px solid ${cwHexA(TEAL, 0.45)}`, background: "rgba(var(--sh-accent2-rgb, 10,197,168),0.07)", borderRadius: 14, padding: 12, marginTop: 8 }}>
      <div style={{ fontFamily: mono, fontSize: 8.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: TEAL_BRIGHT }}>
        {status === "done" ? "Applied ✓" : status === "undone" ? "Undone" : "Draft · review & confirm"}
      </div>
      <div style={{ marginTop: 5, fontFamily: sans, fontSize: 13.5, color: ink, lineHeight: 1.35 }}>{a.summary || a.label}</div>
      {diff.length > 0 && status !== "undone" && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
          {diff.map((d, i) => (
            <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 6, fontFamily: mono, fontSize: 10.5, flexWrap: "wrap" }}>
              <span style={{ color: muted }}>{d.label || d.field}</span>
              <span style={{ color: muted, textDecoration: "line-through", opacity: 0.7 }}>{fmtV(d.before)}</span>
              <span style={{ color: muted }}>→</span>
              <span style={{ color: ink, fontWeight: 600 }}>{fmtV(d.after)}</span>
            </div>
          ))}
        </div>
      )}
      {err && <div style={{ marginTop: 7, fontFamily: mono, fontSize: 10, color: "#e0463c", lineHeight: 1.4 }}>{err}</div>}
      <div style={{ marginTop: 10, display: "flex", gap: 7, alignItems: "center" }}>
        {(status === "idle" || status === "error") && (
          <button onClick={confirm} style={{ border: 0, background: TEAL, color: PAPER, borderRadius: 999, padding: "7px 15px", fontFamily: mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}>{status === "error" ? "Try again" : "Confirm"}</button>
        )}
        {status === "busy" && <span style={{ fontFamily: mono, fontSize: 9.5, color: muted, letterSpacing: "0.1em", textTransform: "uppercase" }}>Applying…</span>}
        {status === "done" && auditId && (
          <button onClick={undo} style={{ border: `1px solid ${hair}`, background: "transparent", color: muted, borderRadius: 999, padding: "7px 13px", fontFamily: mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer" }}>Undo</button>
        )}
        {status === "undoing" && <span style={{ fontFamily: mono, fontSize: 9.5, color: muted, letterSpacing: "0.1em", textTransform: "uppercase" }}>Undoing…</span>}
      </div>
    </div>
  );
}

function ChatWidget(props) {
  // normalize to tabs[]
  // ── THE FEED TAB ─────────────────────────────────────────────────
  // The app's Chat page is four segments — Feed / Team / Channels / Support —
  // and this widget already carried three of them. The Wall is a CHIP INSIDE
  // Feed there, not a surface beside it (#2036: "don't need 2 wall tabs"), so
  // it arrives here rather than as a fifth tab.
  //
  // ⚠ IT IS OWNED BY THE WIDGET, NOT BY THE TAB SOURCE. Two different files
  // supply `tabs` (`clientChatThreads.jsx` and `globalChatButton.js`'s own
  // fallback set), so adding it to one would give half the site a Feed tab and
  // the other half none, silently.
  //
  // ⚠ AND IT IS GATED ON THE MODULE BEING PRESENT. `communityFeed.jsx` is a
  // separate script tag; a page that loads the widget without it would render a
  // tab whose body throws, and there is NO ERROR BOUNDARY in `public/newdesign`
  // — one ReferenceError blanks the page. Absent module → no tab, which is a
  // missing feature rather than a broken site. `tests/chat-feed-tab.test.mjs`
  // is what keeps that from being the normal case.
  const feedReady = typeof window !== "undefined" && typeof window.CommunityFeed === "function";
  const tabs = React.useMemo(() => {
    // ⚠ THE LABEL IS "Feed" AND THE WALL IS THE CHIP INSIDE IT — the app's own
    // shape, and the owner's ruling when it was briefly renamed on 2026-09-15:
    // "leave it as feed". Measured rather than read off the call site, whose
    // `defaultValue` is not what renders: the app's catalog carries
    // `feed:tab.feed = "Feed"` and `feed:tab.wall = "Wall"`, so its top segment
    // is Feed and Wall is the sub-tab. Labelling this one Wall put TWO controls
    // reading "Wall" in one panel (the tab and its own default chip) and an
    // empty state reading "Nothing on Wall yet." inside a tab called Wall.
    // `tests/community-wall-plate.test.mjs` derives this label from that
    // catalog, so the two surfaces cannot drift apart silently.
    const FEED_TAB = {
      id: "feed", label: "Feed", eyebrow: "THE WALL", title: "Community",
      feed: true, threads: [],
    };
    const base = (props.tabs && props.tabs.length) ? props.tabs : null;
    if (base) return feedReady ? [FEED_TAB].concat(base) : base;
    const fallback = [{
      id: "default",
      label: props.title || "Messages",
      eyebrow: props.eyebrow || "DIRECT CHAT",
      title: props.title || "Messages",
      threads: props.threads || [],
    }];
    return feedReady ? [FEED_TAB].concat(fallback) : fallback;
  }, [props.tabs, props.threads, props.title, props.eyebrow, feedReady]);

  // When `docked`, the widget runs inside its own popped-out OS window:
  // always open, fills the window, no bubble / drag / resize.
  const docked = !!props.docked;

  // Open state persists across full page navigations (the newdesign pages
  // are separate static HTML files, so React state resets on every load).
  const OPEN_KEY = "shape.chat.open";
  // Start closed on every fresh page load — the chat should not stay open across
  // navigation (it was blocking the page). It only opens on an explicit action.
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    try {
      if (open) localStorage.setItem(OPEN_KEY, "1");
      else localStorage.removeItem(OPEN_KEY);
    } catch {}
  }, [open]);
  const [tabIdx, setTabIdx] = React.useState(0);
  // threadsByTab: array of arrays of threads (mutable copy)
  const [threadsByTab, setThreadsByTab] = React.useState(() => tabs.map(t => t.threads));
  const [activeByTab, setActiveByTab] = React.useState(() => tabs.map(() => 0));
  const [draftByTab, setDraftByTab] = React.useState(() => tabs.map(() => ""));
  const [typing, setTyping] = React.useState(false);
  // Re-render avatars as people come online / go offline (live presence ring).
  const [, setPresenceV] = React.useState(0);
  React.useEffect(() => {
    const bump = () => setPresenceV(x => x + 1);
    try { window.addEventListener("shape:presence", bump); } catch (e) {}
    return () => { try { window.removeEventListener("shape:presence", bump); } catch (e) {} };
  }, []);

  // ── Persistence ───────────────────────────────────────────────────────
  // Sent messages / created channels survive navigation + reload, scoped to
  // the authenticated Supabase user (falls back to "anon" when signed out).
  // localStorage is shared across every /newdesign/* page (same origin), so
  // the site-wide chat bubble stays in sync everywhere.
  const STORE_VER = "v2";
  const storeKeyRef = React.useRef(null);
  const hydratedRef = React.useRef(false);
  // ⚠ A REF CANNOT GATE AN EFFECT — it triggers no re-render, so an effect that
  // waits on `hydratedRef.current` never re-runs when it flips. The live-thread
  // install below has to wait for the localStorage hydrate (see there), so the
  // same fact is published as STATE as well.
  const [hydrated, setHydrated] = React.useState(false);
  // "pending" | "in" | "out" | "unknown" — the /api/me answer the hydrate below
  // already fetches, published so the history read can decide whether it is worth
  // loading the Supabase bundle at all. THREE states, not two: that route answers
  // 200 {user:null} for a MEASURED signed-out visitor and 503 for a read that did
  // not complete, and only the first is evidence of anything.
  const [authProbe, setAuthProbe] = React.useState("pending");
  const dirtyRef = React.useRef(false);

  // Nora's voice OUTPUT (read replies aloud) — OFF by default, fully usable
  // without it. tone + voice sync from the account (user_goals 'nora_voice') so
  // they match the mobile app; the on/off flag is per-device (localStorage).
  const NORA_VOICES = [
    { id: "shimmer", label: "Warm" }, { id: "alloy", label: "Neutral" }, { id: "sage", label: "Calm" },
    { id: "nova", label: "Bright" }, { id: "onyx", label: "Deep" }, { id: "verse", label: "Expressive" },
  ];
  const normNoraVoice = (v) => NORA_VOICES.some(x => x.id === v) ? v : "auto";
  const readNoraEnabled = () => { try { return localStorage.getItem("shape.nora.voice") === "on"; } catch (e) { return false; } };
  const [noraVoice, setNoraVoiceState] = React.useState({ enabled: readNoraEnabled(), tone: "supportive", voice: "auto" });
  const noraAudioRef = React.useRef(null);
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const doc = window.shapeDb && window.shapeDb.getUserGoals ? await window.shapeDb.getUserGoals("nora_voice") : null;
        if (!cancelled && doc && typeof doc === "object") setNoraVoiceState(s => ({ ...s, tone: doc.tone === "direct" ? "direct" : "supportive", voice: normNoraVoice(doc.voice) }));
      } catch (e) { /* default supportive/auto */ }
    })();
    return () => { cancelled = true; };
  }, []);
  const saveNoraAccount = (tone, voice) => { try { window.shapeDb && window.shapeDb.saveUserGoals && window.shapeDb.saveUserGoals("nora_voice", { tone, voice: normNoraVoice(voice) }); } catch (e) {} };
  const stopNora = () => { try { if (noraAudioRef.current) { noraAudioRef.current.pause(); noraAudioRef.current = null; } } catch (e) {} };
  const setNoraEnabled = (on) => { try { localStorage.setItem("shape.nora.voice", on ? "on" : "off"); } catch (e) {} if (!on) stopNora(); setNoraVoiceState(s => ({ ...s, enabled: on })); };
  const setNoraTone = (tone) => setNoraVoiceState(s => { const n = { ...s, tone }; saveNoraAccount(n.tone, n.voice); return n; });
  const setNoraVoiceId = (voice) => setNoraVoiceState(s => { const n = { ...s, voice: normNoraVoice(voice) }; saveNoraAccount(n.tone, n.voice); return n; });
  // Server-only voice (mobile #1653 parity): the speechSynthesis robot is
  // DEAD — silence over brand-damaging robot audio. Returns an honest
  // { ok, reason: 'signed_out' | 'members' | 'unavailable' }; an EXPLICIT
  // listen surfaces the reason as a transient notice, auto-speak failures
  // stay silent (same contract as the app's speakVoice).
  const [speakNotice, setSpeakNotice] = React.useState(null);
  const speakNoticeTimer = React.useRef(null);
  const flashSpeakNotice = (msg) => {
    setSpeakNotice(msg);
    try { if (speakNoticeTimer.current) clearTimeout(speakNoticeTimer.current); } catch (e) {}
    speakNoticeTimer.current = setTimeout(() => setSpeakNotice(null), 3500);
  };
  const speakNora = async (text, opts) => {
    const explicit = !!(opts && opts.explicit);
    const clean = String(text || "").trim();
    if (!clean) return { ok: false, reason: "unavailable" };
    stopNora();
    let reason = "unavailable";
    try {
      const res = await fetch("/api/ai/speak", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clean.slice(0, 2000), tone: noraVoice.tone, voice: noraVoice.voice !== "auto" ? noraVoice.voice : undefined }),
      });
      if (res.ok) {
        const url = URL.createObjectURL(await res.blob());
        const audio = new Audio(url); noraAudioRef.current = audio;
        audio.onended = audio.onerror = () => { try { URL.revokeObjectURL(url); } catch (e) {} };
        await audio.play(); return { ok: true };
      }
      reason = res.status === 401 ? "signed_out" : (res.status === 402 || res.status === 403) ? "members" : "unavailable";
    } catch (e) { reason = "unavailable"; }
    if (explicit) {
      flashSpeakNotice(reason === "signed_out" ? "Sign in to hear Nora's voice."
        : reason === "members" ? "Nora's voice is a member feature."
        : "Voice is unavailable right now.");
    }
    return { ok: false, reason };
  };

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      let uid = "anon";
      let probe = "unknown";
      try {
        const r = await fetch("/api/me", { credentials: "same-origin" });
        if (r.ok) {
          const j = await r.json();
          uid = (j && (j.user?.id || j.id || j.profile?.id)) || "anon";
          probe = uid === "anon" ? "out" : "in";
        }
      } catch {}
      if (cancelled) return;
      setAuthProbe(probe);
      const key = `shape.chat.${STORE_VER}.${uid}`;
      storeKeyRef.current = key;
      // Don't clobber a message the user typed before hydration finished.
      if (!dirtyRef.current) {
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const saved = JSON.parse(raw);
            // ⚠ MIGRATE THE PRE-FEED SHAPE RATHER THAN DISCARDING IT. These arrays
            // are POSITIONAL, one entry per tab, and the hydrate accepted a saved
            // record only on an exact length match. Prepending the Feed tab takes
            // `tabs.length` from N to N+1, so EVERY existing member's record failed
            // that check, was silently dropped, and was then overwritten with
            // defaults on their next keystroke — losing sent messages and every
            // channel they had created (review: Codex P1).
            // The Feed tab is prepended, so an old record aligns with tabs[1..N]
            // once an empty slot is pushed onto the front.
            const fit = (arr, empty) => {
              if (!Array.isArray(arr)) return null;
              if (arr.length === tabs.length) return arr;
              if (feedReady && tabs[0] && tabs[0].feed && arr.length === tabs.length - 1) return [empty].concat(arr);
              return null;
            };
            const threads = saved && fit(saved.threadsByTab, []);
            if (threads) {
              setThreadsByTab(threads);
              const active = fit(saved.activeByTab, 0);
              if (active) setActiveByTab(active);
            }
          }
        } catch {}
      }
      hydratedRef.current = true;
      setHydrated(true);
    })();
    return () => { cancelled = true; };
  }, [tabs.length, feedReady]);

  React.useEffect(() => {
    if (!hydratedRef.current || !storeKeyRef.current) return;
    try {
      localStorage.setItem(storeKeyRef.current, JSON.stringify({ threadsByTab, activeByTab }));
    } catch {}
  }, [threadsByTab, activeByTab]);

  // ── REAL MESSAGE HISTORY ──────────────────────────────────────────
  // ⚠ THE THREADS THIS WIDGET SHIPPED WITH ARE DEMO, AND THERE WAS NO HISTORY AT
  // ALL. `clientChatThreads.jsx` types Maya Okafor, Marcus J. and the rest into
  // the file, and a thread only became DB-backed when something handed
  // `__openChat({ conversationId })` an explicit id. So a member who talked to
  // their coach in the app opened the bubble on the web and saw invented messages
  // from people who do not exist.
  //
  // ⚠ AN EARLIER DRAFT OF THIS COMMENT ADDED "and even then the poll below only
  // ever fetched messages NEWER than `since`", AND THAT IS FALSE — corrected
  // here rather than left, because it is the claim that made a bulk `messages`
  // read look necessary. `fetchOnce` runs with NO `since` the first time a
  // conversation is opened (`lastSeenRef` is empty), which is the route's own
  // cold-load path, and that arm REPLACES `t.messages`. The gap was never the
  // messages; it was that the thread LIST was invented, so no thread carried an
  // id for the poll to read. A comment asserting a false cause is an instruction
  // to fix the wrong thing.
  //
  // This reads the member's own conversations and replaces those demo threads.
  // It needs NO new route: `conversations` is readable by its participants
  // (`participants read conversations` → `can_access_conversation(id)`), which is
  // the same path the app takes.
  //
  // ⚠ SCOPE: coach threads and member DMs — the two surfaces that carry message
  // history, both out of `conversations`/`messages`. CHANNELS ARE NOT HERE: they
  // are a separate `channels` table with its own rows and their own message
  // store, so they are a different read rather than one more bucket, and the
  // Channels tab keeps its sample set until that lands.
  const [threadsLive, setThreadsLive] = React.useState(null); // null = not read yet
  React.useEffect(() => {
    // ⚠ A MEASURED SIGNED-OUT VISITOR IS THE ONLY ONE THIS REFUSES TO LOAD FOR.
    // `authProbe` is the /api/me answer the hydrate already fetched, so the gate
    // costs no extra request. "unknown" — that read did not complete — TRIES:
    // loading the client for a signed-out visitor costs a download, where
    // skipping it for a signed-in member shows them the demo cast, and the
    // `getUser()` below settles the truth either way, so trying can never publish
    // somebody else's threads.
    if (authProbe === "pending") return undefined;
    if (authProbe === "out") { setThreadsLive(false); return undefined; }
    let cancelled = false;
    (async () => {
      // ⚠ LOAD THE CLIENT; DO NOT ASSUME IT. 25 of the 35 pages that carry this
      // widget do not load /supabase.js — chatPopout.html and every marketing
      // page among them — so `window.shapeDb` is undefined on mount and a bare
      // early return here is PERMANENT: the pop-out opened from a signed-in
      // dashboard would show the sample cast forever (review: Codex P1).
      // `pageShell.jsx` is on all 35 and owns the lazy loader, with the vendor
      // bundle's SRI hash in it, so it is REUSED rather than copied.
      const sdb = (window.shapeEnsureDb ? await window.shapeEnsureDb() : null) || window.shapeDb;
      const db = sdb && sdb.client;
      if (cancelled) return;
      if (!db) { setThreadsLive(false); return; }
      // ⚠ BRIDGE THE COOKIE SESSION FIRST. A session living only in the Next.js
      // HTTP cookies leaves this client ANON, so every read below returns nothing
      // and a signed-in member is shown an empty inbox. This file already pays
      // for that lesson twice (the activity line, the live station).
      try { if (sdb.getSession) await sdb.getSession(); } catch (e) { /* fall through */ }
      if (cancelled) return;
      let me = null;
      try { const { data } = await db.auth.getUser(); me = data && data.user && data.user.id; } catch (e) {}
      if (cancelled) return;
      // Signed out keeps the sample threads — they are what a visitor previewing
      // the site is meant to see, and there is nothing of theirs to read.
      if (!me) { setThreadsLive(false); return; }

      // A reading in the slot every other thread puts a time in. The sample
      // threads say "2m" / "14m" / "just now"; a status word there is not a time.
      const relTime = (iso) => {
        if (!iso) return "now";
        const t = new Date(iso).getTime();
        if (!Number.isFinite(t)) return "now";
        const sec = Math.floor((Date.now() - t) / 1000);
        if (!(sec > 60)) return "now";
        if (sec < 3600) return `${Math.floor(sec / 60)}m`;
        if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
        return `${Math.floor(sec / 86400)}d`;
      };

      try {
        // Coach threads: kind 'direct' with NO dm_key, and `client_id` = me. The
        // dm_key rows are member↔member DMs and are listed separately below, by
        // an RPC, because the other member's NAME is not on the conversation row.
        //
        // ⚠ THE `client_id` FILTER IS WHAT KEEPS A COACH'S OWN NAME OFF EVERY
        // ROW. RLS returns every conversation the viewer participates in, and for
        // a trainer or nutritionist that includes all of THEIR CLIENTS' threads —
        // rows created with `title` set to the PROVIDER's name
        // (2026-05-02-conversations-messages.sql:205-206). Without this filter a coach
        // opening the bubble on TrainerApp.html saw N threads all labelled with
        // their own name, indistinguishable, under a tab that reads "Your coaches"
        // (review: Codex P1). Asking for the rows where the viewer IS the client
        // is exactly what that tab means, it is indexed
        // (`conversations (client_id, last_message_at desc)`), and it stays right
        // for a dual-role account: a trainer who is also a member still gets their
        // own nutritionist here. Their client-facing threads are a coach surface.
        //
        // ⚠ AND `provider_role is not null`, WHICH IS NOT BELT-AND-BRACES. There is
        // a THIRD writer of `kind='direct'` rows with no `dm_key`:
        // `get_or_create_coach_coach_conversation` (2026-05-26-shared-clients.sql:181)
        // opens a coach↔coach thread titled 'Care team' with NO provider and
        // `client_id` set to the client it is ABOUT — and the member is not a
        // participant. `can_access_conversation` grants on `client_id = auth.uid()`
        // all the same, so that row comes back to the member, and without this
        // clause it rendered in "Your coaches" as `Care team · Trainer · Shape
        // coach` — two coaches' private thread about them, mislabelled as one of
        // their own. Requiring a provider is what that tab means, and it also
        // makes the `roleLabel` fallback below unreachable rather than wrong.
        // ⚠ REGISTERED, NOT FIXED: whether a member should be able to READ that
        // thread at all is a question about `can_access_conversation`, i.e. a
        // migration and somebody's ruling — not a filter in a chat widget. This
        // stops surfacing it; it does not revoke anything.
        const convRes = await db.from("conversations").select("*")
          .eq("kind", "direct").is("dm_key", null).eq("client_id", me)
          .not("provider_role", "is", null)
          .order("last_message_at", { ascending: false, nullsFirst: false });
        if (cancelled) return;
        // ⚠ A FAILED READ IS NOT AN EMPTY INBOX. Falling through to `[]` here
        // would replace a member's real coach threads with "no conversations",
        // which is a claim rather than an absence.
        if (convRes && convRes.error) { setThreadsLive(false); return; }
        const convs = (convRes && convRes.data) || [];

        const dmRes = await db.rpc("list_member_dm_threads");
        if (cancelled) return;
        // The DM leg failing is survivable on its own — the coach threads are
        // still real — so it degrades to no DMs rather than discarding both.
        const dmRows = (dmRes && !dmRes.error && dmRes.data) || [];

        // ⚠ NO BULK `messages` READ HERE, AND ITS ABSENCE IS THE FIX RATHER THAN A
        // SIMPLIFICATION. One combined `.in(conversation_id, [...])` ordered
        // ASCENDING shares PostgREST's row ceiling across every conversation, so a
        // long thread opened on its OLDEST messages while its own preview
        // advertised a newer one, and a busy thread starved the quiet ones
        // (review: Codex P2).
        //
        // It was also dead weight: the poll effect below fires `fetchOnce()` with
        // no `since` the moment a thread is opened, and that arm REPLACES
        // `t.messages` wholesale — so every row this read fetched was discarded by
        // the first look at the thread. `/api/conversations/[id]/messages` is the
        // one place that gets the cap right: newest-first, capped, re-reversed,
        // with an incremental poll that deliberately stays ascending (route.ts).
        // The history comes from there, per thread, on open.
        //
        // The LIST needs no messages: `conversations.last_message` is maintained
        // by a trigger on every insert (the same migration, :146) and the DM RPC
        // returns its own, so the previews are real without reading a single row.
        const coachThreads = convs.map(c => {
          const roleLabel = c.provider_role === "nutritionist" ? "Nutritionist" : "Trainer";
          const who = c.title || roleLabel;
          return {
            who, role: `${roleLabel} · Shape coach`,
            last: c.last_message || "New conversation",
            time: relTime(c.last_message_at),
            unread: 0, coach: true,
            // ⚠ THIS FIELD IS WHY SEND, THE COLD LOAD AND THE POLL ALL WORK FOR
            // FREE. The composer posts to /api/conversations/<id>/messages and
            // both arms of the poll read that same route off the SAME id — all
            // three are already keyed on `activeThread.conversationId`.
            conversationId: c.id,
            messages: [],
          };
        });

        const dmThreads = dmRows.map(r => ({
          who: r.other_name || "Member",
          role: "Direct message",
          last: r.last_message || "New conversation",
          time: relTime(r.last_message_at),
          unread: 0, conversationId: r.conversation_id, messages: [],
        }));

        if (!cancelled) setThreadsLive({ circle: coachThreads, friends: dmThreads });
      } catch (e) {
        if (!cancelled) setThreadsLive(false);
      }
    })();
    return () => { cancelled = true; };
  }, [authProbe]);

  // Install the real threads over the sample ones, by TAB ID rather than index
  // — the tab list differs between the two files that supply it, so a positional
  // write would land on whichever tab happened to sit there.
  React.useEffect(() => {
    if (!threadsLive || threadsLive === true) return;
    // ⚠ WAIT FOR THE localStorage HYDRATE, OR THIS IS A RACE IT USUALLY WINS AND
    // SOMETIMES LOSES. Both are async and neither is ordered against the other:
    // the hydrate does a /api/me round trip, and this waits for that answer and
    // then does a bundle load + getSession + getUser + two queries — so the
    // hydrate lands first almost every time, and on the run where it does not it
    // restores the SAVED (sample) threads OVER the real ones and the member sees
    // the demo cast again. "Almost every time" is not an ordering.
    if (!hydrated) return;
    // ⚠ DO NOT CLOBBER SOMETHING THE MEMBER HAS ALREADY TYPED OR SENT. The same
    // guard the localStorage hydrate uses; a real read landing mid-compose must
    // not take their message away.
    if (dirtyRef.current) return;
    setThreadsByTab(prev => prev.map((list, i) => {
      const id = tabs[i] && tabs[i].id;
      const next = Object.prototype.hasOwnProperty.call(threadsLive, id) ? threadsLive[id] : null;
      return next ? next : list;
    }));
  }, [threadsLive, tabs, hydrated]);

  const [creating, setCreating] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newDesc, setNewDesc] = React.useState("");
  // iMessage-style reactions, keyed by `${tabIdx}:${threadIdx}:${msgIdx}` -> emoji string
  const [reactions, setReactions] = React.useState({});
  const [reactionPickerFor, setReactionPickerFor] = React.useState(null); // same key, or null
  const REACTION_EMOJIS = ["❤️", "👍", "👎", "😂", "‼️", "❓"];
  const toggleReaction = (key, emoji) => {
    setReactions(prev => {
      const cur = prev[key] || null;
      const next = { ...prev };
      if (cur === emoji) delete next[key]; else next[key] = emoji;
      return next;
    });
    setReactionPickerFor(null);
  };
  const [searchQ, setSearchQ] = React.useState("");
  const scrollRef = React.useRef(null);

  const currentThreads = threadsByTab[tabIdx] || [];
  const activeIdx = activeByTab[tabIdx] || 0;
  const active = currentThreads[activeIdx];
  const draft = draftByTab[tabIdx] || "";

  // unread across ALL tabs
  const totalUnread = threadsByTab.reduce(
    (s, ts) => s + ts.reduce((a, t) => a + (t.unread || 0), 0), 0
  );
  const tabUnread = (i) => (threadsByTab[i] || []).reduce((a, t) => a + (t.unread || 0), 0);

  // Drag state ------------------------------------------------------------
  const POS_KEY = "shape.chatWidget.pos";
  const SIZE_KEY = "shape.chatWidget.size";
  const DEFAULT_SIZE = { w: 1180, h: 860 };
  const [pos, setPos] = React.useState(() => {
    try { const s = localStorage.getItem(POS_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
  });
  const [size, setSize] = React.useState(() => {
    try { const s = localStorage.getItem(SIZE_KEY); return s ? JSON.parse(s) : DEFAULT_SIZE; } catch { return DEFAULT_SIZE; }
  });
  const dragRef = React.useRef(null);
  const resizeRef = React.useRef(null);
  const PANEL_VISIBLE_GRAB = 84;

  const startResize = (e) => {
    e.preventDefault(); e.stopPropagation();
    const panel = e.currentTarget.closest("[data-chat-panel]");
    const rect = panel.getBoundingClientRect();
    resizeRef.current = { startX: e.clientX, startY: e.clientY, w: rect.width, h: rect.height };
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onResize);
    window.addEventListener("mouseup", endResize);
  };
  const onResize = (e) => {
    const d = resizeRef.current; if (!d) return;
    const w = Math.max(520, Math.min(window.innerWidth - 40, d.w + (e.clientX - d.startX)));
    const h = Math.max(420, Math.min(window.innerHeight - 40, d.h + (e.clientY - d.startY)));
    setSize({ w, h });
  };
  const endResize = () => {
    resizeRef.current = null;
    document.body.style.userSelect = "";
    window.removeEventListener("mousemove", onResize);
    window.removeEventListener("mouseup", endResize);
    setSize(s => { try { localStorage.setItem(SIZE_KEY, JSON.stringify(s)); } catch {} return s; });
  };
  const resetSize = () => { setSize(DEFAULT_SIZE); try { localStorage.removeItem(SIZE_KEY); } catch {} };

  const startDrag = (e) => {
    if (docked) return;
    if (e.target.closest("button, input, textarea")) return;
    e.preventDefault();
    const panel = e.currentTarget.closest("[data-chat-panel]");
    const rect = panel.getBoundingClientRect();
    dragRef.current = { offX: e.clientX - rect.left, offY: e.clientY - rect.top, w: rect.width, h: rect.height };
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onDrag);
    window.addEventListener("mouseup", endDrag);
  };
  const onDrag = (e) => {
    const d = dragRef.current; if (!d) return;
    // Free drag — panel may go fully off-screen; the RESET button
    // (resetPos) brings it back to the default position.
    setPos({ x: e.clientX - d.offX, y: e.clientY - d.offY });
  };
  const endDrag = () => {
    dragRef.current = null;
    document.body.style.userSelect = "";
    window.removeEventListener("mousemove", onDrag);
    window.removeEventListener("mouseup", endDrag);
    setPos(p => { if (p) { try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch {} } return p; });
  };
  const resetPos = () => { setPos(null); try { localStorage.removeItem(POS_KEY); } catch {} };

  const isOpen = docked || open;
  const closePanel = () => {
    if (docked) { try { window.close(); } catch {} }
    else setOpen(false);
  };
  // Pop the chat out into its own OS window — drag it anywhere on the desktop,
  // onto a second monitor, etc. localStorage keeps the threads in sync.
  const popOut = () => {
    const w = window.open('/newdesign/chatPopout.html', 'shapeChatPopout', 'popup,width=960,height=720');
    if (w) { try { w.focus(); } catch {} setOpen(false); }
  };

  // Global opener.
  //   window.__openChat("Maya")                              ← legacy name lookup
  //   window.__openChat("Maya", "team")                       ← scoped to a tab
  //   window.__openChat({ who, role, eyebrow, conversationId, draft, tab })
  //
  // When called with an object descriptor, the widget will reuse the matching
  // local thread if one already exists, otherwise prepend a fresh one so the
  // user lands in a usable empty conversation with the right counterpart.
  // `draft` PRE-FILLS the composer (never auto-sends, never clobbers text the
  // user already typed) — the dashboards' one-tap Message buttons use it to
  // turn a reason pill into an editable opener. Callers that may run before
  // the widget mounts stash the descriptor on window.__openChatRequest (see
  // globalChatButton.js's __openChatTo); it's consumed on mount below.
  React.useEffect(() => {
    window.__openChat = (arg, tabId) => {
      setOpen(true);
      const descriptor = (arg && typeof arg === "object") ? arg : null;
      const who = descriptor ? descriptor.who : (typeof arg === "string" ? arg : null);
      const conversationId = descriptor && descriptor.conversationId;
      if (!tabId && descriptor && descriptor.tab) tabId = descriptor.tab;
      // Pre-fill the target tab's composer, keeping anything already typed.
      const fillDraft = (ti) => {
        if (descriptor && descriptor.draft) {
          setDraftByTab(prev => prev.map((d, i) => (i === ti && !String(d || "").trim() ? descriptor.draft : d)));
        }
      };
      if (tabId) {
        const ti = tabs.findIndex(t => t.id === tabId);
        if (ti >= 0) setTabIdx(ti);
      }
      if (!who && !conversationId) {
        // Draft-only deep link (e.g. the client's "Message your coach"):
        // land on the requested tab with the opener ready to edit.
        const ti = tabId ? tabs.findIndex(t => t.id === tabId) : tabIdx;
        fillDraft(ti >= 0 ? ti : tabIdx);
        return;
      }

      // An explicit conversation is authoritative across tabs. Names are only
      // for legacy links: two clients or a member/professional DM can share one.
      const searchTabs = tabId && !conversationId ? [tabs.findIndex(t => t.id === tabId)] : threadsByTab.map((_, i) => i);
      for (const ti of searchTabs) {
        if (ti < 0) continue;
        const idx = (threadsByTab[ti] || []).findIndex(t => conversationId
          ? t.conversationId === conversationId
          : t.who.toLowerCase().includes(who.toLowerCase()));
        if (idx >= 0) {
          setTabIdx(ti);
          setActiveByTab(prev => prev.map((v, i) => i === ti ? idx : v));
          fillDraft(ti);
          return;
        }
      }

      // No matching thread. If we got a descriptor (e.g. from the Shared
      // Clients tab or a dashboard Message button), prepend a new empty
      // thread on the current tab so the user can start typing right away.
      if (descriptor) {
        const fresh = {
          who: who || "Direct message",
          role: descriptor.role || descriptor.eyebrow || "Direct message",
          last: "",
          time: "now",
          unread: 0,
          conversationId: descriptor.conversationId || null,
          messages: [],
        };
        const targetTab = tabId
          ? Math.max(0, tabs.findIndex(t => t.id === tabId))
          : tabIdx;
        dirtyRef.current = true;
        setThreadsByTab(prev => prev.map((ts, ti) => ti !== targetTab ? ts : [fresh, ...ts]));
        setActiveByTab(prev => prev.map((v, ti) => ti === targetTab ? 0 : v));
        setTabIdx(targetTab);
        fillDraft(targetTab);
      }
    };
    // A deep link could land before this widget mounted (lazy boot via the
    // global bubble, or a Message tap racing page load) — consume it now.
    if (window.__openChatRequest) {
      const req = window.__openChatRequest;
      try { delete window.__openChatRequest; } catch (e) {}
      window.__openChat(req, req && req.tab);
    }
    return () => { delete window.__openChat; };
  }, [threadsByTab, tabs, tabIdx]);

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [tabIdx, activeIdx, active?.messages?.length, typing, open]);

  const setDraft = (v) => setDraftByTab(prev => prev.map((d, i) => i === tabIdx ? v : d));

  const isSupport = !!tabs[tabIdx]?.support;

  // `opts.voice` marks a SPOKEN message (a released hold-to-talk transcript):
  // the server then writes Nora's reply for the ear, since it is read aloud.
  const send = (forceText, opts = {}) => {
    const text = (typeof forceText === "string" ? forceText : draft).trim();
    if (!text) return;
    dirtyRef.current = true;
    const stamp = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

    // Snapshot the conversationId from the active thread BEFORE mutation, so
    // we know whether to round-trip through the API.
    const activeThread = (threadsByTab[tabIdx] || [])[activeIdx];
    const convId = activeThread && activeThread.conversationId;

    setThreadsByTab(prev => prev.map((ts, ti) => {
      if (ti !== tabIdx) return ts;
      return ts.map((t, i) => {
        if (i !== activeIdx) return t;
        return { ...t, last: `You: ${text}`, time: "now", unread: 0, messages: [...t.messages, { who: "You", t: text, time: stamp, me: true }] };
      });
    }));
    if (typeof forceText !== "string") setDraft("");

    // DB-backed thread: POST the message and skip the fake-reply timer. The
    // poll loop below will surface anything the other side sends back.
    if (convId) {
      fetch(`/api/conversations/${encodeURIComponent(convId)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ body: text }),
      }).catch(() => {});
      return;
    }

    const appendReply = (who, reply, actions) => {
      const stamp2 = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      setThreadsByTab(prev => prev.map((ts, ti) => {
        if (ti !== tabIdx) return ts;
        return ts.map((t, i) => {
          if (i !== activeIdx) return t;
          return { ...t, last: `${who}: ${reply}`, time: "now", messages: [...t.messages, { who, t: reply, time: stamp2, me: false, actions: Array.isArray(actions) && actions.length ? actions : undefined }] };
        });
      }));
    };

    // Help tab → real AI support (Nora, OpenAI) via /api/support/chat — same
    // assistant the mobile app uses. The server gracefully falls back to a
    // rule-based reply if the model is down; this also falls back to the local
    // script on a network error. Other tabs keep their simulated peer replies.
    if (isSupport) {
      setTyping(true);
      const history = [...((activeThread && activeThread.messages) || []), { t: text, me: true }]
        .map(m => ({ role: m.me ? "user" : "assistant", content: String(m.t || "") }))
        .filter(m => m.content);
      (async () => {
        let reply = null;
        let actions = null;
        try {
          const res = await fetch("/api/support/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            // voice / surface / locale shape the reply and the chips, never
            // access: the website is 'web' (its coach chips are page links; the
            // example directory is on its marketplace), and the page's own
            // language is the locale — the site has no locale store.
            body: JSON.stringify({ messages: history, tone: noraVoice.tone, voice: !!(opts && opts.voice), surface: "web", locale: cwLocale() }),
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data && data.reply) { reply = data.reply; actions = data.actions; }
        } catch (e) { /* fall back below */ }
        setTyping(false);
        const finalReply = reply || supportReply(text);
        appendReply("Nora", finalReply, actions);
        // Auto-play the reply when the voice pref is on OR Voice-chat mode is
        // active — read from the REF at reply time (the #1654 race fix: the
        // chip may have flipped while the model was thinking). Failures stay
        // silent (auto-speak is never a toast).
        if (noraVoice.enabled || voiceChatRef.current) speakNora(finalReply);
      })();
      return;
    }

    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      const { who, text: reply } = pickReply((threadsByTab[tabIdx] || [])[activeIdx] || {}, text);
      appendReply(who, reply);
    }, 1200 + Math.random() * 900);
  };

  // ── Voice input for Nora (push-to-talk) ───────────────────────────────────
  // The dictation language comes from the page (<html lang>) or, failing that,
  // the browser — the website has no locale store. CW_SPEECH_LANG is a hand
  // copy of src/lib/ai/voiceLang.mjs SPEECH_LANG (a classic script cannot
  // import it); tests/voice-lang.test.mjs holds the two tables to each other.
  const CW_SPEECH_LANG = {
    en: "en-US", es: "es-ES", "pt-BR": "pt-BR", fr: "fr-FR", de: "de-DE", it: "it-IT", id: "id-ID", vi: "vi-VN",
    tr: "tr-TR", ha: "ha-NG", pcm: "en-NG", ru: "ru-RU", uk: "uk-UA", hi: "hi-IN", bn: "bn-BD", te: "te-IN",
    ar: "ar-SA", arz: "ar-EG", ur: "ur-PK", "zh-Hans": "zh-CN", ja: "ja-JP", ko: "ko-KR",
  };
  const cwLocale = () => {
    try {
      const page = typeof document !== "undefined" && document.documentElement ? String(document.documentElement.lang || "").trim() : "";
      const nav = typeof navigator !== "undefined" ? String(navigator.language || "").trim() : "";
      return page || nav || "en";
    } catch (e) { return "en"; }
  };
  const cwSpeechLang = () => {
    const l = cwLocale();
    if (CW_SPEECH_LANG[l]) return CW_SPEECH_LANG[l];
    const base = l.split("-")[0];
    const hit = Object.keys(CW_SPEECH_LANG).find((k) => k.split("-")[0] === base);
    return hit ? CW_SPEECH_LANG[hit] : "en-US";
  };
  // Voice is just an input METHOD: it produces text that lands in the SAME
  // composer (`draft`) and goes through the SAME send() — so speaking a question
  // yields the same answer as typing it. Web Speech API is the fast path; a
  // server STT route (/api/ai/transcribe, keys server-side) is the fallback when
  // it's unavailable; if neither works the user just types. The transcript is
  // shown in the composer BEFORE she acts (the user reviews, then taps Send).
  const SpeechRec = (typeof window !== "undefined") && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const voiceSupported = !!SpeechRec || (typeof navigator !== "undefined" && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && typeof window !== "undefined" && !!window.MediaRecorder);
  const [voiceState, setVoiceState] = React.useState("idle"); // idle | listening | transcribing
  const [voiceErr, setVoiceErr] = React.useState(null);
  const recogRef = React.useRef(null);
  const recRef = React.useRef(null);

  // ── VOICE CHAT mode (mobile #1653/#1654 parity) ───────────────────────────
  // A per-session header chip (off by default). ON: the mic becomes
  // HOLD-TO-TALK — press records, release transcribes and the transcript
  // SENDS as a normal message (through the same send()), and Nora's reply
  // auto-plays (voiceChatRef is read at reply time — the #1654 race fix).
  // Needs a deterministic release, so it rides MediaRecorder →
  // /api/ai/transcribe only (SpeechRec's live drafting is the dictation
  // path's tool, not hold-to-talk's).
  const holdSupported = (typeof navigator !== "undefined" && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && typeof window !== "undefined" && !!window.MediaRecorder);
  const [voiceChat, setVoiceChat] = React.useState(false); // per-session, off by default
  const voiceChatRef = React.useRef(false);
  React.useEffect(() => { voiceChatRef.current = voiceChat; }, [voiceChat]);
  const holdRef = React.useRef({ holding: false, mr: null });

  const holdEnd = () => {
    // Re-entrancy-safe: also covers "released before the recorder started"
    // (holdStart checks `holding` after the async getUserMedia resolves, so an
    // early release can never leave a hot mic running).
    holdRef.current.holding = false;
    const mr = holdRef.current.mr;
    holdRef.current.mr = null;
    try { if (mr && mr.state === "recording") mr.stop(); } catch (e) {}
  };

  const holdStart = async () => {
    if (holdRef.current.holding || voiceState !== "idle") return; // one capture at a time
    holdRef.current.holding = true;
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (e) { holdRef.current.holding = false; setVoiceErr("Mic blocked — allow access or type instead."); return; }
    if (!holdRef.current.holding) { try { stream.getTracks().forEach((tr) => tr.stop()); } catch (e) {} return; }
    try {
      const mr = new window.MediaRecorder(stream);
      const chunks = [];
      mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      mr.onstop = async () => {
        try { stream.getTracks().forEach((tr) => tr.stop()); } catch (e) {}
        setVoiceState("transcribing");
        try {
          const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
          const fd = new FormData(); fd.append("audio", blob, "nora.webm");
          fd.append("language", cwLocale()); fd.append("context", "nora"); // the page's language + Shape's vocabulary
          const res = await fetch("/api/ai/transcribe", { method: "POST", credentials: "same-origin", body: fd });
          const data = await res.json().catch(() => ({}));
          const transcript = res.ok && data && typeof data.transcript === "string" ? data.transcript.trim() : "";
          if (transcript) { setVoiceErr(null); send(transcript, { voice: true }); } // SENDS — not drafted; spoken, so the reply is written for the ear
          else if (res.status === 401 || res.status === 402) setVoiceErr("Sign in to use voice — or type your question.");
          else setVoiceErr("Didn't catch that — hold to talk, or type.");
        } catch (e) { setVoiceErr("Couldn't transcribe that — type instead."); }
        setVoiceState("idle");
      };
      holdRef.current.mr = mr;
      setVoiceErr(null); setVoiceState("listening");
      mr.start();
      if (!holdRef.current.holding) holdEnd(); // released during recorder setup
    } catch (e) {
      try { stream.getTracks().forEach((tr) => tr.stop()); } catch (e2) {}
      holdRef.current.holding = false;
      setVoiceState("idle"); setVoiceErr("Voice unavailable — type instead.");
    }
  };

  const stopVoice = () => {
    try { if (recogRef.current) recogRef.current.stop(); } catch (e) {}
    try { if (recRef.current && recRef.current.state === "recording") recRef.current.stop(); } catch (e) {}
    holdEnd();
  };

  const startWebSpeech = () => {
    try {
      const rec = new SpeechRec();
      rec.lang = cwSpeechLang(); rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
      let finalText = "";
      rec.onresult = (e) => {
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) finalText += r[0].transcript; else interim += r[0].transcript;
        }
        setDraft((finalText + " " + interim).replace(/\s+/g, " ").trim()); // show transcript live
      };
      rec.onerror = (e) => {
        setVoiceState("idle");
        if (e.error === "not-allowed" || e.error === "service-not-allowed") setVoiceErr("Mic blocked — allow access or type instead.");
        else if (e.error === "no-speech") setVoiceErr("Didn't catch that — try again, or type.");
        else setVoiceErr("Voice hiccuped — type instead.");
      };
      rec.onend = () => setVoiceState((s) => (s === "listening" ? "idle" : s));
      recogRef.current = rec;
      setVoiceErr(null); setVoiceState("listening");
      rec.start();
    } catch (e) { setVoiceState("idle"); setVoiceErr("Voice unavailable — type instead."); }
  };

  const startServerVoice = async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof window === "undefined" || !window.MediaRecorder) {
      setVoiceErr("Voice isn't supported in this browser — type instead."); return;
    }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (e) { setVoiceErr("Mic blocked — allow access or type instead."); return; }
    try {
      const mr = new window.MediaRecorder(stream);
      const chunks = [];
      mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      mr.onstop = async () => {
        try { stream.getTracks().forEach((tr) => tr.stop()); } catch (e) {}
        setVoiceState("transcribing");
        try {
          const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
          const fd = new FormData(); fd.append("audio", blob, "nora.webm");
          fd.append("language", cwLocale()); fd.append("context", "nora");
          const res = await fetch("/api/ai/transcribe", { method: "POST", credentials: "same-origin", body: fd });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data && data.transcript) { setDraft(data.transcript); setVoiceErr(null); }
          else if (res.status === 401 || res.status === 402) setVoiceErr("Sign in to use voice — or type your question.");
          else setVoiceErr("Couldn't transcribe that — type instead.");
        } catch (e) { setVoiceErr("Couldn't transcribe that — type instead."); }
        setVoiceState("idle");
      };
      recRef.current = mr;
      setVoiceErr(null); setVoiceState("listening");
      mr.start();
    } catch (e) {
      // MediaRecorder construction/start failed AFTER getUserMedia granted —
      // release the mic so capture doesn't stay live in the background.
      try { stream.getTracks().forEach((tr) => tr.stop()); } catch (e2) {}
      setVoiceState("idle"); setVoiceErr("Voice unavailable — type instead.");
    }
  };

  const toggleVoice = () => {
    if (voiceState === "transcribing") return;
    if (voiceState === "listening") { stopVoice(); return; }
    setVoiceErr(null);
    if (SpeechRec) startWebSpeech(); else startServerVoice();
  };

  // Stop any in-flight recognition when the widget unmounts.
  React.useEffect(() => () => stopVoice(), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll new messages for the active DB-backed thread while the widget is
  // open. Cheap (≤500 row GET keyed by `since=`); only the active thread
  // polls so background threads stay quiet.
  const lastSeenRef = React.useRef({}); // { [conversationId]: ISOstring }
  const myUserIdRef = React.useRef(null);

  // Tap a message avatar/name → a public-profile view (mirrors the mobile app).
  // Derived tier/bio for demo people; live card via get_public_profile when the
  // message carries a real user id (i.e. an actual signed-in account).
  const [profileFor, setProfileFor] = React.useState(null);
  const [profLive, setProfLive] = React.useState(null);
  const [profFollow, setProfFollow] = React.useState(null);
  // My own display name (for my avatar next to my own messages).
  const [myName, setMyName] = React.useState("You");
  const openProfile = (m) => {
    // Prefer the fullest name we have so initials are 2 letters: in a 1:1 the
    // thread name is the counterpart's full name (the message sender is usually
    // just their first name); in a group, use the sender's name.
    const full = (active && active.who) || "";
    const sender = m && m.who && m.who !== "You" ? m.who : full;
    const who = (active && !active.group && full) ? full : sender;
    if (!who) return;
    const coach = !!(m && m.coach) || /trainer|coach|nutritionist/i.test((active && active.role) || "");
    setProfileFor({ who, role: (m && m.coach) ? "Coach" : ((active && active.role) || ""), coach, userId: (m && m.userId) || (active && active.userId) || null, tier: (m && m.tier) || null });
  };
  const profUid = profileFor && profileFor.userId;
  // Hoisted to the component's top level (hooks rule): the profile preview
  // below is an inline IIFE, not its own component, so the hook cannot live
  // there. `open` gates the read on the preview actually being up.
  const actLine = cwUseActivity(profUid, !!profileFor);
  React.useEffect(() => {
    setProfLive(null);
    setProfFollow(null);
    if (!profUid) return;
    try {
      const cl = window.shapeDb && window.shapeDb.client;
      if (cl && cl.rpc) {
        cl.rpc("get_public_profile", { p_user_id: profUid }).then(function (r) { if (r && r.data) setProfLive(r.data); }).catch(function () {});
        // Follower / following counts (public) — adds real "more info" to the card.
        cl.rpc("get_follow_stats", { p_user_id: profUid }).then(function (r) { const d = r && r.data; const row = Array.isArray(d) ? d[0] : d; if (row) setProfFollow(row); }).catch(function () {});
      }
    } catch (e) {}
  }, [profUid]);

  // Members' profile photos → carry into the chat bubble avatars. Fetch (cached)
  // the public-profile avatar for every author in the active thread + myself.
  const [avatarsByUid, setAvatarsByUid] = React.useState({});
  const [myPhoto, setMyPhoto] = React.useState(null);
  const avatarCacheRef = React.useRef({});
  React.useEffect(() => {
    const cl = window.shapeDb && window.shapeDb.client;
    if (!cl || !cl.rpc) return;
    const msgs = (active && active.messages) || [];
    const ids = [...new Set([myUserIdRef.current, ...msgs.map((m) => m && m.userId)].filter(Boolean))];
    const need = ids.filter((id) => !(id in avatarCacheRef.current));
    if (!need.length) return;
    let cancelled = false;
    Promise.all(need.map((id) =>
      cl.rpc("get_public_profile", { p_user_id: id }).then((r) => {
        const d = r && r.data; const row = Array.isArray(d) ? d[0] : d;
        avatarCacheRef.current[id] = (row && row.avatar) || null;
      }).catch(() => { avatarCacheRef.current[id] = null; })
    )).then(() => {
      if (cancelled) return;
      setAvatarsByUid({ ...avatarCacheRef.current });
      if (myUserIdRef.current) setMyPhoto(avatarCacheRef.current[myUserIdRef.current] || null);
    });
    return () => { cancelled = true; };
  }, [active]);

  // Shape is members-only — the chat bubble is where messages actually send, so
  // gate the composer: approved coaches + active subscribers can type; everyone
  // else (signed-out or free) sees a Join prompt. null = still resolving.
  const [member, setMember] = React.useState(null);
  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/me", { credentials: "same-origin" })
      .then(r => (r.ok ? r.json() : null))
      .then(async (d) => {
        const u = d && d.user;
        if (!cancelled) myUserIdRef.current = u ? u.id : null;
        if (u) {
          try {
            const pr = window.shapeDb && window.shapeDb.getProfile ? await window.shapeDb.getProfile(u.id) : null;
            if (pr && pr.full_name && !cancelled) setMyName(pr.full_name);
          } catch (e) {}
        }
        if (!u) { if (!cancelled) setMember(false); return; }
        const roles = Array.isArray(u.roles) ? u.roles : [];
        const isCoach = u.role === "trainer" || u.role === "nutritionist" || roles.includes("trainer") || roles.includes("nutritionist");
        if (isCoach) { if (!cancelled) setMember(true); return; }
        try {
          const sres = await fetch("/api/stripe/subscription", { credentials: "same-origin", cache: "no-store" });
          const sd = sres.ok ? await sres.json() : null;
          if (!cancelled) setMember(!!(sd && sd.active === true));
        } catch { if (!cancelled) setMember(false); }
      })
      .catch(() => { if (!cancelled) setMember(false); });
    return () => { cancelled = true; };
  }, []);
  React.useEffect(() => {
    if (!open) return;
    const activeThread = (threadsByTab[tabIdx] || [])[activeIdx];
    const convId = activeThread && activeThread.conversationId;
    if (!convId) return;
    let cancelled = false;
    const fetchOnce = async () => {
      const since = lastSeenRef.current[convId];
      const url = `/api/conversations/${encodeURIComponent(convId)}/messages${since ? `?since=${encodeURIComponent(since)}` : ""}`;
      try {
        const res = await fetch(url, { credentials: "same-origin" });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        if (data && data.me && !myUserIdRef.current) myUserIdRef.current = data.me;
        const newRows = Array.isArray(data && data.messages) ? data.messages : [];
        if (!newRows.length) return;
        lastSeenRef.current[convId] = newRows[newRows.length - 1].created_at;
        setThreadsByTab(prev => prev.map((ts, ti) => {
          if (ti !== tabIdx) return ts;
          return ts.map((t, i) => {
            if (i !== activeIdx) return t;
            const me = myUserIdRef.current;
            const mapped = newRows.map(m => {
              const ts2 = new Date(m.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
              const mine = m.sender_id === me;
              return { who: mine ? "You" : t.who, t: m.body, time: ts2, me: mine, userId: m.sender_id || null };
            });
            const merged = since ? [...t.messages, ...mapped] : mapped;
            const last = mapped[mapped.length - 1];
            return { ...t, messages: merged, last: last ? `${last.me ? "You" : t.who}: ${last.t}` : t.last, time: "now" };
          });
        }));
      } catch {}
    };
    fetchOnce();
    const id = setInterval(fetchOnce, 8000);
    return () => { cancelled = true; clearInterval(id); };
  }, [open, tabIdx, activeIdx, threadsByTab]);

  const selectThread = (i) => {
    setActiveByTab(prev => prev.map((v, ti) => ti === tabIdx ? i : v));
    setThreadsByTab(prev => prev.map((ts, ti) => ti !== tabIdx ? ts : ts.map((t, j) => j === i ? { ...t, unread: 0 } : t)));
  };

  const togglePin = (i, e) => {
    e && e.stopPropagation();
    setThreadsByTab(prev => prev.map((ts, ti) => ti !== tabIdx ? ts : ts.map((t, j) => j === i ? { ...t, pinned: !t.pinned } : t)));
  };

  const selectTab = (i) => {
    setTabIdx(i);
    setCreating(false);
    setSearchQ("");
  };

  const createChannel = () => {
    const slug = newName.trim().replace(/^#\s*/, "").replace(/\s+/g, "-").toLowerCase();
    if (!slug) return;
    dirtyRef.current = true;
    const newThread = {
      who: "# " + slug,
      role: newDesc.trim() ? "1 member · just now · " + newDesc.trim() : "1 member · just now",
      last: "You created this channel. Say hi 👋",
      time: "now",
      unread: 0,
      group: true,
      messages: [
        { who: "You", t: `Started #${slug}.${newDesc.trim() ? " " + newDesc.trim() : ""}`, time: "now", me: true },
      ],
    };
    setThreadsByTab(prev => prev.map((ts, ti) => ti !== tabIdx ? ts : [...ts, newThread]));
    setActiveByTab(prev => prev.map((v, ti) => ti === tabIdx ? (threadsByTab[tabIdx]?.length || 0) : v));
    setCreating(false);
    setNewName("");
    setNewDesc("");
  };

  const currentTab = tabs[tabIdx];

  return (
    <React.Fragment>
      <style>{`
        .chw-row:hover .chw-pin { opacity: 1 !important; }
        .chw-row:hover { background: rgba(var(--sh-ink-rgb, 242,237,228),0.03); }
        [data-chat-panel] *::-webkit-scrollbar { width: 0; height: 0; background: transparent; }
        [data-chat-panel] * { scrollbar-width: none; }
        @media (max-width: 640px) {
          .chw-bubble { padding: 14px 20px 14px 16px !important; font-size: 14px !important; gap: 10px !important; right: 16px !important; bottom: 16px !important; }
          .chw-bubble svg { width: 18px !important; height: 18px !important; }
        }
      `}</style>
      {/* The floating launcher bubble is the site-wide globalChatButton.js (a
          single source on every page). ChatWidget renders only the open panel —
          opened via window.__openChat — so there's never a second stacked bubble
          and the launcher doesn't vanish when you open chat. */}

      {isOpen && (
        <div
          role="dialog"
          data-chat-panel
          style={docked ? {
            position: "fixed", inset: 0,
            background: "var(--sh-ground, #1a1612)", color: INK,
            display: "flex", flexDirection: "column",
            fontFamily: sans, overflow: "hidden",
          } : {
            position: "fixed",
            ...(pos ? { left: pos.x, top: pos.y } : { right: 28, bottom: 28 }),
            zIndex: 180,
            width: size.w, maxWidth: "calc(100vw - 40px)",
            height: size.h, maxHeight: "calc(100vh - 40px)",
            background: "var(--sh-ground, #1a1612)", color: INK,
            border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.12)", borderRadius: 14,
            boxShadow: "0 28px 80px rgba(0,0,0,0.6)",
            display: "flex", flexDirection: "column",
            fontFamily: sans, overflow: "hidden",
          }}>
          {/* Hero heading above tabs */}
          <div
            onMouseDown={startDrag}
            title="Drag to move"
            style={{
              padding: "16px 20px 14px",
              background: "linear-gradient(180deg, rgba(var(--sh-accent2-rgb, 10,197,168),0.06), rgba(var(--sh-accent2-rgb, 10,197,168),0))",
              borderBottom: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.06)",
              cursor: "grab", userSelect: "none",
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
            }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <span style={{ color: "var(--sh-ink3, #75706a)", display: "inline-flex", alignItems: "center" }}><DragDots /></span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.18em", color: TEAL_BRIGHT, marginBottom: 2 }}>SHAPE</div>
                <div style={{ fontFamily: serif, fontSize: 26, lineHeight: 1.05, letterSpacing: "-0.02em", color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Your community</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 2, flex: "none" }}>
              {!docked && pos && (
                <button onClick={resetPos} title="Reset position" style={{ background: "transparent", color: "var(--sh-ink2, #a09b94)", border: 0, fontSize: 11, padding: "4px 8px", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.08em" }}>RESET</button>
              )}
              {!docked && (
                <button onClick={popOut} title="Pop out into its own window" aria-label="Pop out chat"
                  style={{ background: "transparent", color: "var(--sh-ink2, #a09b94)", border: 0, padding: "4px 8px", cursor: "pointer", display: "inline-flex", alignItems: "center", lineHeight: 0 }}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M9 3h4v4M13 3 7.4 8.6M11 9.6V12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h2.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              )}
              <button onClick={closePanel} aria-label="Close" style={{ background: "transparent", color: "var(--sh-ink2, #a09b94)", border: 0, fontSize: 22, padding: "2px 10px", cursor: "pointer", lineHeight: 1 }}>×</button>
            </div>
          </div>

          {/* Top tab bar — full width */}
          {tabs.length > 1 && (
            <div
              onMouseDown={startDrag}
              title="Drag to move"
              style={{ display: "flex", borderBottom: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.08)", background: "rgba(var(--sh-ink-rgb, 242,237,228),0.02)", cursor: "grab", userSelect: "none" }}>
              {tabs.map((t, i) => {
                const unread = tabUnread(i);
                const isActive = i === tabIdx;
                return (
                  <button key={t.id} onClick={() => selectTab(i)}
                    style={{
                      flex: 1, padding: "12px 10px", border: 0, background: isActive ? "rgba(var(--sh-accent2-rgb, 10,197,168),0.08)" : "transparent",
                      color: isActive ? INK : "var(--sh-ink2, #a09b94)",
                      fontFamily: sans, fontSize: 12, fontWeight: isActive ? 500 : 400,
                      cursor: "pointer",
                      borderBottom: isActive ? `2px solid ${TEAL}` : "2px solid transparent",
                      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                      whiteSpace: "nowrap", minWidth: 0,
                    }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{t.label}</span>
                    {unread > 0 && <span style={{ background: TEAL, color: PAPER, fontSize: 9.5, fontFamily: "'JetBrains Mono', monospace", padding: "1px 5px", borderRadius: 999, flex: "0 0 auto" }}>{unread}</span>}
                  </button>
                );
              })}
            </div>
          )}

          {/* Feed tab body — the Wall + the community feed. */}
          {currentTab.feed && (
            <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
              {React.createElement(window.CommunityFeed)}
            </div>
          )}

          {/* Body: threads + chat */}
          {/* ⚠ HIDDEN, NOT UNMOUNTED, while the Feed tab is up. This subtree owns
              the message poll, the draft text and the scroll position of every
              open thread; tearing it down on a tab switch would drop an unsent
              draft and restart polling from scratch each time. */}
          <div style={{ display: currentTab.feed ? "none" : "grid", gridTemplateColumns: "260px 1fr", flex: currentTab.feed ? "0 0 auto" : 1, minHeight: 0 }}>
          {/* Sidebar */}
          <div style={{ borderRight: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.08)", display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div style={{ padding: "14px 18px 12px", borderBottom: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.06)" }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.14em", color: TEAL_BRIGHT, marginBottom: 4 }}>
                {currentTab.eyebrow}
              </div>
              <div style={{ fontFamily: serif, fontSize: 17, letterSpacing: "-0.015em" }}>{currentTab.title}</div>
            </div>

            {/* (Sidebar tab bar removed — unified with top nav) */}

            {/* Thread list */}
            <div style={{ overflowY: "auto", flex: 1 }}>
              {currentTab.canCreate && (
                <div style={{ padding: "10px 14px 8px", borderBottom: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.05)" }}>
                  <div style={{ position: "relative" }}>
                    <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--sh-ink3, #75706a)", fontSize: 12, pointerEvents: "none" }}>⌕</span>
                    <input
                      value={searchQ}
                      onChange={(e) => setSearchQ(e.target.value)}
                      placeholder="Search channels"
                      style={{
                        width: "100%", boxSizing: "border-box",
                        background: "rgba(var(--sh-ink-rgb, 242,237,228),0.04)", color: INK,
                        border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.08)", borderRadius: 6,
                        padding: "6px 10px 6px 26px", fontFamily: sans, fontSize: 12,
                        outline: "none",
                      }}
                    />
                    {searchQ && (
                      <button onClick={() => setSearchQ("")}
                        style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "transparent", border: 0, color: "var(--sh-ink2, #a09b94)", fontSize: 14, cursor: "pointer", lineHeight: 1, padding: "2px 6px" }}>×</button>
                    )}
                  </div>
                </div>
              )}
              {(() => {
                const q = searchQ.trim().toLowerCase();
                const base = q
                  ? currentThreads.filter(t => (t.who || "").toLowerCase().includes(q) || (t.role || "").toLowerCase().includes(q) || (t.last || "").toLowerCase().includes(q))
                  : currentThreads;
                // Stable sort: pinned first
                const filtered = base.map((t, i) => ({ t, i })).sort((a, b) => (b.t.pinned ? 1 : 0) - (a.t.pinned ? 1 : 0) || a.i - b.i).map(x => x.t);
                const firstUnpinnedIdx = filtered.findIndex(t => !t.pinned);
                if (q && filtered.length === 0) {
                  return (
                    <div style={{ padding: "22px 18px", textAlign: "center", color: "var(--sh-ink3, #75706a)", fontSize: 12 }}>
                      No channels match "<span style={{ color: INK }}>{searchQ}</span>"
                      {currentTab.canCreate && (
                        <div style={{ marginTop: 10 }}>
                          <button onClick={() => { setNewName(searchQ.toLowerCase().replace(/\s+/g, "-")); setCreating(true); setSearchQ(""); }}
                            style={{ background: "transparent", color: TEAL_BRIGHT, border: `1px solid ${TEAL}`, padding: "5px 10px", borderRadius: 6, fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.08em", cursor: "pointer" }}>
                            + CREATE #{searchQ.toLowerCase().replace(/\s+/g, "-")}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                }
                return filtered.map((t, i) => {
                  const origIdx = currentThreads.indexOf(t);
                  const showDivider = !q && t.pinned && filtered[i + 1] && !filtered[i + 1].pinned;
                  return (
                  <React.Fragment key={origIdx}>
                <div onClick={() => selectThread(origIdx)}
                  className="chw-row"
                  style={{
                    position: "relative",
                    display: "block", width: "100%", textAlign: "left",
                    padding: "12px 18px", border: 0, background: origIdx === activeIdx ? "rgba(var(--sh-accent2-rgb, 10,197,168),0.10)" : "transparent",
                    borderLeft: origIdx === activeIdx ? `2px solid ${TEAL}` : "2px solid transparent",
                    borderTop: i === 0 ? "none" : "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.05)",
                    cursor: "pointer", color: "inherit", fontFamily: "inherit",
                  }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3, gap: 6 }}>
                    <div style={{ minWidth: 0, flex: 1, fontSize: 13, fontWeight: 500, fontFamily: t.group ? "'JetBrains Mono', monospace" : sans, display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 6 }}>
                        {t.online && <span style={{ flex: "none", width: 7, height: 7, borderRadius: 999, background: "#3ddc84", boxShadow: "0 0 0 2px rgba(61,220,132,0.2)" }} />}
                        {t.who}
                      </span>
                      {t.pinned && <span style={{ flex: "none", fontSize: 8.5, color: "var(--sh-accent-ink, #2ee0c4)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.08em", background: "rgba(var(--sh-accent2-rgb, 10,197,168),0.12)", padding: "1px 5px", borderRadius: 3 }}>PINNED</span>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "none" }}>
                      <button
                        className="chw-pin"
                        onClick={(e) => togglePin(origIdx, e)}
                        title={t.pinned ? "Unpin" : "Pin to top"}
                        aria-label={t.pinned ? "Unpin channel" : "Pin channel"}
                        style={{
                          opacity: t.pinned ? 1 : 0,
                          background: "transparent", border: 0, padding: "2px 4px",
                          cursor: "pointer", fontSize: 12, lineHeight: 1,
                          color: t.pinned ? TEAL_BRIGHT : "var(--sh-ink2, #a09b94)",
                          transition: "opacity 120ms",
                        }}>
                        {t.pinned ? "📌" : "📍"}
                      </button>
                      <div style={{ fontSize: 10, color: "var(--sh-ink3, #75706a)", fontFamily: "'JetBrains Mono', monospace" }}>{t.time || ""}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: "var(--sh-ink2, #a09b94)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.last}</div>
                    {t.unread > 0 && <span style={{ background: TEAL, color: PAPER, fontSize: 9.5, fontFamily: "'JetBrains Mono', monospace", padding: "2px 6px", borderRadius: 999, minWidth: 16, textAlign: "center" }}>{t.unread}</span>}
                  </div>
                </div>
                {showDivider && (
                  <div style={{ padding: "6px 18px 2px", fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.14em", color: "var(--sh-ink3, #75706a)", borderTop: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.05)", background: "rgba(var(--sh-ink-rgb, 242,237,228),0.015)" }}>
                    ALL CHANNELS
                  </div>
                )}
                  </React.Fragment>
                  );
                });
              })()}

              {currentTab.canCreate && !creating && (
                <button onClick={() => setCreating(true)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    width: "100%", padding: "12px 18px", border: 0,
                    borderTop: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.05)",
                    background: "transparent", color: TEAL_BRIGHT,
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.1em",
                    cursor: "pointer",
                  }}>
                  + NEW CHANNEL
                </button>
              )}

              {currentTab.canCreate && creating && (
                <div style={{ padding: "14px 18px", borderTop: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.08)", background: "rgba(var(--sh-accent2-rgb, 10,197,168),0.04)" }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.12em", color: TEAL_BRIGHT, marginBottom: 8 }}>NEW CHANNEL</div>
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value.replace(/^#\s*/, "").replace(/\s+/g, "-").toLowerCase())}
                    placeholder="channel-name"
                    style={{
                      width: "100%", boxSizing: "border-box", background: "rgba(var(--sh-ink-rgb, 242,237,228),0.04)", color: INK,
                      border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.12)", borderRadius: 6,
                      padding: "7px 10px", fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                      outline: "none", marginBottom: 6,
                    }}
                  />
                  <input
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    placeholder="What's this channel about?"
                    style={{
                      width: "100%", boxSizing: "border-box", background: "rgba(var(--sh-ink-rgb, 242,237,228),0.04)", color: INK,
                      border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.12)", borderRadius: 6,
                      padding: "7px 10px", fontFamily: sans, fontSize: 12,
                      outline: "none", marginBottom: 10,
                    }}
                  />
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={createChannel} disabled={!newName.trim()}
                      style={{
                        flex: 1, background: newName.trim() ? TEAL : "rgba(var(--sh-ink-rgb, 242,237,228),0.08)",
                        color: newName.trim() ? PAPER : "var(--sh-ink3, #75706a)",
                        border: 0, padding: "7px 10px", borderRadius: 6,
                        fontFamily: sans, fontSize: 12, fontWeight: 500,
                        cursor: newName.trim() ? "pointer" : "not-allowed",
                      }}>Create</button>
                    <button onClick={() => { setCreating(false); setNewName(""); setNewDesc(""); }}
                      style={{
                        background: "transparent", color: "var(--sh-ink2, #a09b94)",
                        border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.12)", padding: "7px 10px", borderRadius: 6,
                        fontFamily: sans, fontSize: 12, cursor: "pointer",
                      }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Chat pane */}
          <div style={{ display: "flex", flexDirection: "column", minHeight: 0, position: "relative" }}>
            {profileFor && (() => {
              const isPrivate = !!(profLive && profLive.is_public === false);
              const points = (profLive && Number.isFinite(profLive.points)) ? profLive.points : null;
              const isCoach = profileFor.coach;
              // Nora is staff, not a member — no tier/score/full-profile, concierge card instead.
              const isNora = !profileFor.userId && String(profileFor.who || "").trim() === "Nora";
              const tier = points != null ? cwTierForPoints(points, isCoach) : (profileFor.tier || cwHashTier(profileFor.who, isCoach));
              const tc = isNora ? TEAL_BRIGHT : cwTierColor(tier);
              const roleLabel = isCoach ? (/nutrition/i.test(profileFor.role || "") ? "Nutritionist" : "Trainer") : "Client";
              const first = String(profileFor.who).split(" ")[0] || "This member";
              const pronouns = !isPrivate && profLive && profLive.pronouns;
              const goal = !isPrivate && profLive && profLive.goal;
              const link = !isPrivate && profLive && profLive.link;
              const followers = profFollow && Number.isFinite(profFollow.followers) ? profFollow.followers : null;
              const following = profFollow && Number.isFinite(profFollow.following) ? profFollow.following : null;
              const handle = "@" + String(profileFor.who).toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 18);
              const bio = isNora
                ? "Nora is Shape's concierge — the assistant built into the app. Ask her about finding a coach, billing, integrations, your plan or your account; she brings in the human Shape team whenever she can't sort something herself."
                : (isPrivate ? null : ((profLive && profLive.bio) || `${profileFor.who} is part of the Shape community${isCoach ? " as a coach" : ""}. ${isCoach ? "Browse their coaching profile to see packages and book a session." : "Say hi or cheer them on."}`));
              // Full-profile link → the SAME person shown here. Real accounts load
              // by id; for demo people we pass the name + role + this card's points
              // and avatar so the full page matches (same tier + photo, not a re-derive).
              const fullProfileHref = (() => {
                if (profileFor.userId) return `/newdesign/MemberProfile.html?u=${encodeURIComponent(profileFor.userId)}`;
                const role = isCoach ? (/nutrition/i.test(profileFor.role || "") ? "nutritionist" : "trainer") : "client";
                const ptsMap = { base: 200, tempo: 950, form: 2400, peak: 5400, legend: 15400, certified: 200, pro: 950, elite: 2400, master: 5400, icon: 15400 };
                const ptsForLink = points != null ? points : (ptsMap[String(tier).toLowerCase()] || 200);
                const avatarUrl = (profLive && profLive.avatar) || cwDemoFace(profileFor.who) || "";
                const q = new URLSearchParams({ name: profileFor.who, role: role, pts: String(ptsForLink) });
                if (avatarUrl) q.set("avatar", avatarUrl);
                return `/newdesign/MemberProfile.html?${q.toString()}`;
              })();
              const Stat = (st) => (
                <div style={{ flex: 1, minWidth: 0, borderRadius: 12, border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.1)", background: "rgba(var(--sh-ink-rgb, 242,237,228),0.03)", padding: "10px 12px" }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--sh-ink3, #75706a)" }}>{st.label}</div>
                  <div style={{ marginTop: 3, fontFamily: sans, fontSize: 15, fontWeight: 600, color: st.color || INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{st.value}</div>
                </div>
              );
              const Row = (rw) => (
                <div style={{ display: "flex", gap: 10, padding: "9px 0", borderTop: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.07)" }}>
                  <div style={{ flex: "none", width: 84, fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--sh-ink3, #75706a)", paddingTop: 1 }}>{rw.label}</div>
                  <div style={{ flex: 1, minWidth: 0, fontFamily: sans, fontSize: 13.5, color: "rgba(var(--sh-ink-rgb, 242,237,228),0.85)", lineHeight: 1.4, wordBreak: "break-word" }}>{rw.value}</div>
                </div>
              );
              return (
                <div style={{ position: "absolute", inset: 0, zIndex: 12, background: "var(--sh-ground, #1a1612)", display: "flex", flexDirection: "column", overflowY: "auto" }}>
                  <div style={{ padding: "14px 18px", borderBottom: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.08)", display: "flex", alignItems: "center", gap: 12 }}>
                    <button onClick={() => setProfileFor(null)} style={{ background: "transparent", border: 0, color: TEAL_BRIGHT, cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.1em" }}>← BACK</button>
                    {!isNora && <a href={fullProfileHref}
                      style={{ marginLeft: "auto", flex: "none", padding: "7px 14px", borderRadius: 999, background: TEAL, color: PAPER, textDecoration: "none", fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", boxShadow: "0 2px 10px rgba(var(--sh-accent2-rgb, 10,197,168),0.35)" }}>Full profile →</a>}
                  </div>
                  <div style={{ padding: 18 }}>
                    <div style={{ borderRadius: 18, border: `1px solid ${cwHexA(tc, 0.3333)}`, background: `radial-gradient(130% 120% at 78% 14%, ${cwHexA(tc, 0.1490)}, transparent 55%), rgba(var(--sh-ink-rgb, 242,237,228),0.03)`, padding: 18, display: "flex", alignItems: "center", gap: 16 }}>
                      <CwFacetAvatar size={64} c={tc} initial={cwInitials(profileFor.who)} photo={(profLive && profLive.avatar) || (profileFor && !profileFor.userId ? cwDemoFace(profileFor.who) : undefined)} live={isNora || !!((profileFor && profileFor.online) || (window.ShapeWebPresence && profileFor && window.ShapeWebPresence.isOnline(profileFor.userId)))} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 7, fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase" }}>
                          <span style={{ color: tc }}>{isNora ? "Always online" : tier}</span><span style={{ color: "var(--sh-ink3, #75706a)" }}>·</span><span style={{ color: "var(--sh-ink2, #a09b94)" }}>{isNora ? "Shape's Concierge" : roleLabel}</span>
                        </div>
                        {actLine && <div style={{ marginTop: 4, fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: TEAL_BRIGHT }}>{actLine}</div>}
                        <div style={{ marginTop: 5, fontFamily: sans, fontSize: 21, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1, color: INK }}>{profileFor.who}</div>
                        <div style={{ marginTop: 6, fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.06em", color: "var(--sh-ink3, #75706a)" }}>{handle}</div>
                        {(followers != null || following != null) && (
                          <div style={{ marginTop: 7, display: "flex", gap: 12, fontFamily: sans, fontSize: 11.5, color: "var(--sh-ink2, #a09b94)" }}>
                            <span><b style={{ color: INK, fontWeight: 700 }}>{(followers || 0).toLocaleString()}</b> followers</span>
                            <span><b style={{ color: INK, fontWeight: 700 }}>{(following || 0).toLocaleString()}</b> following</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
                      {isNora ? (
                        <React.Fragment>
                          <Stat label="Status" value="Online" color={tc} />
                          <Stat label="Replies" value="Instantly" />
                          <Stat label="Escalates to" value="Shape team" />
                        </React.Fragment>
                      ) : (
                        <React.Fragment>
                          <Stat label="Tier" value={tier} color={tc} />
                          <Stat label="Shape Score" value={points != null ? points.toLocaleString() + " pts" : "—"} />
                          <Stat label="Role" value={roleLabel} />
                        </React.Fragment>
                      )}
                    </div>
                    {isPrivate ? (
                      <div style={{ marginTop: 14, borderRadius: 14, border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.12)", background: "rgba(var(--sh-ink-rgb, 242,237,228),0.03)", padding: 16, display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <span style={{ fontSize: 16 }} aria-hidden>🔒</span>
                        <div style={{ fontFamily: sans, fontSize: 13.5, color: "rgba(var(--sh-ink-rgb, 242,237,228),0.7)", lineHeight: 1.5 }}>{first} keeps their profile private — only their name and tier are shown.</div>
                      </div>
                    ) : (
                      <React.Fragment>
                        <div style={{ marginTop: 14, borderRadius: 14, border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.1)", background: "rgba(var(--sh-ink-rgb, 242,237,228),0.03)", padding: 16, fontFamily: sans, fontSize: 14, color: "rgba(var(--sh-ink-rgb, 242,237,228),0.75)", lineHeight: 1.5 }}>{bio}</div>
                        {isNora && (
                          <div style={{ marginTop: 14, borderRadius: 14, border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.1)", background: "rgba(var(--sh-ink-rgb, 242,237,228),0.03)", padding: "4px 16px 12px" }}>
                            <Row label="Helps with" value="Finding a coach · billing · integrations · your plan & account" />
                            <Row label="Can't sort it?" value="She flags it for the human Shape team to follow up." />
                          </div>
                        )}
                        {(pronouns || goal || link) && (
                          <div style={{ marginTop: 14, borderRadius: 14, border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.1)", background: "rgba(var(--sh-ink-rgb, 242,237,228),0.03)", padding: "4px 16px 12px" }}>
                            {pronouns && <Row label="Pronouns" value={pronouns} />}
                            {goal && <Row label="Goal" value={goal} />}
                            {link && <Row label="Link" value={<a href={/^https?:/i.test(link) ? link : "https://" + link} target="_blank" rel="noopener noreferrer" style={{ color: TEAL_BRIGHT, textDecoration: "none" }}>{String(link).replace(/^https?:\/\//, "")}</a>} />}
                          </div>
                        )}
                      </React.Fragment>
                    )}
                    <div style={{ marginTop: 16, display: "flex", justifyContent: "center" }}>
                      <button onClick={() => setProfileFor(null)} style={{ padding: "11px 44px", borderRadius: 999, border: 0, background: TEAL, color: PAPER, cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase" }}>Message {first} →</button>
                    </div>
                  </div>
                </div>
              );
            })()}
            <div
              onMouseDown={startDrag}
              title="Drag to move"
              style={{ padding: "14px 18px", borderBottom: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.08)", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "grab", userSelect: "none" }}>
              <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 10 }}>
                <DragDots />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, fontFamily: active?.group ? "'JetBrains Mono', monospace" : sans }}>{active?.who}</div>
                  {active?.role && <div style={{ fontSize: 11, color: "var(--sh-ink2, #a09b94)", marginTop: 2 }}>{active.role}</div>}
                </div>
              </div>
            </div>

            <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "18px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
              {active?.messages?.map((m, i) => {
                const rKey = `${tabIdx}:${activeByTab[tabIdx]}:${i}`;
                const myReaction = reactions[rKey];
                const pickerOpen = reactionPickerFor === rKey;
                const longPressRef = { id: null };
                const startLongPress = (e) => {
                  e.preventDefault();
                  longPressRef.id = setTimeout(() => setReactionPickerFor(rKey), 380);
                };
                const cancelLongPress = () => { if (longPressRef.id) clearTimeout(longPressRef.id); };
                // Full name where possible (thread name in a 1:1) so initials are 2 letters.
                const avatarName = (active && active.group) ? (m.who || (active && active.who)) : ((active && active.who) || m.who);
                // Coaches use the coach ladder; clients the client ladder (same as
                // everywhere). Incoming = sender's role; mine = the viewer's role.
                const mCoach = !!(m && m.coach) || /trainer|coach|nutritionist/i.test((active && active.role) || "");
                const myCoach = (typeof window !== "undefined" && typeof window.shapeViewerRole === "function") ? /trainer|coach|nutritionist/i.test(window.shapeViewerRole() || "") : false;
                // Bubble carries the sender's tier color (incoming = their tier,
                // mine = my tier) so chat stays coordinated with the avatars/feed.
                const bubbleTC = cwTierColor(m && m.tier ? String(m.tier) : cwHashTier(m.me ? myName : avatarName, m.me ? myCoach : mCoach));
                return (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: m.me ? "flex-end" : "flex-start", position: "relative" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 11, flexDirection: m.me ? "row-reverse" : "row", maxWidth: "90%" }}>
                    {!m.me && (
                      <div style={{ alignSelf: "flex-start" }}>
                        <CwFacetAvatar size={32} c={cwTierColor(m && m.tier ? String(m.tier) : cwHashTier(avatarName, mCoach))} initial={cwInitials(avatarName)} photo={(m && m.userId ? (avatarsByUid[m.userId] || undefined) : cwDemoFace(avatarName))} live={!!(window.ShapeWebPresence && m && m.userId && window.ShapeWebPresence.isOnline(m.userId))} onClick={() => openProfile(m)} />
                      </div>
                    )}
                    {m.me && (
                      <div style={{ alignSelf: "flex-start" }}>
                        <CwFacetAvatar size={32} c={cwTierColor(m && m.tier ? String(m.tier) : cwHashTier(myName, myCoach))} initial={cwInitials(myName)} photo={myPhoto || undefined} live={!!(window.ShapeWebPresence && typeof window.ShapeWebPresence.visible === "function" && window.ShapeWebPresence.visible())} />
                      </div>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: m.me ? "flex-end" : "flex-start", minWidth: 0 }}>
                      {!m.me && active?.group && (
                        <button onClick={() => openProfile(m)} style={{ background: "transparent", border: 0, padding: "0 4px", cursor: "pointer", textAlign: "left", fontSize: 10.5, color: m.coach ? TEAL_BRIGHT : "var(--sh-ink2, #a09b94)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.05em", marginBottom: 3 }}>
                          {m.who}{m.coach ? " · COACH" : ""}
                        </button>
                      )}
                      <div style={{ position: "relative" }}>
                    <div
                      onContextMenu={(e) => { e.preventDefault(); setReactionPickerFor(pickerOpen ? null : rKey); }}
                      onDoubleClick={(e) => { e.preventDefault(); toggleReaction(rKey, "❤️"); }}
                      onMouseDown={startLongPress}
                      onMouseUp={cancelLongPress}
                      onMouseLeave={cancelLongPress}
                      onTouchStart={startLongPress}
                      onTouchEnd={cancelLongPress}
                      style={{
                        maxWidth: "100%", width: "fit-content", overflowWrap: "anywhere", padding: "9px 13px", borderRadius: 12,
                        background: cwHexA(bubbleTC, m.me ? 0.19 : 0.13),
                        color: INK,
                        border: "1px solid " + cwHexA(bubbleTC, 0.33),
                        borderTopRightRadius: m.me ? 3 : 12,
                        borderTopLeftRadius: m.me ? 12 : 3,
                        fontSize: 13.5, lineHeight: 1.45,
                        cursor: "pointer", userSelect: "none",
                      }}>{m.t}</div>
                    {pickerOpen && (
                      <div style={{
                        position: "absolute",
                        bottom: "calc(100% + 6px)",
                        [m.me ? "right" : "left"]: 0,
                        display: "flex", gap: 2, padding: "5px 7px",
                        background: "rgba(var(--sh-ground-rgb, 26,22,18),0.98)",
                        border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.12)",
                        borderRadius: 999,
                        boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
                        zIndex: 5,
                      }}
                        onMouseLeave={() => setReactionPickerFor(null)}>
                        {REACTION_EMOJIS.map(em => (
                          <button key={em}
                            onClick={() => toggleReaction(rKey, em)}
                            style={{
                              background: myReaction === em ? "rgba(var(--sh-accent2-rgb, 10,197,168),0.22)" : "transparent",
                              border: 0, borderRadius: 999, width: 30, height: 30,
                              cursor: "pointer", fontSize: 16, lineHeight: 1,
                              display: "flex", alignItems: "center", justifyContent: "center",
                            }}>{em}</button>
                        ))}
                      </div>
                    )}
                    {myReaction && (
                      <div style={{
                        position: "absolute",
                        bottom: -10,
                        [m.me ? "left" : "right"]: -6,
                        background: "rgba(var(--sh-ground-rgb, 26,22,18),0.96)",
                        border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.14)",
                        borderRadius: 999,
                        padding: "2px 6px",
                        fontSize: 12,
                        lineHeight: 1,
                        boxShadow: "0 4px 12px rgba(0,0,0,0.35)",
                        cursor: "pointer",
                        zIndex: 2,
                      }}
                        onClick={() => toggleReaction(rKey, myReaction)}
                        title="Remove reaction">{myReaction}</div>
                    )}
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize: 10, color: "var(--sh-ink3, #75706a)", fontFamily: "'JetBrains Mono', monospace", marginTop: myReaction ? 10 : 4, padding: "0 4px" }}>{m.time}</div>
                  {!m.me && isSupport && (
                    <button onClick={() => speakNora(m.t, { explicit: true })} title="Read this aloud" aria-label="Read this aloud"
                      style={{ marginTop: 4, display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 999, border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.14)", background: "transparent", color: "var(--sh-ink2, #a09b94)", fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer" }}>🔊 Listen</button>
                  )}
                  {!m.me && Array.isArray(m.actions) && m.actions.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 8, maxWidth: "92%" }}>
                      {m.actions.map((a, ai) => (
                        a.type === "proposal"
                          ? <CwProposalCard key={ai} a={a} />
                          : <a key={ai} href={a.url || "#"}
                              onClick={(e) => { if (!a.url) e.preventDefault(); }}
                              style={{ textDecoration: "none", border: `1px solid ${TEAL}`, background: "rgba(var(--sh-accent2-rgb, 10,197,168),0.10)", color: "var(--sh-accent-ink, #2ee0c4)", borderRadius: 14, padding: "7px 12px", fontFamily: sans, fontSize: 12, fontWeight: 500, cursor: "pointer", display: "inline-flex", flexDirection: "column", lineHeight: 1.3 }}>
                              <span>{a.label}</span>
                              {a.meta && <span style={{ fontSize: 10, opacity: 0.7 }}>{a.meta}</span>}
                            </a>
                      ))}
                    </div>
                  )}
                </div>
                );
              })}
              {typing && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--sh-ink2, #a09b94)", fontSize: 12, fontStyle: "italic" }}>
                  <TypingDots />{isSupport ? "Nora is typing…" : "someone is typing…"}
                </div>
              )}
              {!typing && isSupport && active?.quick?.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 2 }}>
                  {active.quick.map((label) => (
                    <button key={label} onClick={() => send(label)}
                      style={{
                        border: `1px solid ${TEAL}`, background: "transparent", color: TEAL_BRIGHT,
                        borderRadius: 999, padding: "7px 12px", fontFamily: sans, fontSize: 12,
                        fontWeight: 500, cursor: "pointer",
                      }}>{label}</button>
                  ))}
                </div>
              )}
            </div>

            {(member === false && !isSupport) ? (
              <div style={{ padding: "14px", borderTop: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.08)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 16 }} aria-hidden>🔒</span>
                <div style={{ flex: 1, minWidth: 150, fontFamily: sans, fontSize: 12.5, color: "rgba(var(--sh-ink-rgb, 242,237,228),0.72)", lineHeight: 1.4 }}>Become a Shape member to send messages.</div>
                <a href="/pricing" style={{ fontFamily: sans, fontSize: 12, fontWeight: 600, background: TEAL, color: PAPER, borderRadius: 999, padding: "8px 14px", textDecoration: "none", whiteSpace: "nowrap" }}>Join · $5/mo</a>
              </div>
            ) : (
            <React.Fragment>
            {isSupport && (
              <div style={{ padding: "8px 14px 0", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => setNoraEnabled(!noraVoice.enabled)} title="Read Nora's replies aloud"
                  style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 9px", borderRadius: 999, border: `1px solid ${noraVoice.enabled ? TEAL : "rgba(var(--sh-ink-rgb, 242,237,228),0.14)"}`, background: noraVoice.enabled ? "rgba(var(--sh-accent2-rgb, 10,197,168),0.12)" : "transparent", color: noraVoice.enabled ? "var(--sh-accent-ink, #2ee0c4)" : "var(--sh-ink2, #a09b94)", fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer" }}>
                  {noraVoice.enabled ? "🔊" : "🔇"} Voice {noraVoice.enabled ? "on" : "off"}
                </button>
                {holdSupported && (
                  // Mode flips ALWAYS stop any active capture first (Codex P1:
                  // dictation started before the flip would otherwise keep a
                  // live mic behind the swapped-in hold button). Monochrome
                  // mark only — no colored emoji on new additions.
                  <button type="button" onClick={() => { stopVoice(); setVoiceChat(v => !v); }} title="Hold the mic to talk — your words send as a message and Nora's reply plays aloud"
                    aria-pressed={voiceChat}
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 9px", borderRadius: 999, border: `1px solid ${voiceChat ? TEAL : "rgba(var(--sh-ink-rgb, 242,237,228),0.14)"}`, background: voiceChat ? "rgba(var(--sh-accent2-rgb, 10,197,168),0.12)" : "transparent", color: voiceChat ? "var(--sh-accent-ink, #2ee0c4)" : "var(--sh-ink2, #a09b94)", fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer" }}>
                    Voice chat {voiceChat ? "on" : "off"}
                  </button>
                )}
                <div style={{ display: "inline-flex", borderRadius: 999, border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.14)", overflow: "hidden" }}>
                  {["supportive", "direct"].map(tn => (
                    <button key={tn} onClick={() => setNoraTone(tn)} title={tn === "supportive" ? "Warm and encouraging" : "Concise and factual"}
                      style={{ padding: "5px 10px", border: 0, background: noraVoice.tone === tn ? TEAL : "transparent", color: noraVoice.tone === tn ? PAPER : "var(--sh-ink2, #a09b94)", fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer" }}>{tn}</button>
                  ))}
                </div>
                <select value={noraVoice.voice} onChange={(e) => setNoraVoiceId(e.target.value)} title="Nora's voice"
                  style={{ background: "rgba(var(--sh-ink-rgb, 242,237,228),0.06)", color: INK, border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.14)", borderRadius: 999, padding: "5px 8px", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, cursor: "pointer" }}>
                  <option value="auto">Auto voice</option>
                  {NORA_VOICES.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
                </select>
              </div>
            )}
            {isSupport && (voiceState !== "idle" || voiceErr || speakNotice) && (
              <div style={{ padding: "0 14px 6px", fontFamily: sans, fontSize: 11.5, lineHeight: 1.4, color: (voiceErr || speakNotice) && voiceState === "idle" ? "var(--sh-gold, #d8a23a)" : (voiceState === "listening" ? "#e0463c" : "var(--sh-ink2, #a09b94)") }}>
                {voiceState === "listening" ? (voiceChat ? "● Recording… release to send" : "● Listening… tap the mic to stop")
                  : voiceState === "transcribing" ? "Transcribing…"
                  : (voiceErr || speakNotice)}
              </div>
            )}
            <div style={{ padding: "12px 14px", borderTop: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.08)", display: "flex", gap: 8, alignItems: "flex-end" }}>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder={active?.group ? `Message ${active.who}…` : `Message ${active?.who?.split(" ")[0] || "…"}`}
                rows={1}
                style={{
                  flex: 1, resize: "none", background: "rgba(var(--sh-ink-rgb, 242,237,228),0.04)", color: INK,
                  border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.1)", borderRadius: 8,
                  padding: "10px 12px", fontFamily: sans, fontSize: 13.5, lineHeight: 1.4,
                  outline: "none", minHeight: 38, maxHeight: 100,
                }}
              />
              {isSupport && voiceChat && holdSupported ? (
                // Voice-chat mode: HOLD to talk — press records, release
                // transcribes + SENDS. Pointer events cover mouse + touch;
                // leave/cancel are releases so a drag-off never leaves a hot
                // mic. Keyboard path: hold Space/Enter down to record, release
                // to send (e.repeat guarded so key-repeat can't re-enter).
                <button
                  type="button"
                  onPointerDown={(e) => { e.preventDefault(); holdStart(); }}
                  onPointerUp={holdEnd}
                  onPointerLeave={holdEnd}
                  onPointerCancel={holdEnd}
                  onKeyDown={(e) => { if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); holdStart(); } }}
                  onKeyUp={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); holdEnd(); } }}
                  onBlur={holdEnd}
                  onContextMenu={(e) => e.preventDefault()}
                  title="Hold to talk — releases to send"
                  aria-label="Hold to talk — press and hold (or hold Space) to record, release to send"
                  style={{
                    flex: "0 0 auto", width: 38, height: 38, borderRadius: 8,
                    cursor: voiceState === "transcribing" ? "default" : "pointer",
                    touchAction: "none", userSelect: "none", WebkitUserSelect: "none",
                    border: voiceState === "listening" ? `1px solid ${TEAL}` : "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.1)",
                    background: voiceState === "listening" ? "rgba(var(--sh-accent2-rgb, 10,197,168),0.18)" : "rgba(var(--sh-ink-rgb, 242,237,228),0.04)",
                    color: "var(--sh-accent-ink, #2ee0c4)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                  {voiceState === "transcribing" ? <TypingDots /> : <MicGlyph />}
                </button>
              ) : isSupport && voiceSupported && (
                <button type="button" onClick={toggleVoice} title={voiceState === "listening" ? "Stop listening" : "Speak to Nora"} aria-label={voiceState === "listening" ? "Stop listening" : "Speak to Nora"}
                  style={{
                    flex: "0 0 auto", width: 38, height: 38, borderRadius: 8,
                    cursor: voiceState === "transcribing" ? "default" : "pointer",
                    border: voiceState === "listening" ? "1px solid #e0463c" : "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.1)",
                    background: voiceState === "listening" ? "rgba(224,70,60,0.16)" : "rgba(var(--sh-ink-rgb, 242,237,228),0.04)",
                    color: voiceState === "listening" ? "#e0463c" : TEAL_BRIGHT,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                  {voiceState === "transcribing" ? <TypingDots /> : <MicGlyph />}
                </button>
              )}
              <button onClick={send} disabled={!draft.trim()}
                style={{
                  background: draft.trim() ? TEAL : "rgba(var(--sh-ink-rgb, 242,237,228),0.08)",
                  color: draft.trim() ? PAPER : "var(--sh-ink3, #75706a)",
                  border: 0, padding: "10px 16px", borderRadius: 8,
                  fontFamily: sans, fontSize: 13, fontWeight: 500,
                  cursor: draft.trim() ? "pointer" : "not-allowed",
                }}>Send</button>
            </div>
            </React.Fragment>
            )}
          </div>
          </div>
          {/* Resize handle (bottom-right corner) — not shown when popped out */}
          {!docked && (
            <div
              onMouseDown={startResize}
              onDoubleClick={resetSize}
              title="Drag to resize · double-click to reset"
              style={{
                position: "absolute", right: 0, bottom: 0, width: 18, height: 18,
                cursor: "nwse-resize",
                background: "linear-gradient(135deg, transparent 50%, rgba(var(--sh-accent2-rgb, 10,197,168),0.55) 50%, rgba(var(--sh-accent2-rgb, 10,197,168),0.55) 62%, transparent 62%, transparent 72%, rgba(var(--sh-accent2-rgb, 10,197,168),0.35) 72%, rgba(var(--sh-accent2-rgb, 10,197,168),0.35) 84%, transparent 84%)",
                borderBottomRightRadius: 14,
              }}
            />
          )}
        </div>
      )}
    </React.Fragment>
  );
}

function MicGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="9" y1="22" x2="15" y2="22" />
    </svg>
  );
}

function TypingDots() {
  const [n, setN] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => setN(x => (x+1) % 3), 350);
    return () => clearInterval(id);
  }, []);
  return (
    <span style={{ display: "inline-flex", gap: 3 }}>
      {[0,1,2].map(i => (
        <span key={i} style={{ width: 5, height: 5, borderRadius: 999, background: "currentColor", opacity: n === i ? 1 : 0.3, transition: "opacity 200ms" }} />
      ))}
    </span>
  );
}

function DragDots() {
  return (
    <span aria-hidden style={{ display: "inline-grid", gridTemplateColumns: "repeat(2, 3px)", gap: 2, opacity: 0.45, flex: "0 0 auto" }}>
      {[0,1,2,3,4,5].map(i => (
        <span key={i} style={{ width: 3, height: 3, borderRadius: 999, background: "currentColor" }} />
      ))}
    </span>
  );
}

// Customer-support replies for the Help tab.
function supportReply(text) {
  const low = String(text || "").toLowerCase();
  if (/billing|price|cost|refund|charge|stripe|invoice|subscription/.test(low))
    return "Got it — I'll route this to billing. What's the email on the account so we can pull it up?";
  if (/coach|trainer|nutrition|marketplace|find a coach/.test(low))
    return "Tell me your goal and city and I'll point you to the right coach or nutritionist on Shape.";
  if (/app|bug|crash|android|iphone|ios|login|log in|password|account/.test(low))
    return "Sorry about that. Send the device + what's happening and our support team can troubleshoot from there.";
  if (/cancel|delete|close.*account/.test(low))
    return "I can help with that. Confirm the account email and a teammate will follow up to finish it.";
  return "Thanks — a Shape teammate will follow up here and by email shortly. Anything else I can help with?";
}

// Different replies for 1:1 vs group. For group chats, a random member responds.
function pickReply(thread, text) {
  const low = text.toLowerCase();
  if (thread.group) {
    // pull a member name from the thread, excluding "You"
    const members = [...new Set(thread.messages.filter(m => !m.me).map(m => m.who))];
    const who = members.length ? members[Math.floor(Math.random() * members.length)] : "Someone";
    const replies = [
      `Love that. Keep us posted.`,
      `Same here — week 2 and fired up.`,
      `@You big energy. Let's go.`,
      `Bookmarking this thread.`,
      `Respect. That takes consistency.`,
      `Did a similar block last year. Game changer.`,
    ];
    return { who, text: replies[Math.floor(Math.random() * replies.length)] };
  }
  const who = thread.who.split(" ")[0];
  if (low.includes("?")) return { who, text: `Good question — let me pull that up and get back to you in a bit.` };
  if (low.match(/thanks|thank you|appreciate/)) return { who, text: `Anytime. Keep it up.` };
  if (low.match(/sick|hurt|pain|injur/)) return { who, text: `Okay — let's back off today. I'll adjust the plan and message you a swap.` };
  if (low.match(/pr|crushed|nailed|done/)) return { who, text: `Huge. Proud of you. Logging it for the weekly review.` };
  if (low.match(/meal|food|eat|macro/)) return { who, text: `I'll push an updated meal template to your Nutri tab — check in an hour.` };
  if (low.match(/skip|cant|can't|miss/)) return { who, text: `No problem — I'll reshuffle the week. Rest is part of the plan.` };
  const generic = [ `Got it — noted.`, `Sounds good, keep me posted.`, `Copy that. I'll check in Thursday.`, `Nice. Stay with it.` ];
  return { who, text: generic[Math.floor(Math.random() * generic.length)] };
}

Object.assign(window, { ChatWidget });
