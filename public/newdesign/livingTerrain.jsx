// ═══════════════════════════════════════════════════════════════
// DIRECTION B · TERRAIN
// Thesis: your progress is a landscape. The screen is a topographic
// map of your ascent — contour lines from your data, a ridgeline you
// climb from where you started, through Now, toward your summit goal.
// Depends on livingShared.jsx.
// ═══════════════════════════════════════════════════════════════

// Generative contour field — nested closed curves seeded by the member.
function TerrainContours({ d, w = 360, h = 300, reduced }) {
  const c = tierOf(d).color;
  const rng = lvRng(d.seed);
  const layers = 9;
  const cxs = 0.5 + (rng() - 0.5) * 0.3;
  const paths = [];
  for (let L = 0; L < layers; L++) {
    const t = L / (layers - 1);
    const baseR = (0.16 + t * 0.82);
    const pts = [];
    const N = 26;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      const wobble = 1 + Math.sin(a * 3 + d.seed % 7 + L * 0.6) * 0.09 + Math.cos(a * 5 + L) * 0.05;
      const rr = baseR * wobble;
      const x = w * cxs + Math.cos(a) * rr * w * 0.52;
      const y = h * 0.52 + Math.sin(a) * rr * h * 0.46;
      pts.push([x, y]);
    }
    const dPath = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ") + " Z";
    paths.push({ dPath, t });
  }
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="xMidYMid slice" aria-hidden="true" className={reduced ? "" : "td-tide"} style={{ display: "block" }}>
      <defs>
        <radialGradient id="tdPeak" cx={`${cxs * 100}%`} cy="52%" r="60%">
          <stop offset="0%" stopColor={hexA(c, 0.5)} /><stop offset="40%" stopColor={hexA(c, 0.16)} /><stop offset="100%" stopColor={hexA(c, 0)} />
        </radialGradient>
      </defs>
      <rect width={w} height={h} fill="url(#tdPeak)" />
      {paths.map((p, i) => (
        <path key={i} d={p.dPath} fill="none" stroke={i === layers - 3 ? LV_TEAL : hexA(c, 0.32 + p.t * 0.4)} strokeWidth={i === layers - 3 ? 1.8 : 1} opacity={0.4 + p.t * 0.55} />
      ))}
      {/* summit marker */}
      <circle cx={w * cxs} cy={h * 0.52} r={4} fill={LV_TEALB} />
      <circle cx={w * cxs} cy={h * 0.52} r={9} fill="none" stroke={LV_TEAL} strokeWidth={1} opacity={0.6} />
    </svg>
  );
}

// Ridgeline ascent: start → now → target as a climbed path.
function TerrainRidge({ d }) {
  const c = tierOf(d).color;
  const W = 320, H = 132;
  const ys = [H - 18, H * 0.52, 22];
  const xs = [24, W / 2, W - 24];
  const ridge = `M ${xs[0]} ${ys[0]} Q ${(xs[0]+xs[1])/2} ${ys[0]-26}, ${xs[1]} ${ys[1]} T ${xs[2]} ${ys[2]}`;
  const fill = `${ridge} L ${xs[2]} ${H} L ${xs[0]} ${H} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} aria-hidden="true" style={{ display: "block", overflow: "visible" }}>
      <defs><linearGradient id="tdRidge" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={hexA(c, 0.3)} /><stop offset="100%" stopColor={hexA(c, 0)} /></linearGradient></defs>
      <path d={fill} fill="url(#tdRidge)" />
      <path d={ridge} fill="none" stroke={hexA(LV_INK, 0.25)} strokeWidth={1.5} strokeDasharray="3 4" />
      {d.arc.map((a, i) => {
        const live = a[2] === "now", target = a[2] === "target";
        return (
          <g key={i}>
            <circle cx={xs[i]} cy={ys[i]} r={live ? 6 : 4.5} fill={live ? LV_TEAL : target ? "none" : c} stroke={target ? c : "none"} strokeWidth={target ? 2 : 0} />
            {live && <circle cx={xs[i]} cy={ys[i]} r={11} fill="none" stroke={LV_TEAL} strokeWidth={1} opacity={0.5} />}
          </g>
        );
      })}
    </svg>
  );
}

// Field-notes feed — an expedition log descending a dashed trail.
function TerrainFeed({ d, owner }) {
  const c = tierOf(d).color;
  const [vis, cycle] = useLvFeed(d.feed);
  const shown = d.feed.map((it, i) => ({ it, i })).filter(({ i }) => lvFeedVisible(vis[i], owner));
  const hidden = d.feed.length - shown.length;
  return (
    <div style={{ marginTop: 30 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <LvKicker>{d.feedLabel} · log</LvKicker>
        {owner && <span style={{ fontFamily: lvMono, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: hexA(LV_INK, 0.4) }}>＋ Post</span>}
      </div>
      <div style={{ position: "relative", paddingLeft: 26 }}>
        <div style={{ position: "absolute", left: 6, top: 6, bottom: 10, width: 0, borderLeft: `1.5px dashed ${hexA(c, 0.4)}` }} />
        {shown.map(({ it, i }, k) => (
          <div key={i} style={{ position: "relative", marginBottom: 12 }}>
            {/* waypoint chevron */}
            <div style={{ position: "absolute", left: -26, top: 15, width: 14, height: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: 9, height: 9, transform: "rotate(45deg)", background: LV_BG, border: `2px solid ${it.k === "win" || it.k === "pr" ? LV_TEAL : c}` }} />
            </div>
            <div style={{ background: hexA(LV_INK, 0.04), border: `1px solid ${hexA(LV_INK, 0.08)}`, borderRadius: 14, padding: "13px 15px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: lvMono, fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: c }}>▲ {LV_FEED[it.k]}</span>
                {owner && <LvVisPill vis={vis[i]} onCycle={() => cycle(i)} />}
                <span style={{ marginLeft: "auto", fontFamily: lvMono, fontSize: 10, color: hexA(LV_INK, 0.4) }}>{it.time}</span>
              </div>
              <div style={{ fontFamily: lvSerif, fontSize: 18, letterSpacing: "-0.01em", lineHeight: 1.15, marginTop: 9 }}>{it.t}</div>
              <p style={{ fontFamily: lvSans, fontSize: 13, lineHeight: 1.5, color: hexA(LV_INK, 0.72), margin: "6px 0 0" }}>{it.b}</p>
              {it.metric && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 11 }}>
                  <div style={{ flex: 1, height: 1, background: hexA(LV_INK, 0.12) }} />
                  <span style={{ fontFamily: lvMono, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: hexA(LV_INK, 0.55) }}>{it.metric[0]}</span>
                  <span style={{ fontFamily: lvSerif, fontSize: 18, letterSpacing: "-0.02em", color: it.k === "win" || it.k === "pr" ? LV_TEAL : LV_INK }}>{it.metric[1]}</span>
                </div>
              )}
            </div>
          </div>
        ))}
        {!owner && hidden > 0 && (
          <div style={{ fontFamily: lvMono, fontSize: 10, letterSpacing: "0.06em", color: hexA(LV_INK, 0.38), paddingLeft: 2 }}>▲ {hidden} private {hidden === 1 ? "note" : "notes"} off-trail</div>
        )}
      </div>
    </div>
  );
}

function TerrainProfile({ persona = "client", variant = "public" }) {
  const d = LV_PEOPLE[persona];
  const c = tierOf(d).color;
  const reduced = useReducedMotion();
  const owner = variant === "own";
  const locked = variant === "locked";
  const [ref, show, onScroll] = useLvScroll(200);
  const [privacy, setPrivacy] = React.useState("public");
  const cyclePriv = () => setPrivacy(p => LV_PRIV_ORDER[(LV_PRIV_ORDER.indexOf(p) + 1) % 3]);

  return (
    <LvScreen d={d} contentRef={ref} onScroll={onScroll}>
      <LvStickyBar d={d} show={show && !locked} onMsg={() => {}} />

      {/* Topographic hero with name overlaid */}
      {d.role === "client" ? (
      <div style={{ padding: "58px 20px 0" }}><ClientTerrainHero d={d} owner={owner} locked={locked} reduced={reduced} /></div>
      ) : (
      <div style={{ position: "relative" }}>
        <div style={{ position: "absolute", inset: 0, top: 0 }}><TerrainContours d={d} reduced={reduced} /></div>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 120, background: `linear-gradient(180deg, transparent, ${LV_BG})` }} />
        {/* survey medallion stamped at the summit */}
        <div style={{ position: "absolute", top: 74, left: "50%", transform: "translateX(-50%)", zIndex: 3 }}>
          <LvPortrait d={d} size={84} duotone editable={owner} hide={locked} />
        </div>
        <div style={{ position: "relative", padding: "58px 22px 0", minHeight: 300, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: lvMono, fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: c, border: `1px solid ${hexA(c, 0.4)}`, borderRadius: 999, padding: "5px 10px" }}>▲ {tierOf(d).name}</span>
            <LvKicker>ELEV. {d.score.toLocaleString()}</LvKicker>
          </div>
          <div style={{ marginTop: 130 }}>
            {d.role === "client"
              ? <div style={{ marginBottom: 12 }}><LvClientStatus reduced={reduced} /></div>
              : <LvKicker style={{ marginBottom: 8 }}>{d.roleLabel}</LvKicker>}
            <h1 style={{ fontFamily: lvSerif, fontSize: 44, fontWeight: 400, letterSpacing: "-0.035em", margin: 0, lineHeight: 0.92 }}>{d.name}</h1>
            <div style={{ fontFamily: lvMono, fontSize: 11, color: hexA(LV_INK, 0.55), marginTop: 9 }}>{d.handle} · {d.pronouns} · {d.city}</div>
          </div>
        </div>
      </div>
      )}

      <div style={{ padding: "26px 22px 172px" }}>
        {/* goal as summit */}
        {d.role !== "client" && (
        <div style={{ background: hexA(c, 0.08), border: `1px solid ${hexA(c, 0.22)}`, borderRadius: 16, padding: "16px 18px" }}>
          <LvKicker c={c} style={{ marginBottom: 8 }}>⛰ Summit · {d.goalKicker}</LvKicker>
          <div style={{ fontFamily: lvSerif, fontSize: 23, fontStyle: "italic", letterSpacing: "-0.01em", lineHeight: 1.12 }}>{d.goal}</div>
        </div>
        )}

        {/* the climb ridgeline */}
        <div style={{ marginTop: 26 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
            <LvKicker>{d.arcLabel}</LvKicker>
            <span style={{ fontFamily: lvMono, fontSize: 10, color: hexA(LV_INK, 0.5) }}>{d.sinceLabel} {d.since} · <a href="#" style={{ color: c }}>{d.link[0]} ↗</a></span>
          </div>
          <TerrainRidge d={d} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10 }}>
            {d.arc.map((a, i) => (
              <div key={i} style={{ flex: 1, textAlign: i === 0 ? "left" : i === 2 ? "right" : "center" }}>
                <div style={{ fontFamily: lvMono, fontSize: 9, letterSpacing: "0.12em", color: a[2] === "now" ? LV_TEAL : hexA(LV_INK, 0.5) }}>{a[0]}</div>
                <div style={{ fontFamily: lvSans, fontSize: 12, color: hexA(LV_INK, 0.85), marginTop: 4 }}>{a[1]}</div>
              </div>
            ))}
          </div>
        </div>

        {/* living signals: streak · weekly momentum · trajectory */}
        <div style={{ marginTop: 28 }}>
          <LvKicker style={{ marginBottom: 14 }}>Living signals</LvKicker>
          <div style={{ display: "flex", gap: 9 }}>
            <div style={{ flex: "none", width: 96, background: hexA(c, 0.08), border: `1px solid ${hexA(c, 0.2)}`, borderRadius: 14, padding: "13px 14px" }}>
              <div style={{ fontFamily: lvSerif, fontSize: 28, letterSpacing: "-0.02em", lineHeight: 1 }}>{d.streak}</div>
              <div style={{ fontFamily: lvMono, fontSize: 8.5, letterSpacing: "0.1em", textTransform: "uppercase", color: hexA(LV_INK, 0.5), marginTop: 6 }}>Day streak</div>
            </div>
            <div style={{ flex: 1, background: hexA(LV_INK, 0.04), border: `1px solid ${hexA(LV_INK, 0.08)}`, borderRadius: 14, padding: "13px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 9 }}>
                <span style={{ fontFamily: lvMono, fontSize: 8.5, letterSpacing: "0.1em", textTransform: "uppercase", color: hexA(LV_INK, 0.5) }}>Weekly momentum</span>
                <span style={{ fontFamily: lvMono, fontSize: 10, color: LV_TEAL }}>today ↑</span>
              </div>
              <LvWeekBars d={d} height={30} />
            </div>
          </div>
          <div style={{ marginTop: 9, background: hexA(LV_INK, 0.04), border: `1px solid ${hexA(LV_INK, 0.08)}`, borderRadius: 14, padding: "13px 16px", display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ flex: "none" }}>
              <div style={{ fontFamily: lvSerif, fontSize: 22, letterSpacing: "-0.02em", color: LV_TEAL }}>{d.trajDelta}</div>
              <div style={{ fontFamily: lvMono, fontSize: 8.5, letterSpacing: "0.1em", textTransform: "uppercase", color: hexA(LV_INK, 0.5), marginTop: 5 }}>{d.trajLabel}</div>
            </div>
            <div style={{ flex: 1 }}><LvSparkline data={d.traj} color={c} w={150} h={34} /></div>
            <div style={{ fontFamily: lvSans, fontSize: 11, color: hexA(LV_INK, 0.5), flex: "none" }}>{d.trajNote}</div>
          </div>
        </div>

        {/* discipline strata — horizontal contour bars */}
        <div style={{ marginTop: 28 }}>
          <LvKicker style={{ marginBottom: 14 }}>{d.discLabel} · strata</LvKicker>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {d.disciplines.map(([label, val], i) => {
              const col = i === d.disciplines.length - 1 ? LV_TEAL : c;
              return (
                <div key={label}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
                    <span style={{ fontFamily: lvSans, fontSize: 13, color: hexA(LV_INK, 0.85) }}>{label}</span>
                    <span style={{ fontFamily: lvMono, fontSize: 11, color: hexA(LV_INK, 0.5) }}>{Math.round(val * 100)}</span>
                  </div>
                  <div style={{ height: 7, borderRadius: 4, background: hexA(LV_INK, 0.08), overflow: "hidden", position: "relative" }}>
                    <div style={{ height: "100%", width: `${val * 100}%`, background: `linear-gradient(90deg, ${hexA(col, 0.5)}, ${col})`, borderRadius: 4 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* signature numbers as elevation markers */}
        <div style={{ marginTop: 28, display: "flex", gap: 9 }}>
          {d.lifts.map(([label, val]) => (
            <div key={label} style={{ flex: 1, background: hexA(LV_INK, 0.04), border: `1px solid ${hexA(LV_INK, 0.08)}`, borderRadius: 13, padding: "14px 8px", textAlign: "center" }}>
              <div style={{ fontFamily: lvSerif, fontSize: 24, letterSpacing: "-0.02em" }}>{val}</div>
              <div style={{ fontFamily: lvMono, fontSize: 8.5, letterSpacing: "0.1em", textTransform: "uppercase", color: hexA(LV_INK, 0.5), marginTop: 5 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* relation */}
        <div style={{ marginTop: 24, background: hexA(LV_INK, 0.04), border: `1px solid ${hexA(LV_INK, 0.08)}`, borderRadius: 16, padding: 16 }}>
          <LvKicker style={{ marginBottom: 12 }}>{d.relation.kicker}</LvKicker>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{ width: 42, height: 42, borderRadius: 999, flex: "none", background: `linear-gradient(150deg, hsl(${d.relation.hue} 40% 34%), hsl(${d.relation.hue} 36% 20%))`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: lvSerif, fontSize: 16 }}>{d.relation.initials}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: lvSans, fontSize: 14, fontWeight: 500 }}>{d.relation.name}</div>
              <div style={{ fontFamily: lvSans, fontSize: 12.5, color: hexA(LV_INK, 0.6), lineHeight: 1.4, marginTop: 3 }}>{d.relation.note}</div>
            </div>
          </div>
        </div>

        {owner && <div style={{ marginTop: 18, textAlign: "center", fontFamily: lvMono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: hexA(LV_INK, 0.4) }}>Drag the ridge to re-survey your terrain</div>}

        <TerrainFeed d={d} owner={owner} />
        {d.role !== "client" && <LvCoachBlocks d={d} light={false} owner={owner} />}
      </div>

      {locked && <LvLockedVeil d={d} privacy={persona === "client" ? "private" : "circle"} />}
      {!locked && <LvDock d={d} owner={owner} privacy={privacy} onPrivacy={cyclePriv} onMsg={() => {}} />}
    </LvScreen>
  );
}
