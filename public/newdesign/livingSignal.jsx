// ═══════════════════════════════════════════════════════════════
// DIRECTION A · SIGNAL
// Thesis: your profile is a living instrument — concentric discipline
// rings breathe, a cardiac trace runs your week, the core pulses your
// momentum. The body is the dial, not a card.
// Depends on livingShared.jsx.
// ═══════════════════════════════════════════════════════════════

// Sigil animations (matches the mobile app): the live blip orbits the core, the
// core pulses, the discipline rings breathe. Injected once.
if (typeof document !== "undefined" && !document.getElementById("lv-signal-anim")) {
  const lvSt = document.createElement("style");
  lvSt.id = "lv-signal-anim";
  lvSt.textContent =
    "@keyframes sgOrbit{to{transform:rotate(360deg)}}" +
    ".sg-orbit{animation:sgOrbit 7s linear infinite}" +
    "@keyframes sgCore{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.72;transform:scale(.92)}}" +
    ".sg-core{animation:sgCore 3s ease-in-out infinite}" +
    "@keyframes sgRing{0%,100%{opacity:1}50%{opacity:.62}}" +
    ".sg-ring{animation:sgRing 4s ease-in-out infinite}" +
    "@media (prefers-reduced-motion:reduce){.sg-orbit,.sg-core,.sg-ring{animation:none!important}}";
  document.head.appendChild(lvSt);
}

// Breathing generative sigil: discipline arcs + cardiac sweep + core.
function SignalSigil({ d, size = 250, reduced, goalPct }) {
  const c = tierOf(d).color;
  const cx = size / 2, R = size / 2;
  const ringR = [0.92, 0.74, 0.57, 0.4];
  // cardiac trace from week data, mapped around a circle
  const wk = d.week, n = wk.length;
  const traceR = 0.83;
  const pts = wk.map((v, i) => {
    const a = (-90 + (i / n) * 360) * Math.PI / 180;
    const rr = R * (traceR - 0.08 + (v / 100) * 0.14);
    return [cx + rr * Math.cos(a), cx + rr * Math.sin(a)];
  });
  const tracePath = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ") + " Z";

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" style={{ display: "block" }}>
      <defs>
        <radialGradient id="sgCore" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={LV_TEALB} /><stop offset="55%" stopColor={c} /><stop offset="100%" stopColor={hexA(c, 0)} />
        </radialGradient>
        <filter id="sgGlow"><feGaussianBlur stdDeviation="3.2" /></filter>
      </defs>

      {/* tick ring */}
      {Array.from({ length: 60 }).map((_, i) => {
        const a = (i / 60) * Math.PI * 2;
        const r0 = R * 0.97, r1 = R * (i % 5 === 0 ? 0.9 : 0.94);
        return <line key={i} x1={cx + r0 * Math.cos(a)} y1={cx + r0 * Math.sin(a)} x2={cx + r1 * Math.cos(a)} y2={cx + r1 * Math.sin(a)} stroke={hexA(LV_INK, i % 5 === 0 ? 0.32 : 0.14)} strokeWidth={i % 5 === 0 ? 1.4 : 0.8} />;
      })}

      {/* goal-progress ring (members only) — a teal gauge toward target */}
      {goalPct != null && (() => {
        const rr = R * 0.885, sweep = goalPct * 360, a0 = -90 * Math.PI / 180, a1 = (-90 + sweep) * Math.PI / 180, large = sweep > 180 ? 1 : 0;
        return (
          <g>
            <circle cx={cx} cy={cx} r={rr} fill="none" stroke={hexA(LV_TEAL, 0.12)} strokeWidth={2.5} />
            <path d={`M ${cx + rr * Math.cos(a0)} ${cx + rr * Math.sin(a0)} A ${rr} ${rr} 0 ${large} 1 ${cx + rr * Math.cos(a1)} ${cx + rr * Math.sin(a1)}`} fill="none" stroke={LV_TEAL} strokeWidth={2.5} strokeLinecap="round" />
            <circle cx={cx + rr * Math.cos(a1)} cy={cx + rr * Math.sin(a1)} r={3.4} fill={LV_TEALB} />
          </g>
        );
      })()}

      {/* discipline arcs — each ring = one discipline, sweep = mastery */}
      {d.disciplines.map(([label, val], i) => {
        const rad = R * ringR[i + 1] || R * 0.4;
        const rr = R * (0.74 - i * 0.135);
        const sweep = val * 320;
        const a0 = -90 * Math.PI / 180;
        const a1 = (-90 + sweep) * Math.PI / 180;
        const large = sweep > 180 ? 1 : 0;
        const col = i === 0 ? c : i === d.disciplines.length - 1 ? LV_TEAL : hexA(c, 0.7);
        return (
          <g key={label} className={reduced ? "" : "sg-ring"} style={{ transformOrigin: `${cx}px ${cx}px`, animationDelay: `${i * 0.5}s` }}>
            <circle cx={cx} cy={cx} r={rr} fill="none" stroke={hexA(LV_INK, 0.07)} strokeWidth={5} />
            <path d={`M ${cx + rr * Math.cos(a0)} ${cx + rr * Math.sin(a0)} A ${rr} ${rr} 0 ${large} 1 ${cx + rr * Math.cos(a1)} ${cx + rr * Math.sin(a1)}`}
              fill="none" stroke={col} strokeWidth={5} strokeLinecap="round" />
          </g>
        );
      })}

      {/* cardiac trace — the week, as a closed waveform */}
      <path d={tracePath} fill="none" stroke={LV_TEAL} strokeWidth={1.6} opacity={0.85} filter="url(#sgGlow)" />
      <path d={tracePath} fill="none" stroke={LV_TEALB} strokeWidth={1} opacity={0.9} />

      {/* core */}
      <circle cx={cx} cy={cx} r={R * 0.2} fill="url(#sgCore)" className={reduced ? "" : "sg-core"} style={{ transformOrigin: `${cx}px ${cx}px` }} />
      <circle cx={cx} cy={cx} r={R * 0.085} fill="#fff" opacity={0.95} />

      {/* orbiting live blip */}
      {!reduced && (
        <g className="sg-orbit" style={{ transformOrigin: `${cx}px ${cx}px` }}>
          <circle cx={cx} cy={cx - R * 0.83} r={3.2} fill={LV_TEALB} />
          <circle cx={cx} cy={cx - R * 0.83} r={7} fill={LV_TEAL} opacity={0.3} />
        </g>
      )}
    </svg>
  );
}

// Transmissions feed — entries strung on a vertical signal line.
function SignalFeed({ d, owner }) {
  const c = tierOf(d).color;
  const [vis, cycle] = useLvFeed(d.feed);
  const shown = d.feed.map((it, i) => ({ it, i })).filter(({ i }) => lvFeedVisible(vis[i], owner));
  const hidden = d.feed.length - shown.length;
  return (
    <div style={{ marginTop: 30 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <LvKicker>{d.feedLabel}</LvKicker>
        {owner && <span style={{ fontFamily: lvMono, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: hexA(LV_INK, 0.4) }}>＋ Post</span>}
      </div>
      <div style={{ position: "relative", paddingLeft: 22 }}>
        {/* the signal line */}
        <div style={{ position: "absolute", left: 4, top: 4, bottom: 8, width: 1.5, background: `linear-gradient(180deg, ${hexA(c, 0.5)}, ${hexA(c, 0.05)})` }} />
        {shown.map(({ it, i }, k) => (
          <div key={i} style={{ position: "relative", marginBottom: 12 }}>
            {/* node */}
            <div style={{ position: "absolute", left: -22, top: 16, width: 9, height: 9, borderRadius: 999, background: it.k === "pr" ? LV_TEAL : c, boxShadow: `0 0 0 3px ${hexA(LV_BG, 1)}, 0 0 10px ${hexA(it.k === "pr" ? LV_TEAL : c, 0.6)}` }} />
            <div style={{ background: hexA(LV_INK, 0.04), border: `1px solid ${hexA(LV_INK, 0.08)}`, borderRadius: 14, padding: "13px 15px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: lvMono, fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: c, background: hexA(c, 0.12), padding: "3px 7px", borderRadius: 5 }}>{LV_FEED[it.k]}</span>
                {owner && <LvVisPill vis={vis[i]} onCycle={() => cycle(i)} />}
                <span style={{ marginLeft: "auto", fontFamily: lvMono, fontSize: 10, color: hexA(LV_INK, 0.4) }}>{it.time}</span>
              </div>
              <div className="lv-fade-in" style={{ fontFamily: lvSerif, fontSize: 18, letterSpacing: "-0.01em", lineHeight: 1.15, marginTop: 9 }}>{it.t}</div>
              <p style={{ fontFamily: lvSans, fontSize: 13, lineHeight: 1.5, color: hexA(LV_INK, 0.72), margin: "6px 0 0" }}>{it.b}</p>
              {it.metric && (
                <div style={{ display: "inline-flex", alignItems: "baseline", gap: 7, marginTop: 11, padding: "6px 11px", borderRadius: 9, background: hexA(c, 0.1), border: `1px solid ${hexA(c, 0.22)}` }}>
                  <span style={{ fontFamily: lvMono, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: hexA(LV_INK, 0.6) }}>{it.metric[0]}</span>
                  <span style={{ fontFamily: lvSerif, fontSize: 17, letterSpacing: "-0.02em", color: it.k === "pr" ? LV_TEAL : LV_INK }}>{it.metric[1]}</span>
                </div>
              )}
            </div>
          </div>
        ))}
        {!owner && hidden > 0 && (
          <div style={{ fontFamily: lvMono, fontSize: 10, letterSpacing: "0.06em", color: hexA(LV_INK, 0.38), paddingLeft: 2, marginTop: 2 }}>↯ {hidden} private {hidden === 1 ? "transmission" : "transmissions"} hidden</div>
        )}
      </div>
    </div>
  );
}

function SignalProfile({ persona = "client", variant = "public" }) {
  const d = LV_PEOPLE[persona];
  const c = tierOf(d).color;
  const reduced = useReducedMotion();
  const owner = variant === "own";
  const [ref, show, onScroll] = useLvScroll(220);
  const [privacy, setPrivacy] = React.useState(owner ? "public" : "public");
  const locked = variant === "locked";
  const cyclePriv = () => setPrivacy(p => LV_PRIV_ORDER[(LV_PRIV_ORDER.indexOf(p) + 1) % 3]);

  return (
    <LvScreen d={d} contentRef={ref} onScroll={onScroll}>
      <LvStickyBar d={d} show={show && !locked} onMsg={() => {}} />

      <div style={{ padding: "64px 22px 172px", position: "relative" }}>
        {d.role === "client" ? (
          <ClientSignalHero d={d} owner={owner} locked={locked} reduced={reduced} />
        ) : (
         <React.Fragment>
        {/* header line */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <LvKicker c={c}>{tierOf(d).name}</LvKicker>
          <LvKicker>NO. {d.member}</LvKicker>
        </div>

        {/* the instrument — your face is the core the disciplines orbit */}
        <div style={{ position: "relative", display: "flex", justifyContent: "center", marginTop: 18 }}>
          <SignalSigil d={d} size={250} reduced={reduced} goalPct={null} />
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)" }}>
            <LvPortrait d={d} size={86} editable={owner} hide={locked} />
          </div>
        </div>

        {/* name block */}
        <div style={{ textAlign: "center", marginTop: 14 }}>
          <h1 style={{ fontFamily: lvSerif, fontSize: 38, fontWeight: 400, letterSpacing: "-0.03em", margin: 0, lineHeight: 0.98 }}>{d.name}</h1>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 8, fontFamily: lvMono, fontSize: 11, color: hexA(LV_INK, 0.55), flexWrap: "wrap" }}>
            <span>{d.handle}</span><span style={{ opacity: 0.4 }}>·</span><span>{d.pronouns}</span><span style={{ opacity: 0.4 }}>·</span><span>{d.city}</span>
          </div>
          <div style={{ marginTop: 9 }}><span style={{ fontFamily: lvMono, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: c }}>{d.roleLabel}</span></div>
        </div>

        {/* hero stat: Shape Score + member since + link */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 20, background: hexA(LV_INK, 0.04), border: `1px solid ${hexA(LV_INK, 0.08)}`, borderRadius: 16, padding: "14px 16px" }}>
          <div style={{ flex: "none" }}>
            <div style={{ fontFamily: lvSerif, fontSize: 34, letterSpacing: "-0.03em", lineHeight: 0.9 }}>{d.score.toLocaleString()}</div>
            <div style={{ fontFamily: lvMono, fontSize: 8.5, letterSpacing: "0.14em", textTransform: "uppercase", color: hexA(LV_INK, 0.5), marginTop: 4 }}>Shape Score</div>
          </div>
          <div style={{ width: 1, height: 34, background: hexA(LV_INK, 0.12) }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: lvMono, fontSize: 11, color: LV_TEAL }}>▲ {d.scoreWk} this week</div>
            <div style={{ fontFamily: lvSans, fontSize: 11.5, color: hexA(LV_INK, 0.55), marginTop: 4 }}>{d.sinceLabel} {d.since}</div>
          </div>
          <a href="#" style={{ fontFamily: lvMono, fontSize: 10, letterSpacing: "0.06em", color: c, border: `1px solid ${hexA(c, 0.35)}`, borderRadius: 999, padding: "6px 10px", whiteSpace: "nowrap", flex: "none" }}>{d.link[0]} ↗</a>
        </div>

        {/* goal headline */}
        <div style={{ textAlign: "center", marginTop: 24, padding: "0 6px" }}>
          <LvKicker style={{ marginBottom: 8 }}>{d.goalKicker}</LvKicker>
          <div style={{ fontFamily: lvSerif, fontSize: 24, fontStyle: "italic", fontWeight: 400, letterSpacing: "-0.01em", lineHeight: 1.15, color: hexA(LV_INK, 0.92) }}>“{d.goal}”</div>
        </div>
         </React.Fragment>
        )}

        {/* living signals: streak · weekly momentum · trajectory */}
        <div style={{ marginTop: 24 }}>
          <LvKicker style={{ marginBottom: 12 }}>Living signals</LvKicker>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
            <div style={{ background: hexA(c, 0.08), border: `1px solid ${hexA(c, 0.2)}`, borderRadius: 14, padding: "13px 14px" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontFamily: lvSerif, fontSize: 30, letterSpacing: "-0.02em", lineHeight: 1 }}>{d.streak}</span>
                <span style={{ fontFamily: lvMono, fontSize: 11, color: LV_TEAL }}>△ days</span>
              </div>
              <div style={{ fontFamily: lvMono, fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: hexA(LV_INK, 0.5), marginTop: 7 }}>Current streak</div>
            </div>
            <div style={{ background: hexA(LV_INK, 0.04), border: `1px solid ${hexA(LV_INK, 0.08)}`, borderRadius: 14, padding: "13px 14px" }}>
              <LvWeekBars d={d} height={30} />
              <div style={{ fontFamily: lvMono, fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: hexA(LV_INK, 0.5), marginTop: 7 }}>Weekly momentum</div>
            </div>
            <div style={{ gridColumn: "1 / -1", background: hexA(LV_INK, 0.04), border: `1px solid ${hexA(LV_INK, 0.08)}`, borderRadius: 14, padding: "13px 14px", display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ flex: "none" }}>
                <div style={{ fontFamily: lvSerif, fontSize: 22, letterSpacing: "-0.02em", color: LV_TEAL }}>{d.trajDelta}</div>
                <div style={{ fontFamily: lvMono, fontSize: 8.5, letterSpacing: "0.1em", textTransform: "uppercase", color: hexA(LV_INK, 0.5), marginTop: 5 }}>{d.trajLabel}</div>
              </div>
              <div style={{ flex: 1 }}><LvSparkline data={d.traj} color={c} w={150} h={36} /></div>
              <div style={{ fontFamily: lvSans, fontSize: 11, color: hexA(LV_INK, 0.5), flex: "none" }}>{d.trajNote}</div>
            </div>
          </div>
        </div>

        {/* recent PR highlight */}
        <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12, background: hexA(LV_INK, 0.04), border: `1px solid ${hexA(LV_INK, 0.08)}`, borderRadius: 14, padding: "12px 16px" }}>
          <span style={{ fontFamily: lvMono, fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: c, flex: "none" }}>PR</span>
          <span style={{ fontFamily: lvSans, fontSize: 13.5, color: hexA(LV_INK, 0.85) }}>{d.prRecent[0]}</span>
          <span style={{ fontFamily: lvSerif, fontSize: 18, letterSpacing: "-0.02em", marginLeft: "auto" }}>{d.prRecent[1]}</span>
          <span style={{ fontFamily: lvMono, fontSize: 10, color: LV_TEAL, flex: "none" }}>{d.prRecent[2]}</span>
        </div>

        {/* discipline legend */}
        <div style={{ marginTop: 28 }}>
          <LvKicker style={{ marginBottom: 12 }}>{d.discLabel}</LvKicker>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
            {d.disciplines.map(([label, val], i) => {
              const col = i === 0 ? c : i === d.disciplines.length - 1 ? LV_TEAL : hexA(c, 0.8);
              return (
                <div key={label} style={{ background: hexA(LV_INK, 0.035), border: `1px solid ${hexA(LV_INK, 0.08)}`, borderRadius: 13, padding: "12px 13px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: col }} />
                    <span style={{ fontFamily: lvSans, fontSize: 12.5, color: hexA(LV_INK, 0.82) }}>{label}</span>
                  </div>
                  <div style={{ fontFamily: lvSerif, fontSize: 22, letterSpacing: "-0.02em", marginTop: 6 }}>{Math.round(val * 100)}<span style={{ fontSize: 12, color: hexA(LV_INK, 0.4) }}>/100</span></div>
                  <div style={{ height: 3, borderRadius: 2, background: hexA(LV_INK, 0.1), marginTop: 8, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${val * 100}%`, background: col, borderRadius: 2 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* signature numbers */}
        <div style={{ marginTop: 24 }}>
          <LvKicker style={{ marginBottom: 12 }}>{d.liftsLabel}</LvKicker>
          <div style={{ display: "flex", gap: 9 }}>
            {d.lifts.map(([label, val]) => (
              <div key={label} style={{ flex: 1, textAlign: "center", background: hexA(c, 0.08), border: `1px solid ${hexA(c, 0.2)}`, borderRadius: 13, padding: "14px 6px" }}>
                <div style={{ fontFamily: lvSerif, fontSize: 25, letterSpacing: "-0.02em" }}>{val}</div>
                <div style={{ fontFamily: lvMono, fontSize: 8.5, letterSpacing: "0.1em", textTransform: "uppercase", color: hexA(LV_INK, 0.5), marginTop: 5 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* relation card */}
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

        {owner && (
          <div style={{ marginTop: 18, textAlign: "center", fontFamily: lvMono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: hexA(LV_INK, 0.4) }}>
            Tap any ring to recompose your sigil
          </div>
        )}

        <SignalFeed d={d} owner={owner} />
        {d.role !== "client" && <LvCoachBlocks d={d} light={false} owner={owner} />}
      </div>

      {locked && <LvLockedVeil d={d} privacy={persona === "client" ? "private" : "circle"} />}
      {!locked && <LvDock d={d} owner={owner} privacy={privacy} onPrivacy={cyclePriv} onMsg={() => {}} />}
    </LvScreen>
  );
}
