// ═══════════════════════════════════════════════════════════════
// CLIENT HERO DESIGNS — a distinct signature object per direction so a
// member reads completely differently from a coach at first glance.
//   SIGNAL    → live vitals / ECG cardiograph monitor
//   TERRAIN   → side-view ascent profile ("you are here")
//   FRONT     → taped-polaroid training journal
//   PASS      → race bib
// Each takes { d, owner, locked, reduced, light }. Depends on livingShared.
// ═══════════════════════════════════════════════════════════════

// shared: name + identity line (compact)
function ClientId({ d, ink, align = "left", reduced }) {
  return (
    <div style={{ textAlign: align }}>
      <h1 style={{ fontFamily: lvSerif, fontSize: 32, fontWeight: 400, letterSpacing: "-0.03em", margin: 0, lineHeight: 0.95, color: ink }}>{d.name}</h1>
      <div style={{ fontFamily: lvMono, fontSize: 11, color: hexA(ink, 0.55), marginTop: 7 }}>{d.handle} · {d.pronouns} · {d.city}</div>
    </div>
  );
}

// ── SIGNAL · client → VITALS MONITOR ─────────────────────────
function ecgPath(W, H, beats = 4) {
  const mid = H * 0.54, seg = W / beats;
  // PQRST beat as fractions of seg width, amplitude fractions of H
  const k = [[0,0],[.34,0],[.40,-.10],[.46,0],[.52,0],[.55,.12],[.60,-.78],[.65,.34],[.70,0],[.80,0],[.86,-.18],[.92,0],[1,0]];
  let dPath = `M 0 ${mid}`;
  for (let b = 0; b < beats; b++) {
    const x0 = b * seg;
    k.forEach(([fx, fy]) => { dPath += ` L ${(x0 + fx * seg).toFixed(1)} ${(mid + fy * H * 0.62).toFixed(1)}`; });
  }
  return dPath;
}
function ClientSignalHero({ d, owner, locked, reduced }) {
  const c = tierOf(d).color;
  const W = 320, H = 84;
  const path = ecgPath(W, H);
  return (
    <div style={{ borderRadius: 20, overflow: "hidden", border: `1px solid ${hexA(LV_INK, 0.12)}`, background: `linear-gradient(180deg, ${hexA(c, 0.12)}, ${hexA(LV_INK, 0.02)} 50%)` }}>
      {/* monitor header */}
      <div style={{ display: "flex", alignItems: "center", gap: 13, padding: "16px 16px 12px" }}>
        <div style={{ width: 60, height: 60, borderRadius: 13, overflow: "hidden", flex: "none", border: `1px solid ${hexA(LV_INK, 0.15)}`, position: "relative", background: "#0f1513" }}>
          {locked || !d.portrait ? <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}><LvCrest d={d} size={36} /></div>
            : <img src={lvPortraitURL(d.portrait, 140)} alt={d.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
          {owner && !locked && <div style={{ position: "absolute", right: 3, bottom: 3 }}><LvAddBadge c={c} size={34} replace /></div>}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <ClientId d={d} ink={LV_INK} reduced={reduced} />
        </div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: lvMono, fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: LV_TEAL, flex: "none", alignSelf: "flex-start" }}>
          <span className={reduced ? "" : "lv-pulse"} style={{ width: 6, height: 6, borderRadius: 999, background: LV_TEAL }} /> Live
        </span>
      </div>
      {/* ECG strip */}
      <div style={{ position: "relative", margin: "0 16px", borderRadius: 12, background: "#0c1110", border: `1px solid ${hexA(LV_INK, 0.08)}`, overflow: "hidden" }}>
        <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block" }} aria-hidden="true">
          {[...Array(7)].map((_, i) => <line key={"v" + i} x1={i * W / 7} y1="0" x2={i * W / 7} y2={H} stroke={hexA(LV_TEAL, 0.07)} strokeWidth="1" />)}
          {[...Array(3)].map((_, i) => <line key={"h" + i} x1="0" y1={(i + 1) * H / 4} x2={W} y2={(i + 1) * H / 4} stroke={hexA(LV_TEAL, 0.07)} strokeWidth="1" />)}
          <path d={path} fill="none" stroke={hexA(LV_TEAL, 0.45)} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
          <path d={path} fill="none" stroke={LV_TEALB} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" className={reduced ? "" : "ecg-draw"} style={{ filter: `drop-shadow(0 0 4px ${hexA(LV_TEAL, 0.7)})` }} />
        </svg>
        <span style={{ position: "absolute", top: 6, left: 9, fontFamily: lvMono, fontSize: 8, letterSpacing: "0.14em", color: hexA(LV_TEAL, 0.7) }}>EFFORT · 7-DAY</span>
      </div>
      {/* readouts */}
      <div style={{ display: "flex", padding: "12px 16px 16px", gap: 0 }}>
        {[["Output", d.score.toLocaleString(), `▲${d.scoreWk}`], ["Streak", d.streak, "days"], ["Tier", tierOf(d).name, tierOf(d).rank]].map(([l, v, s], i) => (
          <div key={i} style={{ flex: 1, paddingLeft: i ? 14 : 0, borderLeft: i ? `1px solid ${hexA(LV_INK, 0.1)}` : "none" }}>
            <div style={{ fontFamily: lvMono, fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: hexA(LV_INK, 0.45) }}>{l}</div>
            <div style={{ fontFamily: lvSerif, fontSize: 23, letterSpacing: "-0.02em", lineHeight: 1, marginTop: 5 }}>{v}</div>
            <div style={{ fontFamily: lvMono, fontSize: 9, color: i === 0 ? LV_TEAL : hexA(LV_INK, 0.45), marginTop: 4 }}>{s}</div>
          </div>
        ))}
      </div>
      {/* target */}
      <div style={{ padding: "0 16px 16px" }}><LvGoalProgress d={d} /></div>
      {!locked && <div style={{ padding: "0 16px 16px" }}><LvClientBand d={d} /></div>}
    </div>
  );
}

// ── TERRAIN · client → ASCENT PROFILE ────────────────────────
function ClientTerrainHero({ d, owner, locked, reduced }) {
  const c = tierOf(d).color;
  const W = 330, H = 220, pct = d.goalPct;
  // ascent ridge: base-left low → summit-right high
  const base = [10, H - 26], peak = [W - 26, 34];
  const ctrl = `Q ${W * 0.4} ${H - 40}, ${W * 0.62} ${H * 0.5} T ${peak[0]} ${peak[1]}`;
  const ridge = `M ${base[0]} ${base[1]} ${ctrl}`;
  // position of "you are here" along ridge (approx by pct on a sampled path)
  const here = { x: base[0] + (peak[0] - base[0]) * pct, y: base[1] + (peak[1] - base[1]) * (pct * 1.05) };
  return (
    <div style={{ borderRadius: 20, overflow: "hidden", border: `1px solid ${hexA(LV_INK, 0.12)}`, background: `linear-gradient(180deg, ${hexA(c, 0.14)}, ${hexA(LV_INK, 0.02)})`, position: "relative" }}>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" style={{ display: "block" }}>
        <defs><linearGradient id="ascFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={hexA(c, 0.32)} /><stop offset="100%" stopColor={hexA(c, 0)} /></linearGradient></defs>
        {/* elevation gridlines */}
        {[...Array(4)].map((_, i) => <line key={i} x1="0" y1={(i + 1) * H / 5} x2={W} y2={(i + 1) * H / 5} stroke={hexA(LV_INK, 0.06)} strokeWidth="1" />)}
        <path d={`${ridge} L ${peak[0]} ${H} L ${base[0]} ${H} Z`} fill="url(#ascFill)" />
        <path d={ridge} fill="none" stroke={hexA(LV_INK, 0.4)} strokeWidth="1.5" />
        {/* completed route (teal) up to here */}
        <path d={ridge} fill="none" stroke={LV_TEAL} strokeWidth="2.5" strokeDasharray={`${pct * 360} 999`} strokeLinecap="round" />
        {/* summit flag */}
        <g>
          <line x1={peak[0]} y1={peak[1]} x2={peak[0]} y2={peak[1] - 22} stroke={hexA(LV_INK, 0.6)} strokeWidth="1.5" />
          <path d={`M ${peak[0]} ${peak[1] - 22} l 16 5 l -16 5 z`} fill={c} />
          <circle cx={peak[0]} cy={peak[1]} r="3.5" fill={c} />
        </g>
        {/* base marker */}
        <circle cx={base[0]} cy={base[1]} r="3.5" fill={hexA(LV_INK, 0.5)} />
      </svg>
      {/* you-are-here portrait badge */}
      <div style={{ position: "absolute", left: `calc(${(here.x / W) * 100}% - 27px)`, top: `calc(${(here.y / H) * 100}% - 58px)` }}>
        <div style={{ width: 54, height: 54, borderRadius: 999, padding: 2.5, background: LV_TEAL, boxShadow: `0 6px 18px ${hexA("#000", 0.5)}` }}>
          {locked || !d.portrait ? <div style={{ width: "100%", height: "100%", borderRadius: 999, background: "#0f1513", display: "flex", alignItems: "center", justifyContent: "center" }}><LvCrest d={d} size={30} /></div>
            : <img src={lvPortraitURL(d.portrait, 130)} alt={d.name} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 999, border: "2.5px solid #14100c" }} />}
        </div>
        <div style={{ position: "absolute", top: 60, left: "50%", transform: "translateX(-50%)", whiteSpace: "nowrap", fontFamily: lvMono, fontSize: 8, letterSpacing: "0.1em", textTransform: "uppercase", color: LV_TEAL, background: hexA("#0c1110", 0.85), padding: "2px 6px", borderRadius: 4 }}>You · {Math.round(pct * 100)}%</div>
      </div>
      {/* labels */}
      <div style={{ position: "absolute", left: 14, bottom: 12, fontFamily: lvMono, fontSize: 8.5, letterSpacing: "0.1em", textTransform: "uppercase", color: hexA(LV_INK, 0.5) }}>{d.arc[0][0]} · start</div>
      <div style={{ position: "absolute", right: 14, top: 14, fontFamily: lvMono, fontSize: 8.5, letterSpacing: "0.1em", textTransform: "uppercase", color: c, textAlign: "right" }}>Summit<br/>{d.goalShort}</div>
      {/* identity strip */}
      <div style={{ padding: "16px", borderTop: `1px solid ${hexA(LV_INK, 0.08)}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <ClientId d={d} ink={LV_INK} reduced={reduced} />
        <LvClientStatus reduced={reduced} />
      </div>
      {!locked && <div style={{ padding: "0 16px 16px" }}><LvClientBand d={d} /></div>}
    </div>
  );
}

// ── FRONT PAGE · client → TRAINING JOURNAL (polaroid) ────────
function ClientFrontHero({ d, owner, locked, reduced }) {
  const c = tierOf(d).color, ink = "#1a1612";
  return (
    <div style={{ position: "relative", padding: "8px 4px 4px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: `1px solid ${hexA(ink, 0.25)}`, paddingBottom: 8 }}>
        <span style={{ fontFamily: lvSerif, fontSize: 22, fontStyle: "italic", letterSpacing: "-0.01em", color: ink }}>{d.first}’s training journal</span>
        <span style={{ fontFamily: lvMono, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: hexA(ink, 0.5) }}>Wk {d.scoreWk}</span>
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 18, alignItems: "flex-start" }}>
        {/* taped polaroid */}
        <div style={{ position: "relative", transform: "rotate(-4deg)", flex: "none" }}>
          <div style={{ background: "#fff", padding: "8px 8px 30px", boxShadow: "0 10px 24px rgba(0,0,0,0.22)", borderRadius: 2 }}>
            <div style={{ width: 116, height: 116, overflow: "hidden", background: "#e7e2d8" }}>
              {locked || !d.portrait ? <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}><LvCrest d={d} size={48} /></div>
                : <img src={lvPortraitURL(d.portrait, 240)} alt={d.name} style={{ width: "100%", height: "100%", objectFit: "cover", filter: "saturate(0.92) contrast(1.03)" }} />}
            </div>
            <div style={{ fontFamily: lvSerif, fontSize: 13, fontStyle: "italic", color: "#3a352c", textAlign: "center", marginTop: 7 }}>wk 6 · feeling strong</div>
          </div>
          {/* tape */}
          <div style={{ position: "absolute", top: -8, left: "50%", transform: "translateX(-50%) rotate(3deg)", width: 54, height: 18, background: hexA(c, 0.4), border: `1px solid ${hexA(c, 0.5)}` }} />
          {owner && !locked && <div style={{ position: "absolute", right: -6, bottom: 20 }}><LvAddBadge c={c} size={34} replace /></div>}
        </div>
        {/* journal entry */}
        <div style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>
          <span style={{ fontFamily: lvMono, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: c }}>Today’s entry —</span>
          <h1 style={{ fontFamily: lvSerif, fontSize: 30, fontWeight: 400, letterSpacing: "-0.02em", lineHeight: 1, margin: "8px 0 0", color: ink }}>{d.name}</h1>
          <p style={{ fontFamily: lvSerif, fontSize: 16, fontStyle: "italic", lineHeight: 1.35, color: hexA(ink, 0.8), margin: "10px 0 0" }}>“Chasing {d.goalShort.toLowerCase()}. {d.streak} days straight.”</p>
          <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}><LvClientStatus light reduced={reduced} /></div>
        </div>
      </div>
      <div style={{ marginTop: 18, border: `1px solid ${hexA(ink, 0.2)}`, borderTop: `2px solid ${c}`, padding: "14px 16px" }}><LvGoalProgress d={d} light /></div>
      {!locked && <div style={{ marginTop: 12 }}><LvClientBand d={d} light /></div>}
    </div>
  );
}

// ── PASS · client → RACE BIB ─────────────────────────────────
function ClientPassHero({ d, owner, locked, reduced }) {
  const c = tierOf(d).color, ink = "#1a1612";
  const pin = (side) => (
    <div style={{ position: "absolute", top: 12, [side]: 14, width: 16, height: 16, borderRadius: 999, border: `2px solid ${hexA(ink, 0.4)}`, background: "transparent" }}>
      <div style={{ position: "absolute", top: 5, left: -6, width: 12, height: 2, background: hexA(ink, 0.4), transform: "rotate(20deg)" }} />
    </div>
  );
  return (
    <div style={{ position: "relative", background: "#f3efe6", color: ink, borderRadius: 6, padding: "24px 22px 16px", boxShadow: `0 24px 60px ${hexA("#000", 0.5)}`, border: `1px solid ${hexA(ink, 0.15)}` }}>
      {pin("left")}{pin("right")}
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: lvMono, fontSize: 10, letterSpacing: "0.4em", textTransform: "uppercase", color: hexA(ink, 0.55) }}>Shape Athlete</div>
        <div style={{ fontFamily: lvSerif, fontSize: 76, fontWeight: 500, letterSpacing: "-0.03em", lineHeight: 0.9, marginTop: 6, color: ink }}>{d.member}</div>
        <div style={{ height: 4, background: c, margin: "12px auto 0", width: "70%" }} />
        <h1 style={{ fontFamily: lvSerif, fontSize: 30, fontWeight: 400, letterSpacing: "-0.02em", margin: "14px 0 0", color: ink }}>{d.name}</h1>
        <div style={{ fontFamily: lvMono, fontSize: 10, color: hexA(ink, 0.55), marginTop: 7 }}>{d.handle} · {d.pronouns}</div>
        <div style={{ display: "flex", justifycontent: "center", gap: 8, marginTop: 12, alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontFamily: lvMono, fontSize: 9.5, letterSpacing: "0.12em", textTransform: "uppercase", color: c, border: `1px solid ${hexA(c, 0.5)}`, borderRadius: 999, padding: "4px 10px" }}>● {tierOf(d).name} · {tierOf(d).rank}</span>
          <LvClientStatus light reduced={reduced} />
        </div>
      </div>
      {/* portrait chip + goal */}
      <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 18, paddingTop: 16, borderTop: `1px dashed ${hexA(ink, 0.3)}` }}>
        <div style={{ width: 56, height: 56, borderRadius: 999, overflow: "hidden", flex: "none", border: `2px solid ${c}`, position: "relative", background: "#e7e2d8" }}>
          {locked || !d.portrait ? <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}><LvCrest d={d} size={30} /></div>
            : <img src={lvPortraitURL(d.portrait, 130)} alt={d.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
          {owner && !locked && <div style={{ position: "absolute", right: -2, bottom: -2 }}><LvAddBadge c={c} size={30} replace /></div>}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: lvMono, fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: hexA(ink, 0.5) }}>Racing toward</div>
          <div style={{ fontFamily: lvSerif, fontSize: 17, fontStyle: "italic", color: ink, marginTop: 3 }}>{d.goal}</div>
        </div>
      </div>
      {!locked && <div style={{ marginTop: 14 }}><LvGoalProgress d={d} light /></div>}
      {/* torn perforation */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, fontFamily: lvMono, fontSize: 8, letterSpacing: "0.14em", color: hexA(ink, 0.4) }}>
        <span>SHP-{d.tier.toUpperCase()}-{d.member}</span><span>{d.sinceLabel.toUpperCase()} {d.since}</span>
      </div>
    </div>
  );
}
