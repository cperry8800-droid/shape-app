// ═══════════════════════════════════════════════════════════════
// SHAPE · Living Identity — DESKTOP web layout (shared)
// A genuine website composition (not a scaled phone): sticky top nav,
// split hero with the direction's signature visual, a full-width
// "living signals" band, and a two-column content grid that collapses
// to one column on narrow viewports.
//
// Drives BOTH directions via <DesktopProfile direction="terrain"|"signal">.
//   terrain → topographic contour field + ridgeline ascent
//   signal  → the breathing instrument (discipline rings + cardiac trace)
//
// Reuses primitives from livingShared.jsx (+ the direction file for the
// signature visual). Globals via Babel: tierOf, hexA, LV_PEOPLE, LV_TEAL,
// LV_TEALB, LV_INK, LV_BG, lvSerif/lvSans/lvMono, LvPortrait, LvCrest,
// LvWeekBars, LvSparkline, LvCoachBlocks, LvKicker, LV_FEED, lvFeedVisible,
// useReducedMotion, TerrainContours, TerrainRidge, SignalSigil.
// ═══════════════════════════════════════════════════════════════

const dHexA = (typeof hexA !== "undefined") ? hexA : (h, a) => h;
const dSerif = "'Fraunces', serif", dSans = "'Space Grotesk', sans-serif", dMono = "'JetBrains Mono', monospace";

// ── Shared atoms ───────────────────────────────────────────────
function DKick({ children, c, style }) {
  return <div style={{ fontFamily: dMono, fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase", color: c || dHexA(LV_INK, 0.5), ...style }}>{children}</div>;
}
function dCard(extra) {
  return { background: dHexA(LV_INK, 0.04), border: `1px solid ${dHexA(LV_INK, 0.09)}`, borderRadius: 18, ...extra };
}

// ── Ledger primitives (desktop analogs of the mobile BST* kit) ─────────────
// The Open Ledger / Route Card language on the web: zero-box stations threaded
// on a tier-heat rail, station heads with a heat tick + ink→heat rule,
// eyebrow-above-figure registers, dotted-leader rows, honest redaction lines.
// Heat = tierOf(d).color, line-only. dCard stays for a few genuinely-boxed
// affordances (the customizer editor); content sections use dStation.
function dStation(extra) {
  return { position: "relative", ...extra };
}
// Section head: 6px heat tick + mono eyebrow (+ optional right meta) over a 2px
// ink→heat ledger rule.
function DStationHead({ c, label, meta, style }) {
  return (
    <div style={{ marginBottom: 16, ...style }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <span aria-hidden="true" style={{ flex: "none", width: 8, height: 2, background: c }} />
        <span style={{ fontFamily: dMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: dHexA(LV_INK, 0.55) }}>{label}</span>
        {meta ? <span style={{ marginLeft: "auto", fontFamily: dMono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: dHexA(LV_INK, 0.4), whiteSpace: "nowrap" }}>{meta}</span> : null}
      </div>
      <div aria-hidden="true" style={{ height: 2, marginTop: 9, background: `linear-gradient(90deg, ${dHexA(LV_INK, 0.55)}, ${dHexA(c, 0.7)} 55%, transparent)` }} />
    </div>
  );
}
// Eyebrow-above-figure register (matches the mobile BSTLedgerStat orientation).
function DLedgerStat({ c, label, value, sub, delta, figSize = 40, style }) {
  return (
    <div style={{ ...style }}>
      <div style={{ fontFamily: dMono, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: dHexA(LV_INK, 0.5) }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
        <span style={{ fontFamily: dSerif, fontSize: figSize, fontWeight: 400, letterSpacing: "-0.03em", lineHeight: 0.9, color: LV_INK }}>{value}</span>
        {delta ? <span style={{ fontFamily: dMono, fontSize: 11, fontWeight: 700, color: c }}>{delta}</span> : null}
      </div>
      {sub ? <div style={{ fontFamily: dMono, fontSize: 9.5, letterSpacing: "0.08em", color: dHexA(LV_INK, 0.45), marginTop: 6 }}>{sub}</div> : null}
    </div>
  );
}
// Honest-absent redaction line — a dashed rule flexing both sides of a mono label.
function DRedact({ label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", margin: "6px 0" }} aria-label={label}>
      <span aria-hidden="true" style={{ flex: 1, borderTop: `1px dashed ${dHexA(LV_INK, 0.2)}` }} />
      <span style={{ fontFamily: dMono, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: dHexA(LV_INK, 0.42), padding: "0 12px" }}>{label}</span>
      <span aria-hidden="true" style={{ flex: 1, borderTop: `1px dashed ${dHexA(LV_INK, 0.2)}` }} />
    </div>
  );
}
// Dotted leader for dot-leader rows (label · leader · figure).
function DLeader() {
  return <span aria-hidden="true" style={{ flex: 1, borderBottom: `1px dotted ${dHexA(LV_INK, 0.28)}`, transform: "translateY(-4px)", minWidth: 18 }} />;
}
// The tier rail that threads the tab content — a 2px heat line at the left of the
// centered content column (desktop-scoped analog of the mobile continuous rail).
function DRail({ c, children, max = 1240, padTop = 14, padBottom = 0 }) {
  return (
    <div style={{ maxWidth: max, margin: "0 auto", padding: `${padTop}px 40px ${padBottom}px` }}>
      <div style={{ position: "relative", paddingLeft: 22 }}>
        <span aria-hidden="true" style={{ position: "absolute", left: 0, top: 4, bottom: 4, width: 2, background: `linear-gradient(180deg, ${dHexA(c, 0.85)}, ${dHexA(c, 0.25)})` }} />
        {children}
      </div>
    </div>
  );
}

// ── Top navigation ─────────────────────────────────────────────
function DesktopNav({ d, direction }) {
  const c = tierOf(d).color;
  // Match the site's marketing nav — same logo + links, so the profile page
  // doesn't feel like a different site.
  const links = [["about", "/newdesign/About.html"], ["marketplace", "/newdesign/Marketplace.html"], ["community", "/newdesign/Community.html"], ["pricing", "/newdesign/Pricing.html"]];
  const link = { fontFamily: dSans, fontSize: 13, color: dHexA(LV_INK, 0.6), textDecoration: "none", fontWeight: 400, textTransform: "lowercase", letterSpacing: "0.04em", whiteSpace: "nowrap" };
  return (
    <header style={{ position: "sticky", top: 0, zIndex: 40, backdropFilter: "blur(18px)", background: dHexA(LV_BG, 0.72), borderBottom: `1px solid ${dHexA(LV_INK, 0.08)}` }}>
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 40px", height: 72, display: "flex", alignItems: "center", gap: 28 }}>
        {/* wordmark — site logo */}
        <a href="/newdesign/index.html" style={{ display: "flex", alignItems: "center", lineHeight: 0, flex: "none" }}>
          <img src="/SHAPE-logo-teal-white.png?v=1" alt="Shape" style={{ height: 38, width: "auto", display: "block" }} />
        </a>
        {/* nav links */}
        <nav style={{ display: "flex", gap: 22, marginLeft: 6 }}>
          {links.map(([l, href]) => <a key={l} href={href} style={link}>{l}</a>)}
        </nav>
        {/* search pill */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 16px", borderRadius: 999, background: dHexA(LV_INK, 0.05), border: `1px solid ${dHexA(LV_INK, 0.09)}`, color: dHexA(LV_INK, 0.45), fontFamily: dSans, fontSize: 13.5, whiteSpace: "nowrap" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" /><path d="M21 21l-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          Search coaches
        </div>
        <a href="/newdesign/Login.html" style={link}>log in</a>
        <a href="/newdesign/Landing.html" style={{ height: 38, padding: "0 18px", display: "inline-flex", alignItems: "center", borderRadius: 999, border: 0, background: LV_TEAL, color: "#06110e", fontFamily: dSans, fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", flex: "none", textDecoration: "none", textTransform: "lowercase" }}>get started</a>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 38, height: 38, borderRadius: 999, background: dHexA(c, 0.12), border: `1px solid ${dHexA(c, 0.3)}`, flex: "none" }}><LvCrest d={d} size={24} /></div>
      </div>
    </header>
  );
}

// ── Signature visual (branches by direction) ───────────────────
// Coach sigil ring model — three contributions (Habits · Client workouts · Own
// activity) whose fill tracks how close the coach is to the next tier; the outer
// heptagon frame fills as the overall progress bar.
function coachSigilModel(d, live) {
  const TH = [0, 750, 2000, 5000, 15000], NM = ["Certified", "Pro", "Elite", "Master", "Icon"];
  const pts = Number(d.score) || 0;
  let i = 0; for (let j = 0; j < TH.length; j++) if (pts >= TH[j]) i = j;
  const top = i >= TH.length - 1;
  const floor = TH[i], next = top ? floor : TH[i + 1];
  const progress = top ? 1 : Math.max(0.05, Math.min(0.97, (pts - floor) / Math.max(1, next - floor)));
  const clamp = (v) => Math.max(0.1, Math.min(0.98, v));
  // Live values (your own profile) where available, else anchored to tier progress.
  const rv = (lv, fb) => (lv != null && isFinite(lv)) ? clamp(lv) : clamp(fb);
  const rings = [
    ["Habits", rv(live && live.habits, progress + 0.14)],
    ["Client workouts", rv(live && live.clientWorkouts, progress - 0.1)],
    ["Own activity", rv(live && live.ownActivity, progress + 0.02)],
  ];
  return { progress, rings, nextTier: top ? NM[i] : NM[i + 1], top };
}
function SignalVisual({ d, reduced, owner }) {
  const coach = d.role !== "client";
  const [ringLive, setRingLive] = React.useState(null);
  React.useEffect(() => {
    if (!coach || !owner) return;
    let on = true;
    fetch("/api/coach/rings", { credentials: "same-origin" })
      .then((r) => r.ok ? r.json() : null)
      .then((j) => { if (on && j && j.isCoach) setRingLive(j); })
      .catch(() => {});
    return () => { on = false; };
  }, [coach, owner]);
  const m = coach ? coachSigilModel(d, ringLive) : null;
  return (
    <div style={{ position: "relative", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", minHeight: 420 }}>
      <div style={{ position: "relative", display: "flex", justifyContent: "center", alignItems: "center" }}>
        <SignalSigil d={d} size={400} reduced={reduced} goalPct={coach ? null : d.goalPct} rings={m ? m.rings : null} progress={m ? m.progress : null} />
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)" }}>
          <LvPortrait d={d} size={132} />
        </div>
      </div>
      {m && (
        <div style={{ marginTop: 6, textAlign: "center" }}>
          <div style={{ fontFamily: dMono, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: dHexA(LV_INK, 0.55) }}>{m.top ? "Top of the ladder" : <React.Fragment>{Math.round(m.progress * 100)}% to <span style={{ color: LV_TEAL, fontWeight: 700 }}>{m.nextTier}</span></React.Fragment>}</div>
          <div style={{ display: "flex", justifyContent: "center", gap: 18, marginTop: 10, flexWrap: "wrap" }}>
            {m.rings.map(([label, val], i) => { const col = i === 0 ? tierOf(d).color : i === m.rings.length - 1 ? LV_TEAL : dHexA(tierOf(d).color, 0.7); return (
              <div key={label} style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 9, height: 9, borderRadius: 999, background: col }} />
                <span style={{ fontFamily: dMono, fontSize: 9.5, letterSpacing: "0.06em", textTransform: "uppercase", color: dHexA(LV_INK, 0.6) }}>{label}</span>
                <span style={{ fontFamily: dMono, fontSize: 9.5, color: dHexA(LV_INK, 0.4) }}>{Math.round(val * 100)}</span>
              </div>
            ); })}
          </div>
        </div>
      )}
    </div>
  );
}
// Where a member stands toward the next level (tier) — drives the ascent hero.
function memberLevel(d) {
  const TH = [0, 750, 2000, 5000, 15000], NM = ["Base", "Tempo", "Form", "Peak", "Legend"];
  const COL = ["#5fa96e", "#d8a23a", "#e0463c", "#8a5cf6", "#34d6c5"];
  const pts = Number(d.score) || 0;
  let i = 0; for (let j = 0; j < TH.length; j++) if (pts >= TH[j]) i = j;
  const top = i >= TH.length - 1;
  const f = TH[i], nx = top ? f : TH[i + 1];
  const pct = top ? 1 : Math.max(0.05, Math.min(0.97, (pts - f) / Math.max(1, nx - f)));
  return { pct, cur: NM[i], next: top ? null : NM[i + 1], top, nextColor: top ? COL[i] : COL[i + 1] };
}
// Ascent-profile card — the "you-are-here" climb toward the next level (tier):
// a ridgeline, a teal progress trace, the member's avatar climbing it, and a
// flag at the summit labelled with the next level.
function TerrainVisual({ d }) {
  const c = tierOf(d).color;
  const W = 520, H = 460;
  const lvl = memberLevel(d);
  const pct = Math.max(0.05, Math.min(lvl.pct, 0.98));
  const base = [44, H - 56], peak = [W - 64, 64];
  const ridge = `M ${base[0]} ${base[1]} Q ${W * 0.4} ${H - 96}, ${W * 0.6} ${H * 0.5} T ${peak[0]} ${peak[1]}`;
  const hp = Math.max(0.05, Math.min(pct, 0.7));
  const here = { x: base[0] + (peak[0] - base[0]) * hp, y: base[1] + (peak[1] - base[1]) * hp };
  const pctLabel = Math.round(pct * 100);
  const summit = lvl.next || lvl.cur;
  const startLabel = lvl.cur;
  // ridge length ≈ perimeter; dash to reveal pct of the trace.
  const dash = Math.round(pct * 1100);
  return (
    <div style={{ position: "relative", borderRadius: 22, overflow: "hidden", minHeight: 420, border: `1px solid ${dHexA(c, 0.2)}`, background: `linear-gradient(180deg, ${dHexA(c, 0.16)}, ${dHexA(LV_BG, 0.02)})` }}>
      <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden style={{ display: "block" }}>
        <defs><linearGradient id="dkAscent" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={dHexA(c, 0.32)} /><stop offset="100%" stopColor={dHexA(c, 0)} /></linearGradient></defs>
        {[0, 1, 2, 3].map((i) => <line key={i} x1="0" y1={(i + 1) * H / 5} x2={W} y2={(i + 1) * H / 5} stroke={dHexA(LV_INK, 0.06)} strokeWidth="1" />)}
        <path d={`${ridge} L ${peak[0]} ${H} L ${base[0]} ${H} Z`} fill="url(#dkAscent)" />
        <path d={ridge} fill="none" stroke={dHexA(LV_INK, 0.4)} strokeWidth="2" />
        <path d={ridge} fill="none" stroke={LV_TEAL} strokeWidth="3.5" strokeDasharray={`${dash} 2000`} strokeLinecap="round" />
        <line x1={peak[0]} y1={peak[1]} x2={peak[0]} y2={peak[1] - 30} stroke={dHexA(LV_INK, 0.6)} strokeWidth="2" />
        <path d={`M ${peak[0]} ${peak[1] - 30} l 22 7 l -22 7 z`} fill="#e0644b" />
        <circle cx={peak[0]} cy={peak[1]} r="5" fill="#e0644b" />
        <circle cx={base[0]} cy={base[1]} r="5" fill={dHexA(LV_INK, 0.5)} />
      </svg>
      {/* you-are-here avatar climbing the ridge */}
      <div style={{ position: "absolute", left: `calc(${(here.x / W) * 100}% - 44px)`, top: `calc(${(here.y / H) * 100}% - 100px)`, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <LvPortrait d={d} size={88} />
        <div style={{ marginTop: 7, fontFamily: dMono, fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase", color: LV_TEAL, background: dHexA(LV_BG, 0.85), padding: "3px 9px", borderRadius: 5, whiteSpace: "nowrap" }}>You · {pctLabel}%</div>
      </div>
      {/* current level (base) + next level (by the flag, top-right) */}
      <div style={{ position: "absolute", left: 16, bottom: 16, fontFamily: dMono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: dHexA(LV_INK, 0.55), background: dHexA(LV_BG, 0.7), padding: "3px 8px", borderRadius: 5 }}>{startLabel} · now</div>
      <div style={{ position: "absolute", left: `${(peak[0] / W) * 100}%`, transform: "translateX(-50%)", top: 56, fontFamily: dMono, fontSize: 12, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: lvl.nextColor, textAlign: "center", whiteSpace: "nowrap", background: dHexA(LV_BG, 0.72), padding: "4px 10px", borderRadius: 5 }}>{lvl.next || lvl.cur}</div>
    </div>
  );
}

// ── Hero — split: identity (left) · signature visual (right) ───
function DesktopHero({ d, direction, owner, reduced, onMessage, onFollow, follow, coachingHref }) {
  const c = tierOf(d).color;
  const coach = d.role !== "client";
  const Visual = direction === "terrain" ? TerrainVisual : SignalVisual;
  const cover = d.custom && d.custom.cover && d.custom.cover.image;
  return (
    <div style={{ position: "relative" }}>
      {cover && (
        <div style={{ position: "absolute", inset: 0, zIndex: 0, overflow: "hidden", pointerEvents: "none" }}>
          <img src={cover} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.42 }} />
          <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, ${dHexA(LV_BG, 0.45)}, ${dHexA(LV_BG, 0.72)} 62%, ${LV_BG})` }} />
        </div>
      )}
    <section style={{ position: "relative", zIndex: 1, maxWidth: 1240, margin: "0 auto", padding: "56px 40px 8px", display: "grid", gridTemplateColumns: "1.05fr 1fr", gap: 56, alignItems: "center" }} className="dk-hero">
      {/* identity */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
          <span style={{ fontFamily: dMono, fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: c, border: `1px solid ${dHexA(c, 0.4)}`, borderRadius: 999, padding: "6px 12px" }}>{direction === "terrain" ? "▲ " : "◇ "}{tierOf(d).name}</span>
          {coach && d.verified && <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: dMono, fontSize: 10.5, letterSpacing: "0.06em", textTransform: "uppercase", color: LV_TEAL }}><SpVerifiedDot /> Verified</span>}
          {!coach && <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontFamily: dMono, fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: LV_TEAL }}><span className={reduced ? "" : "lv-pulse"} style={{ width: 7, height: 7, borderRadius: 999, background: LV_TEAL }} /> In training{d.program ? " · " + d.program : ""}{d.block ? " · " + d.block : ""}</span>}
        </div>
        <h1 style={{ fontFamily: dSerif, fontSize: 76, fontWeight: 400, letterSpacing: "-0.04em", lineHeight: 0.92, margin: 0 }}>{d.name}</h1>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginTop: 16, fontFamily: dMono, fontSize: 13, color: dHexA(LV_INK, 0.55) }}>
          <span>{d.handle}</span><span style={{ opacity: 0.4 }}>·</span><span>{d.pronouns}</span><span style={{ opacity: 0.4 }}>·</span><span>{d.city}</span><span style={{ opacity: 0.4 }}>·</span><span style={{ color: c }}>{d.roleLabel}</span>
        </div>
        {/* goal — zero-box: heat-tick eyebrow + serif italic, a short heat rule */}
        <div style={{ marginTop: 26, maxWidth: 460, position: "relative", paddingLeft: 15 }}>
          <span aria-hidden="true" style={{ position: "absolute", left: 0, top: 3, bottom: 3, width: 2, background: c }} />
          <DKick c={dHexA(LV_INK, 0.55)} style={{ marginBottom: 9, fontSize: 10.5, letterSpacing: "0.2em" }}>{direction === "terrain" ? "⛰ Summit · " : ""}{d.goalKicker}</DKick>
          <div style={{ fontFamily: dSerif, fontSize: 27, fontStyle: "italic", letterSpacing: "-0.01em", lineHeight: 1.15 }}>{d.goal}</div>
        </div>
        {/* score strip — eyebrow-above-figure ledger registers */}
        <div style={{ display: "flex", gap: 36, marginTop: 28, alignItems: "flex-end" }}>
          <DLedgerStat c={c} label="Shape Score" value={d.score.toLocaleString()} sub={`▲ ${d.scoreWk} this week`} />
          <div style={{ width: 1, height: 52, background: dHexA(LV_INK, 0.12) }} />
          <DLedgerStat c={c} label="Day streak" value={d.streak} />
          <div style={{ width: 1, height: 52, background: dHexA(LV_INK, 0.12) }} />
          <DLedgerStat c={c} label={d.trajLabel} value={d.trajDelta} />
        </div>
        {/* CTAs */}
        <div style={{ display: "flex", gap: 12, marginTop: 30 }}>
          {owner ? (
            <button onClick={onMessage} style={{ height: 50, padding: "0 26px", borderRadius: 14, border: 0, background: LV_TEAL, color: "#06110e", fontFamily: dSans, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>Edit profile</button>
          ) : (
            <button onClick={onMessage} style={{ height: 50, padding: "0 26px", borderRadius: 14, border: 0, background: LV_TEAL, color: "#06110e", fontFamily: dSans, fontSize: 15, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 5h16v11H8l-4 4z" stroke="#06110e" strokeWidth="2.4" strokeLinejoin="round" /></svg> Message {d.first}
            </button>
          )}
          {!owner && (coach
            ? <button onClick={() => { if (coachingHref) window.location.href = coachingHref; }} style={{ height: 50, padding: "0 26px", borderRadius: 14, border: `1px solid ${dHexA(LV_INK, 0.22)}`, background: "transparent", color: LV_INK, fontFamily: dSans, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>View coaching</button>
            : (!follow || follow.canFollow !== false) && (() => { const on = follow && (follow.isFollowing || follow.isPending); return <button onClick={onFollow} style={{ height: 50, padding: "0 26px", borderRadius: 14, border: `1px solid ${on ? LV_TEAL : dHexA(LV_INK, 0.22)}`, background: on ? dHexA(LV_TEAL, 0.12) : "transparent", color: LV_INK, fontFamily: dSans, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>{follow && follow.isFollowing ? "Following ✓" : follow && follow.isPending ? "Requested" : "Follow"}</button>; })())}
        </div>
        {/* followers / following / posts — always public, live links */}
        {follow && (
          <div style={{ display: "flex", gap: 26, marginTop: 22, alignItems: "baseline" }}>
            <button onClick={() => follow.openList && follow.openList("followers")} style={{ background: "transparent", border: 0, padding: 0, cursor: "pointer", textAlign: "left" }}>
              <span style={{ fontFamily: dSerif, fontSize: 24, letterSpacing: "-0.02em" }}>{follow.followers}</span>
              <span style={{ fontFamily: dMono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: dHexA(LV_INK, 0.5), marginLeft: 7 }}>Followers</span>
            </button>
            <button onClick={() => follow.openList && follow.openList("following")} style={{ background: "transparent", border: 0, padding: 0, cursor: "pointer", textAlign: "left" }}>
              <span style={{ fontFamily: dSerif, fontSize: 24, letterSpacing: "-0.02em" }}>{follow.following}</span>
              <span style={{ fontFamily: dMono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: dHexA(LV_INK, 0.5), marginLeft: 7 }}>Following</span>
            </button>
            <button onClick={() => follow.openPosts && follow.openPosts()} style={{ background: "transparent", border: 0, padding: 0, cursor: "pointer", textAlign: "left" }}>
              <span style={{ fontFamily: dSerif, fontSize: 24, letterSpacing: "-0.02em" }}>{follow.posts != null ? follow.posts : 0}</span>
              <span style={{ fontFamily: dMono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: dHexA(LV_INK, 0.5), marginLeft: 7 }}>Posts</span>
            </button>
            {owner && follow.requests > 0 && (
              <button onClick={() => follow.openRequests && follow.openRequests()} style={{ borderRadius: 999, border: 0, background: LV_TEAL, color: "#06110e", padding: "8px 14px", fontFamily: dMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}>{follow.requests} request{follow.requests === 1 ? "" : "s"}</button>
            )}
          </div>
        )}
      </div>
      {/* signature visual */}
      <Visual d={d} reduced={reduced} owner={owner} />
    </section>
    </div>
  );
}

// ── Living signals band (full width, 3-up) ─────────────────────
function SignalsBand({ d }) {
  const c = tierOf(d).color;
  return (
    <DRail c={c} padTop={44}>
      <DStationHead c={c} label="Living signals" meta="This week" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 30, alignItems: "end" }} className="dk-3up">
        <DLedgerStat c={c} label="Current streak" value={d.streak} delta="△ days" figSize={46} />
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
            <span style={{ fontFamily: dMono, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: dHexA(LV_INK, 0.5) }}>Weekly momentum</span>
            <span style={{ fontFamily: dMono, fontSize: 10, color: c }}>today ↑</span>
          </div>
          <LvWeekBars d={d} height={48} />
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 18 }}>
          <DLedgerStat c={c} label={d.trajNote} value={d.trajDelta} figSize={30} style={{ flex: "none" }} />
          <div style={{ flex: 1 }}><LvSparkline data={d.traj} color={c} w={200} h={56} /></div>
        </div>
      </div>
    </DRail>
  );
}

// ── The climb (terrain) — ridgeline ascent ─────────────────────
// Owner-customizable: the climb can track different aspects/goals (body weight,
// body fat, strength, Shape Score, day streak) via in-box tabs; the owner picks
// which appear. Persisted to user_goals('client_climb') so it carries across
// surfaces (mobile uses the same key).
const DK_CLIMB_SOURCES = [
  { key: "weight", label: "Body weight" },
  { key: "bodyfat", label: "Body fat" },
  { key: "strength", label: "Strength" },
  { key: "score", label: "Shape Score" },
  { key: "streak", label: "Day streak" },
];
const DK_CLIMB_DEFAULT = ["weight", "strength", "score"];
function dkClimbCfg(d, aspect) {
  if (aspect === "score") {
    const pts = Number(d.score) || 0;
    const TH = [0, 750, 2000, 5000, 15000], NM = ["Base", "Tempo", "Form", "Peak", "Legend"];
    let i = 0; for (let j = 0; j < TH.length; j++) if (pts >= TH[j]) i = j;
    const last = i >= TH.length - 1, floor = TH[i], next = last ? TH[i] : TH[i + 1], nextName = last ? NM[i] : NM[i + 1];
    return { arc: [[NM[i], `${floor.toLocaleString()} pts`, "start"], ["Now", `${pts.toLocaleString()} pts`, "now"], [nextName, `${next.toLocaleString()} pts`, "target"]], pct: last ? 1 : Math.max(0.05, Math.min(0.95, (pts - floor) / Math.max(1, next - floor))) };
  }
  if (aspect === "streak") {
    const s = Number(d.streak) || 0, target = Math.max(7, Math.ceil((s + 1) / 7) * 7);
    return { arc: [["Start", "Day 0", "start"], ["Now", `${s} days`, "now"], ["Goal", `${target} days`, "target"]], pct: Math.max(0.05, Math.min(0.95, target ? s / target : 0)) };
  }
  if (aspect === "bodyfat") return { arc: [["Start", "22%", "start"], ["Now", "17%", "now"], ["Target", "12%", "target"]], pct: 0.5 };
  if (aspect === "strength") return { arc: [["Bar-only squat", "Started", "start"], ["Now", "245 lb × 5", "now"], ["Target", "1.5×BW", "target"]], pct: 0.55 };
  return { arc: d.arc, pct: d.goalPct != null ? d.goalPct : 0.84 };
}
function ClimbBlock({ d, owner }) {
  const c = tierOf(d).color;
  const [shown, setShown] = React.useState(DK_CLIMB_DEFAULT);
  const [source, setSource] = React.useState("weight");
  const [custom, setCustom] = React.useState(false);
  // Load saved climb config (which aspects show + default) for the owner.
  React.useEffect(() => {
    if (!owner) return;
    let alive = true;
    (async () => {
      try {
        const cl = window.shapeDb && window.shapeDb.client;
        if (!cl) return;
        const { data: u } = await cl.auth.getUser();
        if (!u || !u.user) return;
        const { data } = await cl.from("user_goals").select("data").eq("user_id", u.user.id).eq("kind", "client_climb").maybeSingle();
        const cfg = data && data.data;
        if (!alive || !cfg) return;
        if (Array.isArray(cfg.shown) && cfg.shown.length) setShown(cfg.shown.filter((k) => DK_CLIMB_SOURCES.some((s) => s.key === k)));
        if (cfg.source) setSource(cfg.source);
      } catch (e) {}
    })();
    return () => { alive = false; };
  }, [owner]);
  const persist = (src, sh) => {
    if (!owner) return;
    (async () => {
      try {
        const cl = window.shapeDb && window.shapeDb.client;
        if (!cl) return;
        const { data: u } = await cl.auth.getUser();
        if (!u || !u.user) return;
        await cl.from("user_goals").upsert({ user_id: u.user.id, kind: "client_climb", data: { source: src, shown: sh } }, { onConflict: "user_id,kind" });
      } catch (e) {}
    })();
  };
  const tabs = DK_CLIMB_SOURCES.filter((s) => shown.includes(s.key));
  const active = tabs.some((s) => s.key === source) ? source : (tabs[0] && tabs[0].key) || "weight";
  const climbCfg = dkClimbCfg(d, active);
  const arc = climbCfg.arc;
  const pick = (k) => { setSource(k); persist(k, shown); };
  const toggleShown = (k) => {
    setShown((prev) => {
      const has = prev.includes(k);
      let next = has ? prev.filter((x) => x !== k) : DK_CLIMB_SOURCES.map((s) => s.key).filter((x) => x === k || prev.includes(x));
      if (!next.length) next = [k];
      let src = source;
      if (!next.includes(src)) { src = next[0]; setSource(src); }
      persist(src, next);
      return next;
    });
  };
  // Aspect index — mono labels with a heat underline on the active one (ledger
  // index, not a pill). The customizer toggle stays a small pill affordance.
  const idx = (on) => ({ background: "transparent", border: 0, cursor: "pointer", padding: "4px 2px 7px", position: "relative", fontFamily: dMono, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: on ? LV_INK : dHexA(LV_INK, 0.45) });
  const pill = (on) => ({ padding: "5px 11px", borderRadius: 999, cursor: "pointer", border: `1px solid ${on ? c : dHexA(LV_INK, 0.18)}`, background: on ? dHexA(c, 0.14) : "transparent", color: on ? c : dHexA(LV_INK, 0.6), fontFamily: dMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" });
  return (
    <div style={dStation()}>
      <DStationHead c={c} label={d.arcLabel} meta={`${d.sinceLabel} ${d.since}`} />
      {tabs.length > 1 && (
        <div style={{ display: "flex", gap: 18, marginBottom: 16, flexWrap: "wrap", alignItems: "center", borderBottom: `1px solid ${dHexA(LV_INK, 0.08)}` }}>
          {tabs.map((s) => { const on = active === s.key; return (
            <button key={s.key} type="button" onClick={() => pick(s.key)} style={idx(on)}>
              {s.label}
              {on && <span aria-hidden="true" style={{ position: "absolute", left: 2, right: 2, bottom: -1, height: 2, background: c }} />}
            </button>
          ); })}
          {owner && <button type="button" onClick={() => setCustom((v) => !v)} style={{ ...pill(custom), marginLeft: "auto" }}>⚙ Customize</button>}
        </div>
      )}
      {owner && (tabs.length <= 1 || custom) && (
        <div style={{ marginBottom: 16, border: `1px solid ${dHexA(LV_INK, 0.12)}`, borderRadius: 13, padding: "13px 14px", background: dHexA(LV_INK, 0.02) }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 11 }}>
            <span style={{ fontFamily: dMono, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: dHexA(LV_INK, 0.55) }}>Show on your climb</span>
            {tabs.length > 1 && <button onClick={() => setCustom(false)} style={{ background: "transparent", border: 0, color: LV_TEAL, fontFamily: dMono, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer", padding: 0 }}>Done</button>}
          </div>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            {DK_CLIMB_SOURCES.map((s) => { const on = shown.includes(s.key); return <button key={s.key} onClick={() => toggleShown(s.key)} style={{ ...pill(on), color: on ? LV_TEAL : dHexA(LV_INK, 0.45) }}>{on ? "✓ " : "+ "}{s.label}</button>; })}
          </div>
        </div>
      )}
      <TerrainRidge d={{ ...d, arc, climbPct: climbCfg.pct }} />
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14 }}>
        {arc.map((a, i) => (
          <div key={i} style={{ flex: 1, textAlign: i === 0 ? "left" : i === 2 ? "right" : "center" }}>
            <div style={{ fontFamily: dMono, fontSize: 10, letterSpacing: "0.12em", color: a[2] === "now" ? LV_TEAL : dHexA(LV_INK, 0.5) }}>{a[0]}</div>
            <div style={{ fontFamily: dSans, fontSize: 14, color: dHexA(LV_INK, 0.85), marginTop: 5 }}>{a[1]}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Disciplines — terrain: strata bars · signal: ring legend ──
function DisciplinesBlock({ d, direction }) {
  const c = tierOf(d).color;
  const disc = Array.isArray(d.disciplines) ? d.disciplines : [];
  if (direction === "terrain") {
    return (
      <div style={dStation()}>
        <DStationHead c={c} label={`${d.discLabel} · strata`} />
        {disc.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {disc.map(([label, val]) => (
              <div key={label}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 7 }}>
                  <span style={{ fontFamily: dMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: dHexA(LV_INK, 0.72) }}>{label}</span>
                  <span style={{ fontFamily: dSerif, fontSize: 16, color: LV_INK }}>{Math.round(val * 100)}</span>
                </div>
                <div style={{ height: 6, background: dHexA(LV_INK, 0.08), overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${val * 100}%`, background: c }} />
                </div>
              </div>
            ))}
          </div>
        ) : <DRedact label="Strata · not on record" />}
      </div>
    );
  }
  // signal — zero-box label · bar · figure ledger rows
  return (
    <div style={dStation()}>
      <DStationHead c={c} label={d.discLabel} />
      {disc.length ? (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {disc.map(([label, val], i) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 14, padding: "11px 0", borderTop: i ? `1px solid ${dHexA(LV_INK, 0.08)}` : 0 }}>
              <span style={{ width: 150, flex: "none", fontFamily: dMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: dHexA(LV_INK, 0.72) }}>{label}</span>
              <span style={{ flex: 1, position: "relative", height: 6 }}>
                <span style={{ position: "absolute", inset: 0, background: dHexA(LV_INK, 0.08) }} />
                <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${val * 100}%`, background: c }} />
              </span>
              <span style={{ flex: "none", fontFamily: dSerif, fontSize: 18, letterSpacing: "-0.02em", minWidth: 52, textAlign: "right" }}>{Math.round(val * 100)}<span style={{ fontFamily: dMono, fontSize: 10, color: dHexA(LV_INK, 0.4) }}>/100</span></span>
            </div>
          ))}
        </div>
      ) : <DRedact label="Focus · not set" />}
    </div>
  );
}

// ── Records / signature numbers ────────────────────────────────
function RecordsBlock({ d }) {
  const c = tierOf(d).color;
  const lifts = Array.isArray(d.lifts) ? d.lifts : [];
  return (
    <div style={dStation()}>
      <DStationHead c={c} label={d.liftsLabel} />
      {lifts.length ? (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {lifts.map(([label, val], i) => (
            <div key={label} style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "11px 0", borderTop: i ? `1px solid ${dHexA(LV_INK, 0.08)}` : 0 }}>
              <span style={{ fontFamily: dMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: dHexA(LV_INK, 0.72) }}>{label}</span>
              <DLeader />
              <span style={{ fontFamily: dSerif, fontSize: 22, letterSpacing: "-0.02em", whiteSpace: "nowrap" }}>{val}</span>
            </div>
          ))}
        </div>
      ) : <DRedact label="Records · not on record" />}
    </div>
  );
}

// ── Relation card ──────────────────────────────────────────────
function RelationBlock({ d }) {
  const c = tierOf(d).color;
  return (
    <div style={dStation()}>
      <DStationHead c={c} label={d.relation.kicker} />
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <div style={{ width: 46, height: 46, borderRadius: 999, flex: "none", background: `linear-gradient(150deg, hsl(${d.relation.hue} 40% 34%), hsl(${d.relation.hue} 36% 20%))`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: dSerif, fontSize: 17 }}>{d.relation.initials}</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: dSans, fontSize: 15, fontWeight: 500 }}>{d.relation.name}</div>
          <div style={{ fontFamily: dSans, fontSize: 13, color: dHexA(LV_INK, 0.6), lineHeight: 1.45, marginTop: 4, textWrap: "pretty" }}>{d.relation.note}</div>
        </div>
      </div>
    </div>
  );
}

// ── Feed — desktop 2-column card grid ──────────────────────────
function FeedBlock({ d, direction, owner }) {
  const c = tierOf(d).color;
  const reduced = useReducedMotion();
  const shown = d.feed.filter(it => lvFeedVisible(it.vis, owner));
  const hidden = d.feed.length - shown.length;
  const mark = direction === "terrain" ? "▲ " : "";
  return (
    <div style={dStation()}>
      <DStationHead c={c} label={`${d.feedLabel}${direction === "terrain" ? " · log" : ""}`} meta={owner ? "＋ Post" : null} />
      {shown.length === 0 && hidden === 0 && <DRedact label="No activity yet" />}
      {/* expedition log — a dashed trail descending with waypoint chevrons (matches the mobile app timeline); zero-box entries on the trail */}
      <div style={{ position: "relative", paddingLeft: 30 }}>
        {shown.length > 0 && <div style={{ position: "absolute", left: 7, top: 7, bottom: 12, width: 0, borderLeft: `1.5px dashed ${dHexA(c, 0.4)}` }} />}
        {shown.map((it, i) => {
          const hot = it.k === "win" || it.k === "pr";
          return (
            <div key={i} style={{ position: "relative", paddingBottom: 22, borderBottom: i < shown.length - 1 ? `1px solid ${dHexA(LV_INK, 0.07)}` : 0, marginBottom: i < shown.length - 1 ? 22 : 0 }}>
              <div style={{ position: "absolute", left: -30, top: 4, width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ width: 10, height: 10, transform: "rotate(45deg)", background: LV_BG, border: `2px solid ${c}` }} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span style={{ fontFamily: dMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: hot ? c : dHexA(LV_INK, 0.55) }}>{mark}{LV_FEED[it.k] || it.k}</span>
                <span style={{ marginLeft: "auto", fontFamily: dMono, fontSize: 11, color: dHexA(LV_INK, 0.4) }}>{it.time}</span>
              </div>
              <div style={{ fontFamily: dSerif, fontSize: 21, letterSpacing: "-0.01em", lineHeight: 1.15, marginTop: 10 }}>{it.t}</div>
              <p style={{ fontFamily: dSans, fontSize: 14, lineHeight: 1.55, color: dHexA(LV_INK, 0.72), margin: "7px 0 0", textWrap: "pretty" }}>{it.b}</p>
              {it.metric && (
                <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 13 }}>
                  <div style={{ flex: 1, height: 1, background: dHexA(LV_INK, 0.12) }} />
                  <span style={{ fontFamily: dMono, fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: dHexA(LV_INK, 0.6) }}>{it.metric[0]}</span>
                  <span style={{ fontFamily: dSerif, fontSize: 19, letterSpacing: "-0.02em", color: hot ? c : LV_INK }}>{it.metric[1]}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {!owner && hidden > 0 && (
        <div style={{ marginTop: shown.length ? 16 : 0 }}><DRedact label={`${hidden} private ${hidden === 1 ? "entry" : "entries"} hidden`} /></div>
      )}
    </div>
  );
}

// ── Locked state (desktop centered card) ───────────────────────
function DesktopLocked({ d, follow, onMessage, onFollow, coachingHref }) {
  const c = tierOf(d).color;
  const coach = d.role !== "client";
  return (
    <section style={{ maxWidth: 720, margin: "0 auto", padding: "90px 40px 120px", textAlign: "center" }}>
      <div style={{ width: 120, height: 120, margin: "0 auto", borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", background: `radial-gradient(circle at 50% 36%, ${dHexA(c, 0.22)}, transparent)`, border: `1px solid ${dHexA(c, 0.4)}`, position: "relative" }}>
        <LvCrest d={d} size={74} />
        <div style={{ position: "absolute", right: 6, bottom: 6, width: 34, height: 34, borderRadius: 999, background: LV_BG, border: `1px solid ${dHexA(c, 0.4)}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="15" height="16" viewBox="0 0 24 26" fill="none"><rect x="4" y="11" width="16" height="12" rx="2.5" stroke={c} strokeWidth="2" /><path d="M8 11V7a4 4 0 018 0v4" stroke={c} strokeWidth="2" /></svg>
        </div>
      </div>
      <h2 style={{ fontFamily: dSerif, fontSize: 48, fontWeight: 400, letterSpacing: "-0.03em", margin: "26px 0 0" }}>{d.name}</h2>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 14 }}>
        <span style={{ fontFamily: dMono, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: c, border: `1px solid ${dHexA(c, 0.45)}`, borderRadius: 999, padding: "6px 12px" }}>● {tierOf(d).name}</span>
        <span style={{ fontFamily: dMono, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: dHexA(LV_INK, 0.55) }}>{d.roleLabel}</span>
      </div>
      <p style={{ fontFamily: dSans, fontSize: 15, lineHeight: 1.6, color: dHexA(LV_INK, 0.55), maxWidth: 380, margin: "22px auto 0" }}>
        {d.first} shares only their name and tier publicly. The full living profile stays private until you connect.
      </p>
      {/* followers / following stay public even on a private profile */}
      {follow && (
        <div style={{ display: "flex", gap: 26, justifyContent: "center", marginTop: 24 }}>
          <button onClick={() => follow.openList && follow.openList("followers")} style={{ background: "transparent", border: 0, padding: 0, cursor: "pointer" }}><span style={{ fontFamily: dSerif, fontSize: 22, letterSpacing: "-0.02em" }}>{follow.followers}</span><span style={{ fontFamily: dMono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: dHexA(LV_INK, 0.5), marginLeft: 7 }}>Followers</span></button>
          <button onClick={() => follow.openList && follow.openList("following")} style={{ background: "transparent", border: 0, padding: 0, cursor: "pointer" }}><span style={{ fontFamily: dSerif, fontSize: 22, letterSpacing: "-0.02em" }}>{follow.following}</span><span style={{ fontFamily: dMono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: dHexA(LV_INK, 0.5), marginLeft: 7 }}>Following</span></button>
        </div>
      )}
      <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 28 }}>
        <button onClick={onMessage} style={{ height: 50, padding: "0 26px", borderRadius: 14, border: 0, background: LV_TEAL, color: "#06110e", fontFamily: dSans, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>Message {d.first}</button>
        {coach
          ? <button onClick={() => { if (coachingHref) window.location.href = coachingHref; }} style={{ height: 50, padding: "0 26px", borderRadius: 14, border: `1px solid ${dHexA(LV_INK, 0.22)}`, background: "transparent", color: LV_INK, fontFamily: dSans, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>View coaching</button>
          : (!follow || follow.canFollow !== false) && (() => { const on = follow && (follow.isFollowing || follow.isPending); return <button onClick={onFollow} style={{ height: 50, padding: "0 26px", borderRadius: 14, border: `1px solid ${on ? LV_TEAL : dHexA(LV_INK, 0.22)}`, background: on ? dHexA(LV_TEAL, 0.12) : "transparent", color: LV_INK, fontFamily: dSans, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>{follow && follow.isFollowing ? "Following ✓" : follow && follow.isPending ? "Requested" : "Follow"}</button>; })()}
      </div>
    </section>
  );
}

// ── Footer ─────────────────────────────────────────────────────
function DesktopFooter() {
  return (
    <footer style={{ borderTop: `1px solid ${dHexA(LV_INK, 0.08)}`, marginTop: 64 }}>
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "32px 40px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <span style={{ fontFamily: dSerif, fontSize: 18 }}>Shape</span>
        <span style={{ fontFamily: dMono, fontSize: 11, letterSpacing: "0.08em", color: dHexA(LV_INK, 0.4) }}>Living identity · profiles that breathe</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 22, fontFamily: dSans, fontSize: 13.5, color: dHexA(LV_INK, 0.5) }}>
          <a href="#" style={{ color: "inherit", textDecoration: "none" }}>About</a>
          <a href="#" style={{ color: "inherit", textDecoration: "none" }}>Coaches</a>
          <a href="#" style={{ color: "inherit", textDecoration: "none" }}>Privacy</a>
        </div>
      </div>
    </footer>
  );
}

// ── Page assembly ──────────────────────────────────────────────
// direction "terrain" | "signal" ; persona client|trainer|nutritionist ;
// variant public|own|locked
// Segmented tabs under the hero — Personal activities ("Activity") leads, so the
// profile opens on what someone's doing (mirrors the mobile profile).
function DesktopTabs({ direction, tab, setTab, c }) {
  const coach = direction !== "terrain";
  const tabs = coach
    ? [["activity", "Activity"], ["about", "About"], ["coaching", "Coaching"], ["reviews", "Reviews"], ["music", "Music"]]
    : [["activity", "Activity"], ["signals", "Signals"], ["climb", "Climb"], ["music", "Music"]];
  return (
    <div style={{ maxWidth: 1240, margin: "0 auto", padding: "26px 40px 0" }}>
      {/* Typographic index — mono labels on a hairline, active carries a heat underline */}
      <div role="tablist" aria-label="Profile sections" style={{ display: "flex", gap: 28, borderBottom: `1px solid ${dHexA(LV_INK, 0.1)}` }}>
        {tabs.map(([k, label]) => {
          const on = tab === k;
          return (
            <button key={k} type="button" role="tab" aria-selected={on} onClick={() => setTab(k)} style={{ position: "relative", background: "transparent", border: 0, cursor: "pointer", padding: "12px 2px 13px", color: on ? LV_INK : dHexA(LV_INK, 0.45), fontFamily: dMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase" }}>
              {label}
              {on && <span aria-hidden="true" style={{ position: "absolute", left: 2, right: 2, bottom: -1, height: 2, background: c }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Music tab — the profile owner's playlist library (member_playlists via
// get_member_playlists; own → all, others → public only). Parity with the mobile
// Music tab. Read display on web; owner manages from the app. ──────────────────
function MusicBlock({ d }) {
  const [items, setItems] = React.useState(null);
  React.useEffect(() => {
    const c = (typeof window !== "undefined" && window.shapeDb && window.shapeDb.client) || null;
    if (!c || !c.rpc || !d.uid) { setItems([]); return undefined; }
    let on = true;
    c.rpc("get_member_playlists", { p_user_id: d.uid })
      .then((r) => { if (on) setItems((r && !r.error && Array.isArray(r.data)) ? r.data : []); })
      .catch(() => { if (on) setItems([]); });
    return () => { on = false; };
  }, [d.uid]);
  const provColor = (p) => p === "apple" ? "#fa243c" : p === "spotify" ? "#1db954" : dHexA(LV_INK, 0.4);
  const provLabel = (p) => p === "apple" ? "Apple Music" : p === "spotify" ? "Spotify" : "Playlist";
  // The playlist URL is user-supplied (member_playlists.url) — only allow http(s)
  // to the music hosts the parser advertises, so a javascript:/data: link can't ride
  // into the href (stored XSS).
  const safeMusicUrl = (u) => {
    try {
      const x = new URL(String(u || ""));
      if (x.protocol !== "http:" && x.protocol !== "https:") return null;
      const h = x.hostname.toLowerCase();
      return (h === "spotify.com" || h.endsWith(".spotify.com") || h === "apple.com" || h.endsWith(".apple.com")) ? x.toString() : null;
    } catch (e) { return null; }
  };
  return (
    <section style={{ maxWidth: 1000, margin: "0 auto", padding: "14px 40px 0" }}>
      <div style={dCard({ padding: "22px 24px" })}>
        <div style={{ fontFamily: dMono, fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: dHexA(LV_INK, 0.5), marginBottom: 16 }}>Music · Playlists</div>
        {items === null ? (
          <div style={{ fontFamily: dMono, fontSize: 11, color: dHexA(LV_INK, 0.4) }}>Loading…</div>
        ) : items.length === 0 ? (
          <div style={{ fontFamily: dSans, fontSize: 14, color: dHexA(LV_INK, 0.55) }}>No public playlists yet.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
            {items.map((p) => {
              const href = safeMusicUrl(p.url);
              const inner = (<React.Fragment>
                <span style={{ width: 42, height: 42, borderRadius: 8, background: dHexA(provColor(p.provider), 0.16), border: `1px solid ${dHexA(provColor(p.provider), 0.4)}`, display: "flex", alignItems: "center", justifyContent: "center", color: provColor(p.provider), fontSize: 18, flexShrink: 0 }}>♪</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontFamily: dSerif, fontSize: 16, letterSpacing: "-0.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name || "Playlist"}</div>
                  <div style={{ fontFamily: dMono, fontSize: 9.5, letterSpacing: "0.06em", textTransform: "uppercase", color: dHexA(LV_INK, 0.45), marginTop: 3 }}>{provLabel(p.provider)}{p.track_count ? ` · ${p.track_count} tracks` : ""}{p.is_public === false ? " · Private" : ""}</div>
                </div>
                {href && <span style={{ color: provColor(p.provider), fontFamily: dMono, fontSize: 11 }}>▶</span>}
              </React.Fragment>);
              const box = { display: "flex", gap: 12, alignItems: "center", padding: "12px 14px", borderRadius: 12, border: `1px solid ${dHexA(LV_INK, 0.1)}`, background: dHexA(LV_INK, 0.03), textDecoration: "none", color: "inherit" };
              return href
                ? <a key={p.id} href={href} target="_blank" rel="noreferrer" style={box}>{inner}</a>
                : <div key={p.id} style={box}>{inner}</div>;
            })}
          </div>
        )}
      </div>
    </section>
  );
}

// ── Profile customization (song · prompts · links · bio) — desktop ────────────
const DK_PROMPTS = ["Never skip", "Pre-workout fuel", "Currently chasing", "Form check I love", "My non-negotiable", "Rest day looks like", "A win this month", "Training motto"];
const DK_ACCENTS = ["#34d6c5", "#5ec8e0", "#7bbf5a", "#d8a23a", "#e0644b", "#e0518a", "#8a5cf6"];
const DK_PIN_KINDS = ["PR", "Workout", "Meal", "Post", "Win"];
const DK_STAT_OPTIONS = [{ key: "score", label: "Shape Score" }, { key: "tier", label: "Tier" }, { key: "streak", label: "Day streak" }, { key: "since", label: "Member since" }];
function dkStatsFor(d) {
  return {
    score: { label: "Shape Score", value: (Number(d.score) || 0).toLocaleString() },
    tier: { label: "Tier", value: tierOf(d).name },
    streak: { label: "Day streak", value: d.streak != null ? d.streak : "—" },
    since: { label: "Member since", value: d.since || "—" },
  };
}
const DK_LINKS = [
  { key: "instagram", label: "Instagram", pre: "instagram.com/" },
  { key: "tiktok", label: "TikTok", pre: "tiktok.com/@" },
  { key: "youtube", label: "YouTube", pre: "youtube.com/@" },
  { key: "website", label: "Website", pre: "" },
];
// Climb background atmospheres — same keys/gradients as the mobile customizer
// (BS_CLIMB_BGS), so a pick on either surface renders on both.
const DK_CLIMB_BGS = [
  { key: "", label: "Paper", css: null },
  { key: "dawn", label: "Dawn", css: "linear-gradient(165deg, rgba(224,165,68,0.30), rgba(224,100,75,0.12) 55%, rgba(224,165,68,0.04) 92%)" },
  { key: "dusk", label: "Dusk", css: "linear-gradient(165deg, rgba(138,92,246,0.30), rgba(46,111,160,0.14) 60%, rgba(138,92,246,0.04) 92%)" },
  { key: "alpine", label: "Alpine", css: "linear-gradient(180deg, rgba(94,200,224,0.28), rgba(52,214,197,0.10) 55%, rgba(94,200,224,0.04) 92%)" },
  { key: "forest", label: "Forest", css: "linear-gradient(165deg, rgba(123,191,90,0.28), rgba(47,107,58,0.12) 60%, rgba(123,191,90,0.04) 92%)" },
  { key: "ember", label: "Ember", css: "linear-gradient(165deg, rgba(224,81,138,0.26), rgba(224,100,75,0.14) 55%, rgba(224,81,138,0.04) 92%)" },
  { key: "storm", label: "Storm", css: "linear-gradient(165deg, rgba(91,141,249,0.28), rgba(33,40,52,0.16) 60%, rgba(91,141,249,0.05) 92%)" },
];
function dkSpotifyEmbed(url) {
  if (!url) return null;
  const m = /open\.spotify\.com\/(?:intl-[a-z]+\/)?(track|playlist|album|artist|episode|show)\/([A-Za-z0-9]+)/.exec(String(url));
  return m ? `https://open.spotify.com/embed/${m[1]}/${m[2]}` : null;
}
function dkLinkHref(key, val) {
  const v = String(val || "").trim(); if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  const def = DK_LINKS.find((l) => l.key === key); const pre = def ? def.pre : "";
  return "https://" + (pre ? pre + v.replace(/^@/, "") : v);
}
function ProfileExtras({ d, owner }) {
  const [cust, setCust] = React.useState(d.custom || null);
  const [edit, setEdit] = React.useState(false);
  const cu = cust || {};
  const c = (cu.accent && /^#/.test(cu.accent)) ? cu.accent : tierOf(d).color;
  const embed = dkSpotifyEmbed(cu.song && cu.song.url);
  const prompts = Array.isArray(cu.prompts) ? cu.prompts.filter((p) => p && p.q && p.a) : [];
  const links = (cu.links && typeof cu.links === "object") ? DK_LINKS.map((l) => [l, cu.links[l.key]]).filter(([, v]) => v && String(v).trim()) : [];
  const pinned = (cu.pinned && cu.pinned.title) ? cu.pinned : null;
  const statSrc = dkStatsFor(d);
  const heroStats = (Array.isArray(cu.heroStats) ? cu.heroStats : []).map((k) => statSrc[k] ? { k, ...statSrc[k] } : null).filter(Boolean).slice(0, 3);
  const empty = !embed && !prompts.length && !links.length && !pinned && !heroStats.length;
  if (empty && !owner) return null;
  return (
    <div style={{ marginBottom: 22 }}>
      {owner && <button type="button" onClick={() => setEdit(true)} style={{ marginBottom: empty ? 0 : 18, padding: "10px 16px", borderRadius: 10, border: `1px dashed ${dHexA(c, 0.5)}`, background: "transparent", color: c, cursor: "pointer", fontFamily: dMono, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>✎ Customize profile</button>}
      {heroStats.length > 0 && (
        <div style={{ display: "flex", gap: 34, marginBottom: 26 }}>
          {heroStats.map((s) => <DLedgerStat key={s.k} c={c} label={s.label} value={s.value} figSize={28} />)}
        </div>
      )}
      {pinned && (
        <div style={{ marginBottom: 26, position: "relative", paddingLeft: 15 }}>
          <span aria-hidden="true" style={{ position: "absolute", left: 0, top: 3, bottom: 3, width: 2, background: c }} />
          <div style={{ fontFamily: dMono, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: dHexA(LV_INK, 0.55), fontWeight: 700 }}>★ Pinned · {pinned.kind || "Highlight"}</div>
          <div style={{ fontFamily: dSerif, fontSize: 24, letterSpacing: "-0.01em", lineHeight: 1.15, marginTop: 9 }}>{pinned.title}</div>
          {pinned.note && <p style={{ fontFamily: dSans, fontSize: 14, lineHeight: 1.5, color: dHexA(LV_INK, 0.72), margin: "8px 0 0" }}>{pinned.note}</p>}
          {pinned.metric && <div style={{ fontFamily: dSerif, fontSize: 19, letterSpacing: "-0.02em", color: c, marginTop: 11 }}>{pinned.metric}</div>}
        </div>
      )}
      {(embed || prompts.length || links.length) > 0 && (
        <div style={{ marginBottom: 6 }}>
          {embed && (
            <div style={{ marginBottom: prompts.length || links.length ? 22 : 0 }}>
              <DStationHead c={c} label={(cu.song && cu.song.label) ? cu.song.label : "Profile song"} />
              <div style={{ borderRadius: 12, overflow: "hidden", border: `1px solid ${dHexA(LV_INK, 0.1)}`, maxWidth: 520 }}>
                <iframe title="Profile song" src={embed} width="100%" height="80" frameBorder="0" allow="encrypted-media" style={{ display: "block", border: 0 }} />
              </div>
            </div>
          )}
          {prompts.length > 0 && (
            <div style={{ marginBottom: links.length ? 22 : 0, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "18px 34px" }} className="dk-feed">
              {prompts.map((p, i) => (
                <div key={p.q || i} style={{ position: "relative", paddingLeft: 13 }}>
                  <span aria-hidden="true" style={{ position: "absolute", left: 0, top: 3, bottom: 3, width: 2, background: dHexA(c, 0.5) }} />
                  <div style={{ fontFamily: dMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: dHexA(LV_INK, 0.5) }}>{p.q}</div>
                  <div style={{ fontFamily: dSerif, fontSize: 20, fontStyle: "italic", letterSpacing: "-0.01em", lineHeight: 1.2, marginTop: 7 }}>{p.a}</div>
                </div>
              ))}
            </div>
          )}
          {links.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 9 }}>
              {links.map(([l, v]) => <a key={l.key} href={dkLinkHref(l.key, v)} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", padding: "8px 14px", borderRadius: 999, border: `1px solid ${dHexA(c, 0.4)}`, background: "transparent", color: c, fontFamily: dMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>{l.label} ↗</a>)}
            </div>
          )}
        </div>
      )}
      {edit && <ProfileCustomizer initial={cust} c={c} onClose={() => setEdit(false)} onSave={(doc) => { setCust(doc); setEdit(false); }} />}
    </div>
  );
}
function ProfileCustomizer({ initial, c, onClose, onSave }) {
  const init = initial || {};
  const [bio, setBio] = React.useState(init.bio || "");
  const [songUrl, setSongUrl] = React.useState((init.song && init.song.url) || "");
  const [songLabel, setSongLabel] = React.useState((init.song && init.song.label) || "");
  const [links, setLinks] = React.useState({ ...(init.links || {}) });
  const [prompts, setPrompts] = React.useState(Array.isArray(init.prompts) && init.prompts.length ? init.prompts.slice(0, 4) : [{ q: DK_PROMPTS[0], a: "" }]);
  const [coverUrl, setCoverUrl] = React.useState((init.cover && init.cover.image) || "");
  const [accent, setAccent] = React.useState(init.accent || "");
  const [pinKind, setPinKind] = React.useState((init.pinned && init.pinned.kind) || "PR");
  const [pinTitle, setPinTitle] = React.useState((init.pinned && init.pinned.title) || "");
  const [pinNote, setPinNote] = React.useState((init.pinned && init.pinned.note) || "");
  const [pinMetric, setPinMetric] = React.useState((init.pinned && init.pinned.metric) || "");
  const [heroStats, setHeroStats] = React.useState(Array.isArray(init.heroStats) && init.heroStats.length ? init.heroStats : ["score", "tier", "streak"]);
  const toggleStat = (k) => setHeroStats((prev) => { if (prev.includes(k)) return prev.length > 1 ? prev.filter((x) => x !== k) : prev; return prev.length >= 3 ? [...prev.slice(1), k] : [...prev, k]; });
  const [climbBg, setClimbBg] = React.useState(init.climbBg || "");
  const [coverBusy, setCoverBusy] = React.useState(false);
  const coverRef = React.useRef(null);
  const [busy, setBusy] = React.useState(false);
  const onCoverFile = async (e) => {
    const file = e && e.target && e.target.files && e.target.files[0]; if (e && e.target) e.target.value = "";
    if (!file) return; setCoverBusy(true);
    try {
      const cl = window.shapeDb && window.shapeDb.client;
      const { data: u } = await cl.auth.getUser();
      const path = `${u.user.id}/cover-${Date.now()}.${(file.name.split(".").pop() || "jpg")}`;
      const up = await cl.storage.from("community-photos").upload(path, file, { upsert: true, contentType: file.type });
      if (up.error) throw up.error;
      const { data: pub } = cl.storage.from("community-photos").getPublicUrl(path);
      setCoverUrl(pub.publicUrl);
    } catch (err) { alert((err && err.message) || "Could not upload cover."); }
    finally { setCoverBusy(false); }
  };
  const field = { width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: 11, border: `1px solid ${dHexA(LV_INK, 0.16)}`, background: dHexA(LV_INK, 0.03), color: LV_INK, fontFamily: dSans, fontSize: 14, outline: "none" };
  const label = { fontFamily: dMono, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: dHexA(LV_INK, 0.55), marginBottom: 7, display: "block" };
  const setPrompt = (i, k, v) => setPrompts((prev) => prev.map((p, j) => j === i ? { ...p, [k]: v } : p));
  const embedPreview = dkSpotifyEmbed(songUrl);
  const save = async () => {
    setBusy(true);
    const doc = {
      ...init,
      bio: bio.trim(),
      song: songUrl.trim() ? { url: songUrl.trim(), label: songLabel.trim() } : null,
      links: Object.fromEntries(DK_LINKS.map((l) => [l.key, String(links[l.key] || "").trim()]).filter(([, v]) => v)),
      prompts: prompts.filter((p) => p && p.q && String(p.a).trim()).map((p) => ({ q: p.q, a: String(p.a).trim() })).slice(0, 4),
      cover: coverUrl.trim() ? { image: coverUrl.trim() } : null,
      accent: accent || null,
      climbBg: climbBg || null,
      pinned: pinTitle.trim() ? { kind: pinKind, title: pinTitle.trim(), note: pinNote.trim(), metric: pinMetric.trim() } : null,
      heroStats: heroStats.slice(0, 3),
    };
    try {
      const cl = window.shapeDb && window.shapeDb.client;
      if (cl) { const { data: u } = await cl.auth.getUser(); if (u && u.user) await cl.from("user_goals").upsert({ user_id: u.user.id, kind: "profile_custom", data: doc }, { onConflict: "user_id,kind" }); }
    } catch (e) {}
    setBusy(false); onSave(doc);
  };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 560, maxHeight: "88vh", overflowY: "auto", background: LV_BG, borderRadius: 20, border: `1px solid ${dHexA(LV_INK, 0.12)}`, padding: 26 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <div><div style={{ fontFamily: dMono, fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: c }}>Your profile</div><div style={{ fontFamily: dSerif, fontSize: 26, letterSpacing: "-0.02em", marginTop: 3 }}>Customize.</div></div>
          <button onClick={onClose} style={{ background: "transparent", border: 0, color: dHexA(LV_INK, 0.6), fontSize: 22, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ marginBottom: 18 }}><span style={label}>Bio</span><textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} maxLength={280} placeholder="A line about you, your training, your why…" style={{ ...field, resize: "vertical" }} /></div>
        <div style={{ marginBottom: 18 }}>
          <span style={label}>Cover image</span>
          <div style={{ position: "relative", height: 130, borderRadius: 12, overflow: "hidden", border: `1px solid ${dHexA(LV_INK, 0.16)}`, background: coverUrl ? "#000" : `linear-gradient(135deg, ${dHexA(accent || c, 0.4)}, ${dHexA(accent || c, 0.08)})` }}>
            {coverUrl && <img src={coverUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
            <input ref={coverRef} type="file" accept="image/*" onChange={onCoverFile} style={{ display: "none" }} />
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <button onClick={() => !coverBusy && coverRef.current && coverRef.current.click()} disabled={coverBusy} style={{ padding: "8px 15px", borderRadius: 999, border: `1px solid ${dHexA(LV_INK, 0.6)}`, background: "rgba(0,0,0,0.5)", color: LV_INK, cursor: coverBusy ? "wait" : "pointer", fontFamily: dMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>{coverBusy ? "Uploading…" : coverUrl ? "Replace" : "Upload cover"}</button>
              {coverUrl && <button onClick={() => setCoverUrl("")} style={{ padding: "8px 13px", borderRadius: 999, border: `1px solid ${dHexA(LV_INK, 0.4)}`, background: "rgba(0,0,0,0.5)", color: dHexA(LV_INK, 0.8), cursor: "pointer", fontFamily: dMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>Remove</button>}
            </div>
          </div>
        </div>
        <div style={{ marginBottom: 18 }}>
          <span style={label}>Accent color</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <button onClick={() => setAccent("")} title="Tier default" style={{ width: 32, height: 32, borderRadius: 999, cursor: "pointer", border: `2px solid ${!accent ? LV_INK : dHexA(LV_INK, 0.25)}`, background: `linear-gradient(135deg, ${c}, ${lvShade(c, 0.5)})`, color: "#fff", fontSize: 12 }}>{!accent ? "✓" : ""}</button>
            {DK_ACCENTS.map((a) => <button key={a} onClick={() => setAccent(a)} style={{ width: 32, height: 32, borderRadius: 999, cursor: "pointer", border: `2px solid ${accent === a ? LV_INK : "transparent"}`, background: a, color: "#fff", fontSize: 12 }}>{accent === a ? "✓" : ""}</button>)}
          </div>
          <div style={{ marginTop: 7, fontFamily: dMono, fontSize: 9, letterSpacing: "0.06em", color: dHexA(LV_INK, 0.45) }}>Tints your cover + cards. Your tier badge keeps its tier color.</div>
        </div>
        <div style={{ marginBottom: 18 }}>
          <span style={label}>Climb background</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 9 }}>
            {DK_CLIMB_BGS.map((b) => {
              const on = (climbBg || "") === b.key;
              return (
                <button key={b.key || "paper"} onClick={() => setClimbBg(b.key)} style={{ width: 64, borderRadius: 10, cursor: "pointer", border: `2px solid ${on ? LV_INK : dHexA(LV_INK, 0.18)}`, background: "transparent", padding: 4 }}>
                  <span style={{ display: "block", height: 30, borderRadius: 6, background: b.css || dHexA(LV_INK, 0.06), border: b.css ? "none" : `1px dashed ${dHexA(LV_INK, 0.25)}` }} />
                  <span style={{ display: "block", marginTop: 5, fontFamily: dMono, fontSize: 8, letterSpacing: "0.08em", textTransform: "uppercase", color: on ? LV_INK : dHexA(LV_INK, 0.5) }}>{b.label}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ marginBottom: 18 }}>
          <span style={label}>Headline stats · pick up to 3</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {DK_STAT_OPTIONS.map((s) => { const on = heroStats.includes(s.key); return (
              <button key={s.key} onClick={() => toggleStat(s.key)} style={{ padding: "7px 13px", borderRadius: 999, cursor: "pointer", border: `1px solid ${on ? c : dHexA(LV_INK, 0.18)}`, background: on ? dHexA(c, 0.14) : "transparent", color: on ? c : dHexA(LV_INK, 0.5), fontFamily: dMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>{on ? "✓ " : ""}{s.label}</button>
            ); })}
          </div>
        </div>
        <div style={{ marginBottom: 18 }}>
          <span style={label}>Pin a highlight</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 9 }}>
            {DK_PIN_KINDS.map((k) => <button key={k} onClick={() => setPinKind(k)} style={{ padding: "7px 13px", borderRadius: 999, cursor: "pointer", border: `1px solid ${pinKind === k ? c : dHexA(LV_INK, 0.18)}`, background: pinKind === k ? dHexA(c, 0.14) : "transparent", color: pinKind === k ? c : dHexA(LV_INK, 0.5), fontFamily: dMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>{k}</button>)}
          </div>
          <input value={pinTitle} onChange={(e) => setPinTitle(e.target.value)} maxLength={80} placeholder="Headline — e.g. Pulled 2× bodyweight today" style={field} />
          <input value={pinNote} onChange={(e) => setPinNote(e.target.value)} maxLength={160} placeholder="A line of context (optional)" style={{ ...field, marginTop: 8 }} />
          <input value={pinMetric} onChange={(e) => setPinMetric(e.target.value)} maxLength={24} placeholder="Metric (optional) — e.g. 2×BW" style={{ ...field, marginTop: 8 }} />
          {pinTitle.trim() && <button onClick={() => { setPinTitle(""); setPinNote(""); setPinMetric(""); }} style={{ marginTop: 8, background: "transparent", border: 0, color: dHexA(LV_INK, 0.5), fontFamily: dMono, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer", padding: 0 }}>Clear pin</button>}
        </div>
        <div style={{ marginBottom: 18 }}>
          <span style={label}>Profile song · Spotify link</span>
          <input value={songUrl} onChange={(e) => setSongUrl(e.target.value)} placeholder="https://open.spotify.com/track/…" style={field} />
          <input value={songLabel} onChange={(e) => setSongLabel(e.target.value)} placeholder="Label (optional) — e.g. Lift anthem" style={{ ...field, marginTop: 8 }} />
          {embedPreview && <div style={{ marginTop: 10, borderRadius: 11, overflow: "hidden", border: `1px solid ${dHexA(LV_INK, 0.1)}` }}><iframe title="Song preview" src={embedPreview} width="100%" height="80" frameBorder="0" allow="encrypted-media" style={{ display: "block", border: 0 }} /></div>}
        </div>
        <div style={{ marginBottom: 18 }}>
          <span style={label}>Prompts</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {prompts.map((p, i) => (
              <div key={i} style={{ border: `1px solid ${dHexA(LV_INK, 0.12)}`, borderRadius: 11, padding: 11 }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <select value={p.q} onChange={(e) => setPrompt(i, "q", e.target.value)} style={{ ...field, padding: "8px 10px", fontSize: 12.5, flex: 1 }}>{DK_PROMPTS.map((q) => <option key={q} value={q}>{q}</option>)}</select>
                  <button onClick={() => setPrompts((prev) => prev.filter((_, j) => j !== i))} style={{ background: "transparent", border: `1px solid ${dHexA(LV_INK, 0.16)}`, borderRadius: 999, color: dHexA(LV_INK, 0.6), width: 32, cursor: "pointer" }}>×</button>
                </div>
                <input value={p.a} onChange={(e) => setPrompt(i, "a", e.target.value)} maxLength={120} placeholder="Your answer…" style={field} />
              </div>
            ))}
          </div>
          {prompts.length < 4 && <button onClick={() => setPrompts((prev) => [...prev, { q: DK_PROMPTS[prev.length % DK_PROMPTS.length], a: "" }])} style={{ marginTop: 10, background: "transparent", border: `1px dashed ${dHexA(c, 0.5)}`, color: c, borderRadius: 999, padding: "8px 14px", cursor: "pointer", fontFamily: dMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>+ Add prompt</button>}
        </div>
        <div style={{ marginBottom: 22 }}>
          <span style={label}>Social links</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {DK_LINKS.map((l) => (
              <div key={l.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ flex: "0 0 84px", fontFamily: dMono, fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase", color: dHexA(LV_INK, 0.55) }}>{l.label}</span>
                <input value={links[l.key] || ""} onChange={(e) => setLinks((prev) => ({ ...prev, [l.key]: e.target.value }))} placeholder={l.pre ? l.pre + "you" : "yoursite.com"} style={{ ...field, flex: 1 }} />
              </div>
            ))}
          </div>
        </div>
        <button onClick={save} disabled={busy} style={{ width: "100%", padding: "14px", borderRadius: 999, background: c, color: "#08120f", border: 0, cursor: busy ? "wait" : "pointer", fontFamily: dMono, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 700 }}>{busy ? "Saving…" : "Save profile"}</button>
      </div>
    </div>
  );
}

// ── Availability at-a-glance (coach profiles) ──────────────────────────────
// Reads the SAME /api/availability the booking flow reads — so what the coach
// sets on their Schedule tab shows here and lines up with consultation.html.
// weekday is getDay()-style (0=Sun…6=Sat). Resolves the coach's provider_id
// from their uid via the public trainers/nutritionists table.
const LV_AVAIL_DAYS = [["Mon", 1], ["Tue", 2], ["Wed", 3], ["Thu", 4], ["Fri", 5], ["Sat", 6], ["Sun", 0]];
function lvHourLabel(min) {
  const h = Math.floor(min / 60);
  return (h % 12 === 0 ? 12 : h % 12) + (h >= 12 ? "p" : "a");
}
function LvCoachAvailability({ d }) {
  const role = d.role === "nutritionist" ? "nutritionist" : "trainer";
  const uid = d.uid || null;
  const [state, setState] = React.useState(uid ? "loading" : "demo");
  const [slots, setSlots] = React.useState(null);
  const [pid, setPid] = React.useState(null);

  React.useEffect(() => {
    if (!uid) { setState("demo"); return; }
    let on = true;
    (async () => {
      try {
        const c = (window.shapeDb && window.shapeDb.client) || null;
        if (!c) { setState("demo"); return; }
        const table = role === "trainer" ? "trainers" : "nutritionists";
        const { data: prov } = await c.from(table).select("id").eq("owner_id", uid).maybeSingle();
        if (!prov || !prov.id) { if (on) setState("none"); return; }
        if (on) setPid(prov.id);
        const res = await fetch("/api/availability?role=" + role + "&id=" + prov.id, { cache: "no-store" });
        const j = res.ok ? await res.json() : null;
        if (!on) return;
        setSlots(Array.isArray(j && j.slots) ? j.slots : []);
        setState("live");
      } catch (e) { if (on) setState("none"); }
    })();
    return () => { on = false; };
  }, [uid, role]);

  // Demo availability mirrors the Schedule editor's demo (Mon–Sat working week).
  const demoSlots = [
    { weekday: 1, start_minute: 360, duration_min: 240 }, { weekday: 1, start_minute: 1020, duration_min: 180 },
    { weekday: 2, start_minute: 480, duration_min: 300 }, { weekday: 3, start_minute: 360, duration_min: 240 },
    { weekday: 4, start_minute: 540, duration_min: 300 }, { weekday: 5, start_minute: 360, duration_min: 300 },
    { weekday: 6, start_minute: 540, duration_min: 180 },
  ];
  const useSlots = state === "demo" ? demoSlots : (slots || []);
  const byDay = new Map();
  for (const s of useSlots) {
    const wd = s.weekday;
    const start = s.start_minute, end = s.start_minute + (s.duration_min || 60);
    const cur = byDay.get(wd) || { min: start, max: end };
    byDay.set(wd, { min: Math.min(cur.min, start), max: Math.max(cur.max, end) });
  }
  const openDays = byDay.size;
  // Newdesign consultation page (the single canonical booking form, with the
  // Turnstile captcha). Legacy /consultation(.html) redirects here too.
  const bookHref = "/newdesign/consultation.html?type=" + role + (pid ? "&id=" + pid : "") + "&name=" + encodeURIComponent(d.name || "");

  if (state === "loading") {
    return <section style={{ maxWidth: 1240, margin: "0 auto", padding: "10px 40px 0" }}><div style={dCard({ padding: "16px 22px", color: dHexA(LV_INK, 0.4), fontFamily: dMono, fontSize: 12 })}>Loading availability…</div></section>;
  }
  if (state === "none") return null; // not a marketplace coach / no row — show nothing rather than a wrong state

  return (
    <section style={{ maxWidth: 1240, margin: "0 auto", padding: "10px 40px 0" }}>
      <div style={dCard({ padding: "16px 22px 18px" })}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 14, flexWrap: "wrap", marginBottom: 12 }}>
          <DKick c={LV_TEAL} style={{ fontSize: 10.5 }}>◷ Availability{state === "demo" ? " · example" : ""}</DKick>
          <span style={{ fontFamily: dMono, fontSize: 10.5, color: dHexA(LV_INK, 0.45) }}>
            {openDays ? "Open " + openDays + (openDays === 1 ? " day" : " days") + " a week" : "No open hours set"}
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
          {LV_AVAIL_DAYS.map(([lbl, wd]) => {
            const r = byDay.get(wd);
            return (
              <div key={wd} style={{ textAlign: "center", borderRadius: 12, border: `1px solid ${dHexA(r ? LV_TEAL : LV_INK, r ? 0.32 : 0.1)}`, background: r ? dHexA(LV_TEAL, 0.08) : "transparent", padding: "9px 4px" }}>
                <div style={{ fontFamily: dMono, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: r ? LV_TEAL : dHexA(LV_INK, 0.4) }}>{lbl}</div>
                <div style={{ fontFamily: dMono, fontSize: 10.5, marginTop: 5, color: r ? dHexA(LV_INK, 0.78) : dHexA(LV_INK, 0.28) }}>{r ? lvHourLabel(r.min) + "–" + lvHourLabel(r.max) : "—"}</div>
              </div>
            );
          })}
        </div>
        {openDays > 0 && (
          <div style={{ marginTop: 14 }}>
            <a href={bookHref} style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 42, padding: "0 20px", borderRadius: 12, background: LV_TEAL, color: "#06110e", fontFamily: dSans, fontSize: 14, fontWeight: 600, textDecoration: "none" }}>Book a consult →</a>
          </div>
        )}
      </div>
    </section>
  );
}

function DesktopProfile({ direction = "terrain", persona = "client", variant = "public", person, onMessage, onFollow, follow, coachingHref, belowContent = null, chrome = true }) {
  const d = person || LV_PEOPLE[persona];
  const c = tierOf(d).color;
  const reduced = useReducedMotion();
  const owner = variant === "own";
  const locked = variant === "locked";
  const coach = d.role !== "client";
  // Personal activities lead — the profile opens on Activity (mirrors mobile).
  const [tab, setTab] = React.useState("activity");
  // Posts stat → jump to the Activity tab/section (the posts live there).
  const followWired = follow ? Object.assign({}, follow, {
    openPosts: () => {
      setTab("activity");
      setTimeout(() => { try { const el = document.getElementById("dk-activity"); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) {} }, 60);
    },
  }) : follow;

  return (
    <div style={{ position: "relative", minHeight: "100vh", background: LV_BG, color: LV_INK, fontFamily: dSans, overflow: "hidden" }}>
      {/* atmosphere */}
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", background: `radial-gradient(90% 50% at 78% -4%, ${dHexA(c, 0.28)}, transparent 60%), radial-gradient(80% 50% at 0% 12%, ${dHexA(c, 0.12)}, transparent 55%)` }} />
      <div style={{ position: "relative" }}>
        {/* Use the real site header (same Shape look; shows the logged-in tabs
            when signed into an account). Falls back to the local nav if the
            shared shell isn't loaded. chrome=false (embedded in the dashboard
            shell, which brings its own Header/Footer + sidebar) skips both. */}
        {chrome ? (typeof Header !== "undefined" ? <Header /> : <DesktopNav d={d} direction={direction} />) : null}
        {locked ? (
          <DesktopLocked d={d} follow={follow} onMessage={onMessage} onFollow={onFollow} coachingHref={coachingHref} />
        ) : (
          <React.Fragment>
            <DesktopHero d={d} direction={direction} owner={owner} reduced={reduced} onMessage={onMessage} onFollow={onFollow} follow={followWired} coachingHref={coachingHref} />
            {/* Availability at-a-glance — coach profiles only, the same slots
                the Schedule tab edits + the booking flow reads. */}
            {coach && <LvCoachAvailability d={d} />}
            <DesktopTabs direction={direction} tab={tab} setTab={setTab} c={c} />

            {/* Activity — personal activities lead */}
            {tab === "activity" && (
              <section id="dk-activity" style={{ maxWidth: 900, margin: "0 auto", padding: "14px 40px 0" }}>
                <div style={{ position: "relative", paddingLeft: 22 }}>
                  <span aria-hidden="true" style={{ position: "absolute", left: 0, top: 4, bottom: 4, width: 2, background: `linear-gradient(180deg, ${dHexA(c, 0.85)}, ${dHexA(c, 0.25)})` }} />
                  <ProfileExtras d={d} owner={owner} />
                  <FeedBlock d={d} direction={direction} owner={owner} />
                </div>
              </section>
            )}

            {/* Signals (member) / About (coach) — living signals + disciplines + records */}
            {tab === (coach ? "about" : "signals") && (
              <React.Fragment>
                <SignalsBand d={d} />
                <section style={{ maxWidth: 1240, margin: "0 auto", padding: "28px 40px 0" }}>
                  <div style={{ position: "relative", paddingLeft: 22 }}>
                    <span aria-hidden="true" style={{ position: "absolute", left: 0, top: 4, bottom: 4, width: 2, background: `linear-gradient(180deg, ${dHexA(c, 0.85)}, ${dHexA(c, 0.25)})` }} />
                    <div style={{ display: "grid", gridTemplateColumns: "1.55fr 1fr", gap: 40, alignItems: "start" }} className="dk-grid">
                      <div style={{ display: "flex", flexDirection: "column", gap: 34 }}>
                        <DisciplinesBlock d={d} direction={direction} />
                      </div>
                      <aside style={{ display: "flex", flexDirection: "column", gap: 34, position: "sticky", top: 96 }} className="dk-rail">
                        <RecordsBlock d={d} />
                        {!coach && <RelationBlock d={d} />}
                      </aside>
                    </div>
                  </div>
                </section>
              </React.Fragment>
            )}

            {/* Climb (member only) */}
            {!coach && tab === "climb" && (
              <section style={{ maxWidth: 1240, margin: "0 auto", padding: "14px 40px 0" }}>
                <div style={{ position: "relative", paddingLeft: 22 }}>
                  <span aria-hidden="true" style={{ position: "absolute", left: 0, top: 4, bottom: 4, width: 2, background: `linear-gradient(180deg, ${dHexA(c, 0.85)}, ${dHexA(c, 0.25)})` }} />
                  <div style={{ display: "grid", gridTemplateColumns: "1.55fr 1fr", gap: 40, alignItems: "start" }} className="dk-grid">
                    <div style={{ display: "flex", flexDirection: "column", gap: 34 }}><ClimbBlock d={d} owner={owner} /></div>
                    <aside style={{ display: "flex", flexDirection: "column", gap: 34, position: "sticky", top: 96 }} className="dk-rail"><RecordsBlock d={d} /></aside>
                  </div>
                </div>
              </section>
            )}

            {/* Coaching (coach only) — services / certs (reviews on their own tab) */}
            {coach && tab === "coaching" && (
              <section style={{ maxWidth: 1240, margin: "0 auto", padding: "14px 40px 0" }}>
                <div style={{ position: "relative", paddingLeft: 22 }}>
                  <span aria-hidden="true" style={{ position: "absolute", left: 0, top: 4, bottom: 4, width: 2, background: `linear-gradient(180deg, ${dHexA(c, 0.85)}, ${dHexA(c, 0.25)})` }} />
                  <LvCoachBlocks d={d} light={false} owner={owner} view="coaching" onReviews={() => setTab("reviews")} />
                </div>
              </section>
            )}

            {/* Reviews (coach only) — its own tab */}
            {coach && tab === "reviews" && (
              <section style={{ maxWidth: 1240, margin: "0 auto", padding: "14px 40px 0" }}>
                <div style={{ position: "relative", paddingLeft: 22 }}>
                  <span aria-hidden="true" style={{ position: "absolute", left: 0, top: 4, bottom: 4, width: 2, background: `linear-gradient(180deg, ${dHexA(c, 0.85)}, ${dHexA(c, 0.25)})` }} />
                  <LvCoachBlocks d={d} light={false} owner={owner} view="reviews" />
                </div>
              </section>
            )}

            {/* Music — the member/coach's playlist library (parity with the mobile Music tab) */}
            {tab === "music" && <MusicBlock d={d} owner={owner} />}
          </React.Fragment>
        )}
        {belowContent}
        {chrome ? <DesktopFooter /> : <div style={{ height: 34 }} />}
      </div>
    </div>
  );
}

Object.assign(window, { DesktopProfile, DesktopNav, DesktopHero });
