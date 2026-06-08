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

// ── Top navigation ─────────────────────────────────────────────
function DesktopNav({ d, direction }) {
  const c = tierOf(d).color;
  const links = ["Feed", "Coaches", "Community", "Goals"];
  return (
    <header style={{ position: "sticky", top: 0, zIndex: 40, backdropFilter: "blur(18px)", background: dHexA(LV_BG, 0.72), borderBottom: `1px solid ${dHexA(LV_INK, 0.08)}` }}>
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 40px", height: 72, display: "flex", alignItems: "center", gap: 32 }}>
        {/* wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><rect x="3" y="3" width="20" height="20" rx="6" transform="rotate(45 13 13)" fill="none" stroke={c} strokeWidth="2" /><circle cx="13" cy="13" r="3.2" fill={LV_TEAL} /></svg>
          <span style={{ fontFamily: dSerif, fontSize: 22, letterSpacing: "-0.02em" }}>Shape</span>
        </div>
        {/* nav links */}
        <nav style={{ display: "flex", gap: 26, marginLeft: 18 }}>
          {links.map((l, i) => (
            <a key={l} href="#" style={{ fontFamily: dSans, fontSize: 14.5, color: i === 1 ? LV_INK : dHexA(LV_INK, 0.55), textDecoration: "none", fontWeight: i === 1 ? 600 : 400 }}>{l}</a>
          ))}
        </nav>
        {/* search pill */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 16px", borderRadius: 999, background: dHexA(LV_INK, 0.05), border: `1px solid ${dHexA(LV_INK, 0.09)}`, color: dHexA(LV_INK, 0.45), fontFamily: dSans, fontSize: 13.5, whiteSpace: "nowrap" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" /><path d="M21 21l-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          Search coaches
        </div>
        <button style={{ height: 38, padding: "0 18px", borderRadius: 999, border: 0, background: LV_TEAL, color: "#06110e", fontFamily: dSans, fontSize: 14, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", flex: "none" }}>Get started</button>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 38, height: 38, borderRadius: 999, background: dHexA(c, 0.12), border: `1px solid ${dHexA(c, 0.3)}` }}><LvCrest d={d} size={24} /></div>
      </div>
    </header>
  );
}

// ── Signature visual (branches by direction) ───────────────────
function SignalVisual({ d, reduced }) {
  return (
    <div style={{ position: "relative", display: "flex", justifyContent: "center", alignItems: "center", minHeight: 420 }}>
      <SignalSigil d={d} size={400} reduced={reduced} goalPct={d.role === "client" ? d.goalPct : null} />
      <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)" }}>
        <LvPortrait d={d} size={132} />
      </div>
    </div>
  );
}
function TerrainVisual({ d, reduced }) {
  const c = tierOf(d).color;
  return (
    <div style={{ position: "relative", borderRadius: 22, overflow: "hidden", minHeight: 420, border: `1px solid ${dHexA(c, 0.2)}`, background: dHexA(c, 0.04) }}>
      <div style={{ position: "absolute", inset: 0 }}><TerrainContours d={d} w={520} h={460} reduced={reduced} /></div>
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(120% 80% at 50% 40%, transparent 40%, ${dHexA(LV_BG, 0.55)})` }} />
      <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center" }}>
        <LvPortrait d={d} size={120} duotone />
      </div>
      <div style={{ position: "absolute", left: 20, bottom: 18, fontFamily: dMono, fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: dHexA(LV_INK, 0.6) }}>ELEV. {d.score.toLocaleString()} · summit ahead</div>
    </div>
  );
}

// ── Hero — split: identity (left) · signature visual (right) ───
function DesktopHero({ d, direction, owner, reduced, onMessage, onFollow, follow, coachingHref }) {
  const c = tierOf(d).color;
  const coach = d.role !== "client";
  const Visual = direction === "terrain" ? TerrainVisual : SignalVisual;
  return (
    <section style={{ maxWidth: 1240, margin: "0 auto", padding: "56px 40px 8px", display: "grid", gridTemplateColumns: "1.05fr 1fr", gap: 56, alignItems: "center" }} className="dk-hero">
      {/* identity */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
          <span style={{ fontFamily: dMono, fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: c, border: `1px solid ${dHexA(c, 0.4)}`, borderRadius: 999, padding: "6px 12px" }}>{direction === "terrain" ? "▲ " : "◇ "}{tierOf(d).name} · Rank {tierOf(d).rank}</span>
          {coach && d.verified && <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: dMono, fontSize: 10.5, letterSpacing: "0.06em", textTransform: "uppercase", color: LV_TEAL }}><SpVerifiedDot /> Verified</span>}
          {!coach && <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontFamily: dMono, fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: LV_TEAL }}><span className={reduced ? "" : "lv-pulse"} style={{ width: 7, height: 7, borderRadius: 999, background: LV_TEAL }} /> In training</span>}
        </div>
        <h1 style={{ fontFamily: dSerif, fontSize: 76, fontWeight: 400, letterSpacing: "-0.04em", lineHeight: 0.92, margin: 0 }}>{d.name}</h1>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginTop: 16, fontFamily: dMono, fontSize: 13, color: dHexA(LV_INK, 0.55) }}>
          <span>{d.handle}</span><span style={{ opacity: 0.4 }}>·</span><span>{d.pronouns}</span><span style={{ opacity: 0.4 }}>·</span><span>{d.city}</span><span style={{ opacity: 0.4 }}>·</span><span style={{ color: c }}>{d.roleLabel}</span>
        </div>
        {/* goal */}
        <div style={{ marginTop: 26, padding: "20px 24px", borderRadius: 16, background: dHexA(c, 0.08), border: `1px solid ${dHexA(c, 0.22)}`, maxWidth: 460 }}>
          <DKick c={c} style={{ marginBottom: 9, fontSize: 10.5 }}>{direction === "terrain" ? "⛰ Summit · " : ""}{d.goalKicker}</DKick>
          <div style={{ fontFamily: dSerif, fontSize: 27, fontStyle: "italic", letterSpacing: "-0.01em", lineHeight: 1.15 }}>{d.goal}</div>
        </div>
        {/* score strip */}
        <div style={{ display: "flex", gap: 30, marginTop: 28, alignItems: "flex-end" }}>
          <div>
            <div style={{ fontFamily: dSerif, fontSize: 44, letterSpacing: "-0.03em", lineHeight: 0.9 }}>{d.score.toLocaleString()}</div>
            <div style={{ fontFamily: dMono, fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", color: dHexA(LV_INK, 0.5), marginTop: 6 }}>Shape Score · ▲{d.scoreWk} wk</div>
          </div>
          <div style={{ width: 1, height: 44, background: dHexA(LV_INK, 0.12) }} />
          <div>
            <div style={{ fontFamily: dSerif, fontSize: 44, letterSpacing: "-0.03em", lineHeight: 0.9 }}>{d.streak}</div>
            <div style={{ fontFamily: dMono, fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", color: dHexA(LV_INK, 0.5), marginTop: 6 }}>Day streak</div>
          </div>
          <div style={{ width: 1, height: 44, background: dHexA(LV_INK, 0.12) }} />
          <div>
            <div style={{ fontFamily: dSerif, fontSize: 44, letterSpacing: "-0.03em", lineHeight: 0.9, color: LV_TEAL }}>{d.trajDelta}</div>
            <div style={{ fontFamily: dMono, fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", color: dHexA(LV_INK, 0.5), marginTop: 6 }}>{d.trajLabel}</div>
          </div>
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
            : (() => { const on = follow && (follow.isFollowing || follow.isPending); return <button onClick={onFollow} style={{ height: 50, padding: "0 26px", borderRadius: 14, border: `1px solid ${on ? LV_TEAL : dHexA(LV_INK, 0.22)}`, background: on ? dHexA(LV_TEAL, 0.12) : "transparent", color: LV_INK, fontFamily: dSans, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>{follow && follow.isFollowing ? "Following ✓" : follow && follow.isPending ? "Requested" : "Follow"}</button>; })())}
        </div>
        {/* followers / following — always public, live links */}
        {follow && (
          <div style={{ display: "flex", gap: 26, marginTop: 22, alignItems: "center" }}>
            <button onClick={() => follow.openList && follow.openList("followers")} style={{ background: "transparent", border: 0, padding: 0, cursor: "pointer", textAlign: "left" }}>
              <span style={{ fontFamily: dSerif, fontSize: 24, letterSpacing: "-0.02em" }}>{follow.followers}</span>
              <span style={{ fontFamily: dMono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: dHexA(LV_INK, 0.5), marginLeft: 7 }}>Followers</span>
            </button>
            <button onClick={() => follow.openList && follow.openList("following")} style={{ background: "transparent", border: 0, padding: 0, cursor: "pointer", textAlign: "left" }}>
              <span style={{ fontFamily: dSerif, fontSize: 24, letterSpacing: "-0.02em" }}>{follow.following}</span>
              <span style={{ fontFamily: dMono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: dHexA(LV_INK, 0.5), marginLeft: 7 }}>Following</span>
            </button>
            {owner && follow.requests > 0 && (
              <button onClick={() => follow.openRequests && follow.openRequests()} style={{ borderRadius: 999, border: 0, background: LV_TEAL, color: "#06110e", padding: "8px 14px", fontFamily: dMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}>{follow.requests} request{follow.requests === 1 ? "" : "s"}</button>
            )}
          </div>
        )}
      </div>
      {/* signature visual */}
      <Visual d={d} reduced={reduced} />
    </section>
  );
}

// ── Living signals band (full width, 3-up) ─────────────────────
function SignalsBand({ d }) {
  const c = tierOf(d).color;
  return (
    <section style={{ maxWidth: 1240, margin: "0 auto", padding: "44px 40px 0" }}>
      <DKick style={{ marginBottom: 18 }}>Living signals</DKick>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }} className="dk-3up">
        <div style={dCard({ padding: "22px 24px" })}>
          <div style={{ fontFamily: dSerif, fontSize: 46, letterSpacing: "-0.03em", lineHeight: 1 }}>{d.streak}<span style={{ fontFamily: dMono, fontSize: 14, color: LV_TEAL, marginLeft: 8 }}>△ days</span></div>
          <div style={{ fontFamily: dMono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: dHexA(LV_INK, 0.5), marginTop: 12 }}>Current streak</div>
        </div>
        <div style={dCard({ padding: "22px 24px" })}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
            <span style={{ fontFamily: dMono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: dHexA(LV_INK, 0.5) }}>Weekly momentum</span>
            <span style={{ fontFamily: dMono, fontSize: 11, color: LV_TEAL }}>today ↑</span>
          </div>
          <LvWeekBars d={d} height={48} />
        </div>
        <div style={dCard({ padding: "22px 24px", display: "flex", alignItems: "center", gap: 18 })}>
          <div style={{ flex: "none" }}>
            <div style={{ fontFamily: dSerif, fontSize: 30, letterSpacing: "-0.02em", color: LV_TEAL }}>{d.trajDelta}</div>
            <div style={{ fontFamily: dMono, fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: dHexA(LV_INK, 0.5), marginTop: 6 }}>{d.trajNote}</div>
          </div>
          <div style={{ flex: 1 }}><LvSparkline data={d.traj} color={c} w={200} h={56} /></div>
        </div>
      </div>
    </section>
  );
}

// ── The climb (terrain) — ridgeline ascent ─────────────────────
function ClimbBlock({ d }) {
  const c = tierOf(d).color;
  return (
    <div style={dCard({ padding: "24px 26px" })}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 18 }}>
        <DKick>{d.arcLabel}</DKick>
        <span style={{ fontFamily: dMono, fontSize: 11, color: dHexA(LV_INK, 0.5) }}>{d.sinceLabel} {d.since}</span>
      </div>
      <TerrainRidge d={d} />
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14 }}>
        {d.arc.map((a, i) => (
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
  if (direction === "terrain") {
    return (
      <div style={dCard({ padding: "24px 26px" })}>
        <DKick style={{ marginBottom: 18 }}>{d.discLabel} · strata</DKick>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {d.disciplines.map(([label, val], i) => {
            const col = i === d.disciplines.length - 1 ? LV_TEAL : c;
            return (
              <div key={label}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 7 }}>
                  <span style={{ fontFamily: dSans, fontSize: 14, color: dHexA(LV_INK, 0.85) }}>{label}</span>
                  <span style={{ fontFamily: dMono, fontSize: 12, color: dHexA(LV_INK, 0.5) }}>{Math.round(val * 100)}</span>
                </div>
                <div style={{ height: 8, borderRadius: 5, background: dHexA(LV_INK, 0.08), overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${val * 100}%`, background: `linear-gradient(90deg, ${dHexA(col, 0.5)}, ${col})`, borderRadius: 5 }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  // signal — ring legend grid
  return (
    <div style={dCard({ padding: "24px 26px" })}>
      <DKick style={{ marginBottom: 18 }}>{d.discLabel}</DKick>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {d.disciplines.map(([label, val], i) => {
          const col = i === 0 ? c : i === d.disciplines.length - 1 ? LV_TEAL : dHexA(c, 0.8);
          return (
            <div key={label} style={{ background: dHexA(LV_INK, 0.03), border: `1px solid ${dHexA(LV_INK, 0.08)}`, borderRadius: 13, padding: "14px 15px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 9, height: 9, borderRadius: 999, background: col }} />
                <span style={{ fontFamily: dSans, fontSize: 13.5, color: dHexA(LV_INK, 0.82) }}>{label}</span>
              </div>
              <div style={{ fontFamily: dSerif, fontSize: 26, letterSpacing: "-0.02em", marginTop: 8 }}>{Math.round(val * 100)}<span style={{ fontSize: 13, color: dHexA(LV_INK, 0.4) }}>/100</span></div>
              <div style={{ height: 3, borderRadius: 2, background: dHexA(LV_INK, 0.1), marginTop: 9, overflow: "hidden" }}><div style={{ height: "100%", width: `${val * 100}%`, background: col, borderRadius: 2 }} /></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Records / signature numbers ────────────────────────────────
function RecordsBlock({ d }) {
  const c = tierOf(d).color;
  return (
    <div style={dCard({ padding: "24px 26px" })}>
      <DKick style={{ marginBottom: 18 }}>{d.liftsLabel}</DKick>
      <div style={{ display: "flex", gap: 12 }}>
        {d.lifts.map(([label, val]) => (
          <div key={label} style={{ flex: 1, textAlign: "center", background: dHexA(c, 0.08), border: `1px solid ${dHexA(c, 0.2)}`, borderRadius: 14, padding: "20px 8px" }}>
            <div style={{ fontFamily: dSerif, fontSize: 32, letterSpacing: "-0.02em" }}>{val}</div>
            <div style={{ fontFamily: dMono, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: dHexA(LV_INK, 0.5), marginTop: 7 }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Relation card ──────────────────────────────────────────────
function RelationBlock({ d }) {
  return (
    <div style={dCard({ padding: "22px 24px" })}>
      <DKick style={{ marginBottom: 14 }}>{d.relation.kicker}</DKick>
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <div style={{ width: 48, height: 48, borderRadius: 999, flex: "none", background: `linear-gradient(150deg, hsl(${d.relation.hue} 40% 34%), hsl(${d.relation.hue} 36% 20%))`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: dSerif, fontSize: 18 }}>{d.relation.initials}</div>
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
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <DKick>{d.feedLabel}{direction === "terrain" ? " · log" : ""}</DKick>
        {owner && <span style={{ fontFamily: dMono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: dHexA(LV_INK, 0.4) }}>＋ Post</span>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }} className="dk-feed">
        {shown.map((it, i) => {
          const hot = it.k === "win" || it.k === "pr";
          return (
            <div key={i} style={dCard({ padding: "18px 20px" })}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span style={{ fontFamily: dMono, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: c, background: dHexA(c, 0.12), padding: "4px 8px", borderRadius: 6 }}>{mark}{LV_FEED[it.k] || it.k}</span>
                <span style={{ marginLeft: "auto", fontFamily: dMono, fontSize: 11, color: dHexA(LV_INK, 0.4) }}>{it.time}</span>
              </div>
              <div style={{ fontFamily: dSerif, fontSize: 21, letterSpacing: "-0.01em", lineHeight: 1.15, marginTop: 12 }}>{it.t}</div>
              <p style={{ fontFamily: dSans, fontSize: 14, lineHeight: 1.55, color: dHexA(LV_INK, 0.72), margin: "8px 0 0", textWrap: "pretty" }}>{it.b}</p>
              {it.metric && (
                <div style={{ display: "inline-flex", alignItems: "baseline", gap: 9, marginTop: 14, padding: "7px 13px", borderRadius: 10, background: dHexA(c, 0.1), border: `1px solid ${dHexA(c, 0.22)}` }}>
                  <span style={{ fontFamily: dMono, fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: dHexA(LV_INK, 0.6) }}>{it.metric[0]}</span>
                  <span style={{ fontFamily: dSerif, fontSize: 19, letterSpacing: "-0.02em", color: hot ? LV_TEAL : LV_INK }}>{it.metric[1]}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {!owner && hidden > 0 && (
        <div style={{ fontFamily: dMono, fontSize: 11, letterSpacing: "0.06em", color: dHexA(LV_INK, 0.38), marginTop: 14 }}>{direction === "terrain" ? "▲" : "↯"} {hidden} private {hidden === 1 ? "entry" : "entries"} hidden</div>
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
        <span style={{ fontFamily: dMono, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: c, border: `1px solid ${dHexA(c, 0.45)}`, borderRadius: 999, padding: "6px 12px" }}>● {tierOf(d).name} · Rank {tierOf(d).rank}</span>
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
          : (() => { const on = follow && (follow.isFollowing || follow.isPending); return <button onClick={onFollow} style={{ height: 50, padding: "0 26px", borderRadius: 14, border: `1px solid ${on ? LV_TEAL : dHexA(LV_INK, 0.22)}`, background: on ? dHexA(LV_TEAL, 0.12) : "transparent", color: LV_INK, fontFamily: dSans, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>{follow && follow.isFollowing ? "Following ✓" : follow && follow.isPending ? "Requested" : "Follow"}</button>; })()}
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
function DesktopProfile({ direction = "terrain", persona = "client", variant = "public", person, onMessage, onFollow, follow, coachingHref }) {
  const d = person || LV_PEOPLE[persona];
  const c = tierOf(d).color;
  const reduced = useReducedMotion();
  const owner = variant === "own";
  const locked = variant === "locked";
  const coach = d.role !== "client";

  return (
    <div style={{ position: "relative", minHeight: "100vh", background: LV_BG, color: LV_INK, fontFamily: dSans, overflow: "hidden" }}>
      {/* atmosphere */}
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", background: `radial-gradient(90% 50% at 78% -4%, ${dHexA(c, 0.28)}, transparent 60%), radial-gradient(80% 50% at 0% 12%, ${dHexA(c, 0.12)}, transparent 55%)` }} />
      <div style={{ position: "relative" }}>
        <DesktopNav d={d} direction={direction} />
        {locked ? (
          <DesktopLocked d={d} follow={follow} onMessage={onMessage} onFollow={onFollow} coachingHref={coachingHref} />
        ) : (
          <React.Fragment>
            <DesktopHero d={d} direction={direction} owner={owner} reduced={reduced} onMessage={onMessage} onFollow={onFollow} follow={follow} coachingHref={coachingHref} />
            <SignalsBand d={d} />
            {/* content grid */}
            <section style={{ maxWidth: 1240, margin: "0 auto", padding: "44px 40px 0", display: "grid", gridTemplateColumns: "1.55fr 1fr", gap: 24, alignItems: "start" }} className="dk-grid">
              {/* main column */}
              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                {direction === "terrain" && <ClimbBlock d={d} />}
                <DisciplinesBlock d={d} direction={direction} />
                {coach && <div style={dCard({ padding: "8px 24px 26px" })}><LvCoachBlocks d={d} light={false} owner={owner} /></div>}
                <FeedBlock d={d} direction={direction} owner={owner} />
              </div>
              {/* rail */}
              <aside style={{ display: "flex", flexDirection: "column", gap: 24, position: "sticky", top: 96 }} className="dk-rail">
                <RecordsBlock d={d} />
                <RelationBlock d={d} />
              </aside>
            </section>
          </React.Fragment>
        )}
        <DesktopFooter />
      </div>
    </div>
  );
}

Object.assign(window, { DesktopProfile, DesktopNav, DesktopHero });
