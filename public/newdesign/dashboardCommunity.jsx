// Shared dashboard Community page used by client, trainer, and nutritionist
// dashboards. Each role's *Community.html shell loads this and renders
// <CommunityPage navItems={...} payoutCard={...} chatTabs={...} /> so the
// feed, channels, meetups, "My posts" filter, and "New post" composer stay
// identical across roles. Only the sidebar nav and (optional) chat widget
// vary per role.

// THE APPOINTMENTS stamps (spec 2026-07-13) — the six canonical tokens,
// mirroring the mobile composer; unknown values normalize to 'milestone'.
// KEEP IN SYNC with the SQL allowlist in award_work_milestone
// (supabase-migrations/2026-07-13-work-milestone-points.sql) and
// BS_MILESTONE_STAMPS in mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx.
const DC_MILESTONE_STAMPS = ["promoted", "shipped", "certified", "new_role", "launched", "milestone"];

// ── Session-details graphs (website parity with the mobile app) ─────────────
// Strava-style axis-labeled area charts driven by a post's REAL device metrics
// (community_posts.metrics: hrTrace/paceTrace/cadenceTrace/elevTrace/powerTrace
// + zoneDurations + workoutStats). Same GRAPH-TYPE RULE as the app: Pace for
// run/walk/hike, Pace/100m for swim, Speed for ride; Power its own chart;
// HR+zones/Cadence/Elevation/Splits whenever the series exists.
function fmtPaceSec(s) { const m = Math.floor(s / 60), ss = Math.round(s % 60); return m + ":" + String(ss).padStart(2, "0"); }
function sessArr(v) { return (Array.isArray(v) && v.length > 1) ? v : null; }
function buildZonesFromDurations(m) {
  const zd = (m && (m.zoneDurations || m.zone_durations)) || null;
  if (zd && typeof zd === "object") {
    const keys = ["zone_one_milli", "zone_two_milli", "zone_three_milli", "zone_four_milli", "zone_five_milli"];
    const vals = keys.map(k => Number(zd[k]) || 0);
    const total = vals.reduce((s, v) => s + v, 0);
    if (total > 0) return vals.map((v, i) => ["Z" + (i + 1), Math.round((v / total) * 100)]);
  }
  return null;
}

function WebAreaChart({ vals, color, invert, fmt, distanceMi, height }) {
  if (!Array.isArray(vals) || vals.length < 2) return null;
  const H = height || 110;
  const lo = Math.min(...vals), hi = Math.max(...vals), rng = (hi - lo) || 1, W = 100, top = 5, bot = 95, span = bot - top;
  const yOf = (v) => invert ? (top + ((v - lo) / rng) * span) : (bot - ((v - lo) / rng) * span);
  const line = vals.map((v, i) => (i ? "L" : "M") + ((i / (vals.length - 1)) * W).toFixed(2) + " " + yOf(v).toFixed(2)).join(" ");
  const gid = "wac-" + Math.random().toString(36).slice(2, 8);
  const fmtv = fmt || ((v) => "" + Math.round(v));
  const yT = [{ y: top, v: invert ? lo : hi }, { y: (top + bot) / 2, v: (lo + hi) / 2 }, { y: bot, v: invert ? hi : lo }];
  const step = (distanceMi && distanceMi > 0) ? Math.max(1, Math.round(distanceMi / 5)) : 0;
  const xT = [];
  if (step) for (let mm = step; mm < distanceMi - 0.15; mm += step) xT.push(mm);
  const mono = "'JetBrains Mono', monospace";
  return (
    <div style={{ paddingLeft: 36 }}>
      <div style={{ position: "relative" }}>
        {yT.map((tk, i) => <span key={i} style={{ position: "absolute", left: -36, width: 32, textAlign: "right", top: "calc(" + tk.y + "% - 6px)", fontFamily: mono, fontSize: 9, fontWeight: 600, color: "rgba(242,237,228,0.5)" }}>{fmtv(tk.v)}</span>)}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: "100%", height: H, display: "block" }} aria-hidden>
          <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.34" /><stop offset="100%" stopColor={color} stopOpacity="0.03" /></linearGradient></defs>
          {yT.map((tk, i) => <line key={i} x1="0" y1={tk.y} x2={W} y2={tk.y} stroke="rgba(242,237,228,0.08)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />)}
          {xT.map((mm, i) => { const xp = (mm / distanceMi) * 100; return <line key={i} x1={xp} y1="0" x2={xp} y2="100" stroke="rgba(242,237,228,0.05)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />; })}
          <path d={line + " L" + W + " 100 L0 100 Z"} fill={"url(#" + gid + ")"} />
          <path d={line} fill="none" stroke={color} strokeWidth="1.4" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      </div>
      {xT.length > 0 && <div style={{ position: "relative", height: 14, marginTop: 4 }}>{xT.map((mm, i) => { const xp = (mm / distanceMi) * 100; return <span key={i} style={{ position: "absolute", left: xp + "%", top: 0, transform: "translateX(-50%)", fontFamily: mono, fontSize: 8.5, fontWeight: 600, color: "rgba(242,237,228,0.5)" }}>{mm} mi</span>; })}</div>}
    </div>
  );
}

function SessionDetailsModal({ p, onClose, onShareImage }) {
  const mono = "'JetBrains Mono', monospace";
  const s = p.session || {};
  const m = s.metrics || {};
  const allStats = Array.isArray(s.stats) ? s.stats : [];
  const trace = sessArr(m.hrTrace), paceTrace = sessArr(m.paceTrace), cadenceTrace = sessArr(m.cadenceTrace), elevTrace = sessArr(m.elevTrace), powerTrace = sessArr(m.powerTrace);
  const zones = Array.isArray(s.zones) ? s.zones : buildZonesFromDurations(m);
  const breakdown = s.breakdown || null;
  // GRAPH-TYPE RULE — sport-specific primary velocity chart.
  const sport = String(s.sport || "").toLowerCase();
  const isRide = /ride|bike|cycl|spin|watt|peloton/.test(sport);
  const isSwim = /swim/.test(sport);
  const typeLabel = s.typeLabel || (isRide ? "Ride" : isSwim ? "Swim" : /run/.test(sport) ? "Run" : "Workout");
  const paceCfg = isRide
    ? { label: "Speed", invert: false, fmt: (v) => "" + Number(v).toFixed(1), chip: "Top", chipRe: /max.*speed|top.*speed/i }
    : { label: "Pace", invert: true, fmt: fmtPaceSec, chip: "Fastest", chipRe: null };
  // categorize stats (hero + summary + output), promote Avg HR + Calories into summary.
  const heroStat = allStats[0] || null;
  const heroKey = heroStat ? String(heroStat[0]).toLowerCase() : null;
  const rest = allStats.filter((st) => String(st[0]).toLowerCase() !== heroKey);
  const paceRe = /pace|speed/i, bestPaceRe = /best|fastest|max.*(pace|speed)/i, cadRe = /cadence/i, elevRe = /elev|ascent|altitude|climb/i;
  const bestPaceStat = rest.find((st) => paceRe.test(st[0]) && bestPaceRe.test(st[0])) || null;
  const cadStat = rest.find((st) => cadRe.test(st[0])) || null;
  const elevStat = rest.find((st) => elevRe.test(st[0])) || null;
  const paceChipStat = paceCfg.chipRe ? rest.find((st) => paceCfg.chipRe.test(st[0])) : bestPaceStat;
  // Top Summary holds EVERY scalar that doesn't have its own chart — no orphan
  // bottom grid. Excluded only: cadence/elevation when charted (chart's chip) +
  // best-pace/top-speed (the primary velocity chart's chip).
  const isChartedScalar = (k) => (cadenceTrace && cadRe.test(k)) || (elevTrace && elevRe.test(k));
  const summaryStats = rest.filter((st) => st !== bestPaceStat && !isChartedScalar(st[0]));
  const outputStats = [];
  const sumCols = summaryStats.length <= 3 ? (summaryStats.length || 1) : 2;
  const distStat = (heroStat && /dist/i.test(heroStat[0])) ? heroStat : allStats.find((st) => /dist/i.test(st[0]));
  const distanceMi = (distStat && /mi/i.test(String(distStat[1]))) ? (parseFloat(String(distStat[1]).replace(/[^\d.]/g, "")) || null) : null;
  const ZC = ["#5b8def", "#34d6c5", "#d8b25a", "#e8843c", "#e0463c"];
  const Eyebrow = ({ children, chip }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "24px 0 12px" }}>
      <span style={{ width: 15, height: 1.5, background: TEAL_BRIGHT, borderRadius: 2 }} />
      <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: TEAL_BRIGHT }}>{children}</span>
      {chip && <span style={{ marginLeft: "auto" }}>{chip}</span>}
    </div>
  );
  const accentChip = (txt) => <span style={{ fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", color: TEAL_BRIGHT, background: "rgba(46,224,196,0.1)", border: "1px solid rgba(46,224,196,0.34)", borderRadius: 999, padding: "2px 8px" }}>{txt}</span>;
  const greyChip = (txt) => <span style={{ fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.04em", color: "rgba(242,237,228,0.6)", background: "rgba(242,237,228,0.06)", borderRadius: 999, padding: "2px 8px" }}>{txt}</span>;
  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{ position: "fixed", inset: 0, zIndex: 120, background: "rgba(0,0,0,0.66)", backdropFilter: "blur(6px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "6vh 16px", overflowY: "auto" }}>
      <div style={{ width: "100%", maxWidth: 560, background: "#16130f", border: "1px solid rgba(242,237,228,0.12)", borderRadius: 16, padding: "20px 24px 30px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontFamily: mono, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(242,237,228,0.55)" }}>Session details</span>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* Share (own posts only — the caller gates): the Session details
                surface is a named share entry point, twinning the mobile
                detail page (web-parity spec 2026-07-13). */}
            {onShareImage && (
              <button type="button" onClick={onShareImage} aria-label="Share" style={{ background: "transparent", border: 0, color: "rgba(242,237,228,0.55)", cursor: "pointer", fontFamily: mono, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", lineHeight: 1, padding: 2 }}>Share ↗</button>
            )}
            <button onClick={onClose} aria-label="Close" style={{ background: "transparent", border: 0, color: "rgba(242,237,228,0.5)", cursor: "pointer", fontSize: 15, lineHeight: 1, padding: 2 }}>✕</button>
          </div>
        </div>
        <div style={{ fontFamily: serif, fontSize: 25, letterSpacing: "-0.015em", color: INK, marginTop: 10 }}>{s.title || "Activity"}</div>
        <div style={{ fontFamily: mono, fontSize: 10.5, color: "rgba(242,237,228,0.55)", marginTop: 5 }}>{p.who} · {typeLabel}</div>
        {heroStat && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontFamily: serif, fontSize: 42, fontWeight: 600, color: INK, lineHeight: 1, letterSpacing: "-0.02em" }}>{heroStat[1]}</div>
            <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(242,237,228,0.5)", marginTop: 6 }}>{heroStat[0]}</div>
          </div>
        )}
        {summaryStats.length > 0 && (<>
          <Eyebrow>Summary</Eyebrow>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(" + sumCols + ", 1fr)", columnGap: 16, rowGap: 16 }}>
            {summaryStats.map((st, i) => (
              <div key={i}>
                <div style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(242,237,228,0.45)" }}>{st[0]}</div>
                <div style={{ fontFamily: serif, fontSize: 23, fontWeight: 600, color: INK, marginTop: 4 }}>{st[1]}</div>
              </div>
            ))}
          </div>
        </>)}
        {paceTrace && (<>
          <Eyebrow chip={paceChipStat ? accentChip(paceCfg.chip + " " + paceChipStat[1]) : null}>{paceCfg.label}</Eyebrow>
          <WebAreaChart vals={paceTrace} color={TEAL_BRIGHT} invert={paceCfg.invert} fmt={paceCfg.fmt} distanceMi={distanceMi} height={116} />
        </>)}
        {powerTrace && (<>
          <Eyebrow>Power</Eyebrow>
          <WebAreaChart vals={powerTrace} color="#d8b25a" fmt={(v) => "" + Math.round(v)} distanceMi={distanceMi} height={96} />
        </>)}
        {(trace || (zones && zones.length > 0)) && (<>
          <Eyebrow>Heart rate</Eyebrow>
          {trace && <WebAreaChart vals={trace} color={TEAL_BRIGHT} fmt={(v) => "" + Math.round(v)} distanceMi={distanceMi} height={116} />}
          {zones && zones.length > 0 && (
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 9 }}>
              {zones.map((z, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: ZC[i % 5] }} />
                  <span style={{ width: 18, fontFamily: mono, fontSize: 9, fontWeight: 700, color: INK }}>{z[0]}</span>
                  <div style={{ flex: 1, height: 9, borderRadius: 999, background: "rgba(242,237,228,0.07)", overflow: "hidden" }}><div style={{ width: Math.max(z[1], 1.5) + "%", height: "100%", borderRadius: 999, background: ZC[i % 5] }} /></div>
                  <span style={{ width: 32, textAlign: "right", fontFamily: mono, fontSize: 9.5, fontWeight: 700, color: z[1] >= 30 ? INK : "rgba(242,237,228,0.55)" }}>{z[1]}%</span>
                </div>
              ))}
            </div>
          )}
        </>)}
        {breakdown && Array.isArray(breakdown.rows) && breakdown.rows.length > 0 && (() => {
          const rows = breakdown.rows;
          const paceVals = rows.map((r) => { const mm = String(r[1]).match(/(\d+):(\d+)/); return mm ? (+mm[1]) * 60 + (+mm[2]) : null; });
          const isPace = paceVals.every((v) => v != null);
          let perf;
          if (isPace) { const mx = Math.max(...paceVals); perf = paceVals.map((v) => mx - v + mx * 0.18); }
          else { perf = rows.map((r) => { const mm = String(r[1]).match(/[\d.]+/); return mm ? +mm[0] : 0; }); }
          const pmax = Math.max(...perf, 1);
          const bestIdx = isPace ? paceVals.indexOf(Math.min(...paceVals)) : perf.indexOf(Math.max(...perf));
          return (<>
            <Eyebrow chip={bestPaceStat ? accentChip("Best " + bestPaceStat[1]) : null}>{breakdown.label || "Splits"}</Eyebrow>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 132 }}>
              {rows.map((r, i) => { const barH = 24 + (perf[i] / pmax) * 88; const best = i === bestIdx && rows.length > 1; return (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                  <span style={{ fontFamily: serif, fontSize: 15, fontWeight: 600, color: best ? TEAL_BRIGHT : INK, marginBottom: 6, whiteSpace: "nowrap" }}>{r[1]}</span>
                  <div style={{ width: "100%", maxWidth: 52, height: barH, borderRadius: "7px 7px 2px 2px", background: best ? TEAL : "rgba(46,224,196,0.24)", boxShadow: best ? "0 0 0 1px " + TEAL : "none" }} />
                </div>); })}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 9 }}>
              {rows.map((r, i) => (
                <div key={i} style={{ flex: 1, textAlign: "center", minWidth: 0 }}>
                  <div style={{ fontFamily: mono, fontSize: 9, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(242,237,228,0.55)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r[0]}</div>
                  {r[2] && <div style={{ fontFamily: mono, fontSize: 8.5, fontWeight: 600, textTransform: "uppercase", color: i === bestIdx ? TEAL_BRIGHT : "rgba(242,237,228,0.4)", marginTop: 3 }}>{r[2]}</div>}
                </div>
              ))}
            </div>
          </>);
        })()}
        {cadenceTrace && (<>
          <Eyebrow chip={cadStat ? greyChip("avg " + cadStat[1]) : null}>Cadence</Eyebrow>
          <WebAreaChart vals={cadenceTrace} color={TEAL_BRIGHT} fmt={(v) => "" + Math.round(v)} distanceMi={distanceMi} height={92} />
        </>)}
        {elevTrace && (<>
          <Eyebrow chip={elevStat ? greyChip("+" + elevStat[1] + " gain") : null}>Elevation</Eyebrow>
          <WebAreaChart vals={elevTrace} color="#8a93a0" fmt={(v) => "" + Math.round(v)} distanceMi={distanceMi} height={96} />
        </>)}
        {outputStats.length > 0 && (<>
          <Eyebrow>Output</Eyebrow>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", columnGap: 16 }}>
            {outputStats.map((st, i) => (
              <div key={i} style={{ padding: "12px 0", borderTop: i >= 3 ? "1px solid rgba(242,237,228,0.08)" : 0 }}>
                <div style={{ fontFamily: mono, fontSize: 8, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(242,237,228,0.42)" }}>{st[0]}</div>
                <div style={{ fontFamily: serif, fontSize: 18, fontWeight: 600, color: INK, marginTop: 4 }}>{st[1]}</div>
              </div>
            ))}
          </div>
        </>)}
      </div>
    </div>
  );
}

function CommunityPage({ navItems, payoutCard, chatTabs }) {
  const ME = { who: "Priya M.", role: "Hypertrophy · 2,140" };
  const [composerOpen, setComposerOpen] = React.useState(false);
  // "+25 · CAREER" confirmation — shown ONLY when award_work_milestone
  // actually granted (spec 2026-07-13; a same-month duplicate shows nothing).
  const [careerToast, setCareerToast] = React.useState(false);
  // The web claim mirrors mobile's ShapeCareerAward: a failed call queues the
  // post id so the page-load catch-up below re-fires it — the +25 can never
  // be permanently lost on either surface (the RPC's monthly dedupe makes
  // retries safe, and it buckets by the post's own date).
  //
  // ⚠ THE QUEUE IS OWNER-SCOPED. It used to hold a bare post id, and the
  // catch-up below replayed it on mount for whoever was signed in — so on a
  // shared device member B's visit submitted member A's post under B's
  // identity, award_work_milestone answered {granted:false,'not_a_milestone'}
  // (a SUCCESSFUL response, not an error), and the removeItem then destroyed
  // A's retry. Keep this in step with shapeBackend.js's readCareerPending /
  // careerAwardIsTerminal — tests/career-award-scope.test.mjs parses BOTH.
  // ⚠ A PER-OWNER COLLECTION, not one tagged slot: with a single slot, member
  // B's failed claim overwrote member A's queued award and A's retry was gone
  // when they came back. Owner-tagging stops the cross-account REPLAY;
  // partitioning is what actually preserves each member's claim.
  // ⚠ ONE localStorage KEY PER CLAIM — `shape.careerAwardPending.<uid>.<postId>`.
  // A single JSON blob was a read-modify-write over storage every same-origin
  // tab shares, so two tabs failing at once each read the same array, each
  // appended, and the second write discarded the first member's retry — during
  // exactly the outage the queue exists to survive. Independent keys mean a
  // write or a clear touches only its own claim. Keep in step with
  // shapeBackend.js; tests/career-award-scope.test.mjs parses BOTH.
  const CAREER_PREFIX = 'shape.careerAwardPending.';
  const careerKey = React.useCallback((uid, pid) => CAREER_PREFIX + String(uid) + '.' + String(pid), []);
  const careerQueueRead = React.useCallback(() => {
    const out = [];
    try {
      // The pre-per-key formats (a bare post id; the single JSON array that
      // never shipped) carry no owner or no race safety. Drop on sight.
      try { if (localStorage.getItem('shape.careerAwardPending')) localStorage.removeItem('shape.careerAwardPending'); } catch (e) {}
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (!k || k.indexOf(CAREER_PREFIX) !== 0) continue;
        // uid and postId are UUIDs (hyphens, never dots) — the first dot splits.
        const rest = k.slice(CAREER_PREFIX.length);
        const dot = rest.indexOf('.');
        if (dot <= 0 || dot === rest.length - 1) continue;
        out.push({ uid: rest.slice(0, dot), postId: rest.slice(dot + 1), at: Number(localStorage.getItem(k)) || 0 });
      }
    } catch (e) {}
    return out;
  }, []);
  // ⚠ Keyed by (uid, POST) — one owner can hold several. The award buckets from
  // the POST'S OWN month, so two claims that failed across a month boundary are
  // two distinct +25s; keying on uid alone would silently drop one.
  const careerPendingRead = React.useCallback((uid) => {
    if (!uid) return [];
    return careerQueueRead().filter(function (r) { return String(r.uid) === String(uid); });
  }, [careerQueueRead]);
  // The cap is the one read-modify-write left, and it only evicts the OLDEST
  // claims past the limit — the cap's documented behaviour, so a concurrent
  // enforcement can at worst repeat that same eviction.
  const careerPendingWrite = React.useCallback((uid, pid) => {
    if (!uid || !pid) return;
    try { localStorage.setItem(careerKey(uid, pid), String(Date.now())); } catch (e) {}
    try {
      const all = careerQueueRead();
      if (all.length <= 20) return;
      all.sort(function (a, b) { return a.at - b.at; });
      all.slice(0, all.length - 20).forEach(function (r) {
        try { localStorage.removeItem(careerKey(r.uid, r.postId)); } catch (e) {}
      });
    } catch (e) {}
  }, [careerKey, careerQueueRead]);
  const careerPendingClear = React.useCallback((uid, pid) => {
    try { localStorage.removeItem(careerKey(uid, pid)); } catch (e) {}
  }, [careerKey]);
  const claimCareerAward = React.useCallback(async (pid, showToast, uid) => {
    const sb = window.shapeDb && window.shapeDb.client;
    if (!pid || !sb || !sb.rpc) return;
    try {
      const { data, error } = await sb.rpc('award_work_milestone', { p_post_id: pid });
      if (error) throw error;
      // Terminal in every case but 'unauthenticated' — see shapeBackend.js.
      if (!(data && data.reason === 'unauthenticated')) careerPendingClear(uid, pid);
      else careerPendingWrite(uid, pid);
      if (showToast && data && data.granted) {
        setCareerToast(true);
        setTimeout(() => setCareerToast(false), 3200);
      }
    } catch (e) {
      careerPendingWrite(uid, pid);
    }
  }, [careerPendingClear, careerPendingWrite]);
  React.useEffect(() => {
    // Open-time catch-up for a claim that failed on a previous visit — only
    // ever for the signed-in member's OWN queued post.
    let cancelled = false;
    (async () => {
      if (!careerQueueRead().length) return; // nothing queued by anyone — skip the user lookup
      let me = null;
      try { me = await (window.shapeDb && window.shapeDb.getUser && window.shapeDb.getUser()); } catch (e) { return; }
      if (cancelled || !me || !me.id) return;
      // Look up OUR OWN entries: another member's queued award stays untouched.
      // Replay every one of ours — an outage across a month boundary leaves two
      // posts that each earn their own +25.
      const pending = careerPendingRead(me.id);
      for (const rec of pending) {
        if (cancelled) return;
        await claimCareerAward(rec.postId, false, me.id);
      }
    })();
    return () => { cancelled = true; };
  }, [claimCareerAward, careerPendingRead, careerQueueRead]);
  const [editingPost, setEditingPost] = React.useState(null);
  const [myPostsOnly, setMyPostsOnly] = React.useState(false);
  const [filter, setFilter] = React.useState("ALL");

  const DEMO_FEED = [
    { kind: "pr", who: "Marcus J.", role: "Tempo · 1,412", time: "8m", lift: "Bench Press", load: "225 lb", delta: "+10 lb", reps: "5 × 5", body: "First time hitting 225 on bench after 8 months. Maya's programming is unreal.", likes: 47, comments: 12, tag: "STRENGTH" },
    { kind: "workout", who: "Elena R.", role: "Peak · 6,108", time: "32m", title: "Lower strength · Block 3", duration: "52 min", exercises: 6, rpe: 8.5, coach: "Maya Okafor", note: "Squats felt locked in today.", likes: 18, comments: 3, tag: "STRENGTH" },
    { kind: "run", who: "Jonah W.", role: "Tempo · 980", time: "1h", distance: "8.4 mi", pace: "7:42 / mi", duration: "1h 04m", elev: "+412 ft", body: "Easy long. Brooklyn Half is Sunday — taper feels good.", likes: 24, comments: 6, tag: "RACING",
      session: { sport: "run", title: "Long run · 8.4 mi",
        stats: [["Distance", "8.4 mi"], ["Avg pace", "7:42/mi"], ["Best pace", "7:18/mi"], ["Time", "1:04:42"], ["Avg HR", "156 bpm"], ["Max HR", "174 bpm"], ["Cadence", "176 spm"], ["Elevation", "412 ft"], ["Calories", "1,020"]],
        zones: [["Z1", 8], ["Z2", 38], ["Z3", 40], ["Z4", 12], ["Z5", 2]],
        metrics: {
          hrTrace: [124, 132, 140, 137, 145, 150, 147, 154, 151, 148, 156, 159, 155, 151, 158, 163, 159, 153, 161, 166, 160, 156, 163, 168, 162, 158, 166, 171, 174, 160],
          paceTrace: [486, 472, 478, 466, 474, 460, 468, 456, 463, 470, 454, 461, 467, 452, 459, 450, 457, 464, 448, 455, 462, 446, 453, 460, 444, 451, 458, 442, 449, 455],
          cadenceTrace: [168, 170, 172, 174, 173, 175, 174, 176, 175, 173, 177, 178, 176, 174, 177, 179, 178, 175, 178, 180, 179, 177, 180, 181, 179, 178, 181, 182, 181, 176],
          elevTrace: [40, 48, 62, 80, 72, 64, 84, 98, 90, 76, 92, 116, 108, 94, 88, 104, 128, 118, 100, 112, 136, 122, 110, 128, 148, 134, 116, 100, 86, 68]
        },
        breakdown: { label: "Mile splits", rows: [["Miles 1–3", "7:52/mi", "Warm-up"], ["Miles 4–6", "7:41/mi", "Steady"], ["Miles 7–8", "7:24/mi", "Negative split"]] } } },
    { kind: "tier", who: "Ana P.", role: "Tempo · 752", time: "2h", from: "Raw", to: "Tempo", earned: 752, body: "Three weeks in. Tempo unlocked — limited drops open up on the store, here we come.", likes: 56, comments: 14, tag: "GENERAL" },
    { kind: "meal", who: "Priya S.", role: "Tempo · 1,284", time: "3h", title: "Sheet-pan salmon, sweet potato & broccoli", kcal: 620, p: 44, c: 58, f: 22, source: "From Rae · cook-along", likes: 12, comments: 2, tag: "NUTRITION" },
    { kind: "streak", who: "Diego R.", role: "Form · 2,540", time: "4h", days: 21, body: "Three weeks straight. Sunday-night protein prep is the unlock.", likes: 41, comments: 9, tag: "GENERAL" },
    { kind: "post", who: "Elena R.", role: "Peak · 6,108", time: "5h", body: "Down 14 lb and running negative splits for the first time ever. Rae's post-run fueling protocol changed everything.", likes: 82, comments: 24, tag: "NUTRITION" },
    { kind: "post", who: "Jonah W.", role: "Tempo · 980", time: "7h", body: "Race day Sunday — Brooklyn Half. Meet by the start corral at 6:45 if you're running. Coffee on me after.", likes: 19, comments: 8, tag: "RACING" },
  ];
  const [feed, setFeed] = React.useState(DEMO_FEED);
  // Community feed viewing lens — UNIVERSAL (everyone's public activity, the
  // default) vs FOLLOWING (accepted follows + you, incl. their followers-tier
  // posts). Persisted per device; the route + RLS enforce visibility.
  const [feedMode, setFeedMode] = React.useState(() => {
    try { return localStorage.getItem('shape.feedMode') === 'following' ? 'following' : 'universal'; } catch (e) { return 'universal'; }
  });
  const switchFeedMode = (m) => { setFeedMode(m); try { localStorage.setItem('shape.feedMode', m); } catch (e) {} };
  const [liveEmpty, setLiveEmpty] = React.useState(false);

  // Hydrate the live posts on top of the demo content. The /api/community/feed
  // endpoint returns rows from community_posts (newest first); we map each row
  // to the local feed shape and prepend so a real post lands above the demos.
  React.useEffect(() => {
    let alive = true;
    const tagFor = (a) => {
      const t = String(a || '').toLowerCase();
      if (t === 'pr' || t === 'strength' || t === 'workout') return 'STRENGTH';
      if (t === 'run' || t === 'race' || t === 'racing') return 'RACING';
      if (t === 'meal' || t === 'nutrition') return 'NUTRITION';
      return 'GENERAL';
    };
    const since = (iso) => {
      const ms = Date.now() - new Date(iso).getTime();
      if (ms < 60_000) return 'now';
      if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
      if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
      return `${Math.floor(ms / 86_400_000)}d`;
    };
    // Filter buckets for a REAL post — `kind` stays 'post' (the renderer
    // contract: the pr/run/workout demo renderers need fields the API omits);
    // the buckets ONLY feed the filter tabs, so a real logged run lands under
    // RUNS instead of just ALL/POSTS. Mirrors the app's bsActivityFromPost
    // cut: only posts with real activity evidence type as activities — the
    // API defaults activity_type to 'workout' even on plain notes, so the
    // type string alone can't be trusted. Non-exclusive like the mobile
    // chips (CodeRabbit): a PR'd run files under BOTH RUNS and PRs.
    const bucketsFor = (p, m) => {
      // Shared meals (spec 2026-07-12) file under NUTRITION only — a meal is
      // not a workout, and it never cross-files.
      if (m.kind === 'meal') return ['meal'];
      // Work milestones (spec 2026-07-13) file under MILESTONES only — a
      // career milestone is not a workout or a training PR.
      if (m.kind === 'milestone') return ['milestone'];
      // Evidence gate = everything hasSession trusts below (trace/zone
      // metrics) + composer/provider markers + a stamped PR delta, so a
      // delta-only PR or a trace-bearing session never files as plain 'post'
      // (CodeRabbit, #1684 follow-up).
      const isActivity = m.kind === 'workout'
        || (Array.isArray(m.workoutStats) && m.workoutStats.length > 0)
        || !!p.source_provider
        || !!(p.route && typeof p.route === 'object' && Array.isArray(p.route.points) && p.route.points.length)
        || !!(m.hrTrace || m.paceTrace || m.powerTrace || m.cadenceTrace || m.elevTrace || m.zoneDurations || m.zone_durations)
        || !!String(m.delta || '').trim();
      if (!isActivity) return ['post'];
      const t = String(p.activity_type || '').toLowerCase();
      const buckets = [/run|jog|ride|bike|cycl|cardio|walk|hike|row|swim/.test(t) ? 'run' : 'workout'];
      if (String(m.delta || '').trim()) buckets.push('pr');
      return buckets;
    };
    const mapPost = (p, uid) => {
      // Always render the body with the text-only 'post' renderer (the
      // pr/run/workout/meal demo renderers need fields the feed API omits).
      // BUT carry the real device metrics so activity posts get a Session
      // details view (charts), mirroring the mobile app.
      const m = (p.metrics && typeof p.metrics === 'object') ? p.metrics : {};
      const wstats = Array.isArray(m.workoutStats) ? m.workoutStats.filter(s => s && s.label && s.value != null).map(s => [String(s.label), String(s.value)]) : [];
      const hasSession = !!(m.hrTrace || m.paceTrace || m.powerTrace || m.cadenceTrace || m.elevTrace || m.zoneDurations || m.zone_durations || wstats.length);
      return {
        kind: 'post',
        buckets: bucketsFor(p, m),
        // THE PLATE data for real shared meals (spec 2026-07-12) — meal macros
        // only, honest-absent END TO END (CodeRabbit): a missing/malformed
        // value is null (the plate drops the row — never a fabricated "0 g"),
        // planned is tri-state (unknown → no stamp, never "Adjusted" by
        // default), and a meal post with no numbers at all renders as a
        // plain post.
        meal: (() => {
          if (m.kind !== 'meal') return null;
          const num = (v) => { if (v === undefined || v === null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? Math.round(n) : null; };
          const meal = {
            kcal: num(m.kcal), p: num(m.p), c: num(m.c), f: num(m.f),
            planned: typeof m.planned === 'boolean' ? m.planned : null,
            portion: (Number(m.portion) > 0 && Number(m.portion) !== 1) ? Number(m.portion) : null,
            recipeId: (typeof m.recipeId === 'string' && m.recipeId.trim()) ? m.recipeId.trim() : '',
            coach: (typeof m.coach === 'string' && m.coach.trim()) ? m.coach.trim() : '',
          };
          return (meal.kcal != null || meal.p != null || meal.c != null || meal.f != null) ? meal : null;
        })(),
        // THE APPOINTMENTS block (spec 2026-07-13): stamp ALWAYS present
        // (unknown normalizes to 'milestone' — the one-behavior contract),
        // detail only when stored.
        milestone: m.kind === 'milestone' ? {
          stamp: DC_MILESTONE_STAMPS.includes(m.stamp) ? m.stamp : 'milestone',
          detail: (typeof m.detail === 'string' && m.detail.trim()) ? m.detail.trim() : '',
        } : null,
        id: p.id || null,
        who: p.author_name || 'Shape member',
        role: p.author_role ? p.author_role[0].toUpperCase() + p.author_role.slice(1) : 'Member',
        time: since(p.created_at),
        title: p.title,
        body: p.photo_url ? (p.note || (p.title && p.title !== 'Photo' ? p.title : '')) : (p.note || p.title),
        photo: p.photo_url || null,
        mentions: (p.metrics && Array.isArray(p.metrics.mentions)) ? p.metrics.mentions : [],
        likes: Array.isArray(p.likes) ? p.likes.length : 0,
        comments: Array.isArray(p.comments) ? p.comments.length : 0,
        // Meal posts pin the NUTRITION tag from metrics.kind — activity_type
        // defaults to 'workout' on this API, so it can't be trusted alone
        // (CodeRabbit: the visible pill must match the Nutrition bucket).
        tag: m.kind === 'meal' ? 'NUTRITION' : m.kind === 'milestone' ? 'MILESTONE' : tagFor(p.activity_type),
        isMe: !!(uid && p.author_id === uid),
        video: (m && m.video_url) || null,
        isLive: true,
        session: hasSession ? { metrics: m, stats: wstats, sport: p.activity_type || '', title: p.title || 'Activity' } : null,
        // Share-card pass-throughs (web-parity spec 2026-07-13): the raw
        // values the card model needs, all honest-absent — a post without
        // them shares a minimal card, never a fabricated one.
        createdAt: p.created_at || null,
        route: (p.route && typeof p.route === 'object' && Array.isArray(p.route.points) && p.route.points.length >= 2) ? p.route.points : null,
        delta: (typeof m.delta === 'string' && m.delta.trim()) ? m.delta.trim() : '',
      };
    };
    (async () => {
      // Signed-in users see only the REAL community feed (a clean empty state when
      // there's nothing yet); the demo sample posts are for signed-out preview only.
      let signedIn = false;
      let uid = null;
      try { const sb = window.shapeDb && window.shapeDb.client; if (sb) { const { data } = await sb.auth.getUser(); uid = data && data.user && data.user.id; signedIn = !!uid; } } catch (e) {}
      let live = [];
      try {
        const r = await fetch('/api/community/feed' + (feedMode === 'following' ? '?mode=following' : ''), { credentials: 'same-origin' });
        if (r.ok) { const d = await r.json(); if (d && Array.isArray(d.posts)) live = d.posts.map(p => mapPost(p, uid)); }
      } catch (e) {}
      if (!alive) return;
      // Signed-out preview shows the demo set in BOTH modes (mobile parity —
      // spec AC6): the demo band already labels it a preview, so a signed-out
      // Following never dead-ends on a bare "nothing here" (CodeRabbit). The
      // SIGNED-IN Following empty state stays honest via liveEmpty below.
      setFeed(signedIn ? live : [...live, ...DEMO_FEED]);
      setLiveEmpty(signedIn && feedMode === 'following' && live.length === 0);
    })();
    return () => { alive = false; };
  }, [feedMode]);

  // ── Inline renderers per feed kind ────────────────────────────────────
  function PRStat({ p }) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 18, alignItems: "center", padding: "16px 18px", marginBottom: 14, background: "rgba(46,224,196,0.07)", border: "1px solid rgba(46,224,196,0.22)", borderRadius: 10 }}>
        <div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.18em", color: TEAL_BRIGHT, fontWeight: 600 }}>NEW PR</div>
          <div style={{ fontFamily: serif, fontSize: 36, letterSpacing: "-0.02em", lineHeight: 1, marginTop: 6, color: INK }}>{p.load}</div>
          <div style={{ fontSize: 11.5, color: TEAL_BRIGHT, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.06em", marginTop: 4 }}>{p.delta} · {p.reps}</div>
        </div>
        <div style={{ paddingLeft: 18, borderLeft: "1px solid rgba(46,224,196,0.18)" }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.14em", color: "rgba(242,237,228,0.55)" }}>LIFT</div>
          <div style={{ fontFamily: serif, fontSize: 22, letterSpacing: "-0.015em", marginTop: 4, color: INK }}>{p.lift}</div>
        </div>
      </div>
    );
  }
  function WorkoutStat({ p }) {
    return (
      <div style={{ padding: "16px 18px", marginBottom: 14, background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.08)", borderRadius: 10 }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.16em", color: TEAL_BRIGHT, fontWeight: 600, marginBottom: 6 }}>WORKOUT LOGGED</div>
        <div style={{ fontFamily: serif, fontSize: 22, letterSpacing: "-0.015em", color: INK, marginBottom: 8 }}>{p.title}</div>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(242,237,228,0.6)", letterSpacing: "0.06em" }}>
          <span>{p.duration.toUpperCase()}</span>
          <span>{p.exercises} EXERCISES</span>
          <span>RPE {p.rpe}</span>
          <span>WITH {p.coach.split(" ")[0].toUpperCase()}</span>
        </div>
      </div>
    );
  }
  function RunStat({ p }) {
    return (
      <div style={{ padding: "16px 18px", marginBottom: 14, background: "linear-gradient(100deg, rgba(106,140,255,0.10) 0%, rgba(242,237,228,0.04) 70%)", border: "1px solid rgba(106,140,255,0.22)", borderRadius: 10 }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.16em", color: "#9ab2ff", fontWeight: 600, marginBottom: 8 }}>RUN LOGGED</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
          {[["DIST", p.distance], ["PACE", p.pace], ["TIME", p.duration], ["ELEV", p.elev]].map(([l, v]) => (
            <div key={l}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.12em", color: "rgba(242,237,228,0.5)" }}>{l}</div>
              <div style={{ fontFamily: serif, fontSize: 20, letterSpacing: "-0.015em", color: INK, marginTop: 2, lineHeight: 1 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  function TierStat({ p }) {
    return (
      <div style={{ padding: "16px 18px", marginBottom: 14, background: "rgba(193,100,31,0.08)", border: "1px solid rgba(193,100,31,0.28)", borderRadius: 10 }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.18em", color: "#e89740", fontWeight: 600, marginBottom: 6 }}>TIER UP</div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontFamily: serif, fontSize: 24, letterSpacing: "-0.015em", color: "rgba(242,237,228,0.55)" }}>{p.from}</span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: "#e89740" }}>→</span>
          <span style={{ fontFamily: serif, fontSize: 30, letterSpacing: "-0.02em", color: INK }}>{p.to}</span>
          <span style={{ marginLeft: "auto", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(242,237,228,0.6)", letterSpacing: "0.06em" }}>{p.earned.toLocaleString()} PTS</span>
        </div>
      </div>
    );
  }
  function MealStat({ p }) {
    return (
      <div style={{ padding: "16px 18px", marginBottom: 14, background: "rgba(232,151,64,0.06)", border: "1px solid rgba(232,151,64,0.22)", borderRadius: 10 }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.16em", color: "#e89740", fontWeight: 600, marginBottom: 6 }}>MEAL LOGGED</div>
        <div style={{ fontFamily: serif, fontSize: 20, letterSpacing: "-0.015em", color: INK, marginBottom: 10, lineHeight: 1.15 }}>{p.title}</div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, color: "rgba(242,237,228,0.7)", letterSpacing: "0.04em" }}>
          <span><span style={{ color: "rgba(242,237,228,0.45)" }}>KCAL</span> {p.kcal}</span>
          <span><span style={{ color: "rgba(242,237,228,0.45)" }}>P</span> {p.p}g</span>
          <span><span style={{ color: "rgba(242,237,228,0.45)" }}>C</span> {p.c}g</span>
          <span><span style={{ color: "rgba(242,237,228,0.45)" }}>F</span> {p.f}g</span>
        </div>
        <div style={{ marginTop: 8, fontSize: 11.5, color: "rgba(242,237,228,0.5)" }}>{p.source}</div>
      </div>
    );
  }
  // THE PLATE (spec 2026-07-12) — a REAL shared meal's signature block: kcal
  // headline, dot-leader macro lines, the AS PLANNED/ADJUSTED stamp + honest
  // attribution. Renders only when mapPost stamps p.meal (metrics.kind==='meal');
  // the demo MealStat above stays untouched. Never day totals, never targets.
  // THE APPOINTMENTS (spec 2026-07-13) — the work-milestone block: stamp chip
  // (always present — the six canonical tokens, unknown normalizes to
  // MILESTONE) + the detail line only when stored. Slate accent (#7aa7dc),
  // the site's work-domain color.
  function MilestoneStamp({ m }) {
    const label = String(DC_MILESTONE_STAMPS.includes(m.stamp) ? m.stamp : "milestone").replace("_", " ").toUpperCase();
    return (
      <div style={{ margin: "10px 0 12px", border: "1px solid rgba(242,237,228,0.1)", borderRadius: 12, padding: "11px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }} aria-hidden="true">
          <span style={{ flex: 1, borderTop: "1px solid rgba(242,237,228,0.14)" }} />
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(242,237,228,0.5)" }}>The appointments</span>
          <span style={{ flex: 1, borderTop: "1px solid rgba(242,237,228,0.14)" }} />
        </div>
        <div style={{ marginTop: 9, display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span style={{ flexShrink: 0, fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "#7aa7dc", border: "1px solid rgba(122,167,220,0.45)", borderRadius: 3, padding: "3px 8px" }}>{label}</span>
          {m.detail && <span style={{ fontFamily: serif, fontStyle: "italic", fontSize: 13.5, lineHeight: 1.45, color: "rgba(242,237,228,0.85)", minWidth: 0 }}>{m.detail}</span>}
        </div>
      </div>
    );
  }

  function MealPlate({ meal }) {
    // Honest-absent (CodeRabbit): mapPost delivers nullable macros + a
    // tri-state planned. Absent rows drop, the kcal headline renders only
    // when real, the stamp only when the planning state is KNOWN, and the
    // footer only when it has something true to say.
    const rows = [["Protein", meal.p], ["Carbs", meal.c], ["Fat", meal.f]]
      .filter((r) => r[1] != null).map(([l, v]) => [l, `${v} g`]);
    const stamp = meal.planned === true ? "As planned" : meal.planned === false ? "Adjusted" : null;
    const stampLine = [stamp, meal.portion ? `${meal.portion}×` : null].filter(Boolean).join(" · ");
    const attribution = meal.coach ? `From ${meal.coach}'s plan` : meal.recipeId ? "Kitchen Card recipe" : null;
    return (
      <div style={{ marginBottom: 12, padding: "13px 16px 9px", border: "1px solid rgba(242,237,228,0.14)", borderRadius: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }} aria-hidden="true">
          <span style={{ flex: 1, borderTop: "1px solid rgba(242,237,228,0.16)" }} />
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.2em", color: "rgba(242,237,228,0.55)", fontWeight: 600 }}>THE PLATE</span>
          <span style={{ flex: 1, borderTop: "1px solid rgba(242,237,228,0.16)" }} />
        </div>
        {meal.kcal != null && (
          <div style={{ marginTop: 10, display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontFamily: serif, fontSize: 30, letterSpacing: "-0.02em", color: INK, lineHeight: 1 }}>{meal.kcal}</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.14em", color: "rgba(242,237,228,0.5)" }}>KCAL</span>
          </div>
        )}
        {rows.length > 0 && (
          <div style={{ marginTop: 6 }}>
            {rows.map(([l, v]) => (
              <div key={l} style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "4px 0" }}>
                <span style={{ fontSize: 13.5, color: "rgba(242,237,228,0.85)" }}>{l}</span>
                <span aria-hidden="true" style={{ flex: 1, borderBottom: "1px dotted rgba(242,237,228,0.3)", transform: "translateY(-3px)" }} />
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, color: "rgba(242,237,228,0.85)", letterSpacing: "0.04em" }}>{v}</span>
              </div>
            ))}
          </div>
        )}
        {(stampLine || attribution) && (
          <div style={{ marginTop: 7, paddingTop: 7, borderTop: "1px solid rgba(242,237,228,0.14)", display: "flex", justifyContent: "space-between", gap: 10, fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.14em", color: "rgba(242,237,228,0.5)", textTransform: "uppercase" }}>
          <span style={{ flexShrink: 0 }}>{stampLine}</span>
            {attribution && <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{attribution}</span>}
          </div>
        )}
      </div>
    );
  }
  function StreakStat({ p }) {
    return (
      <div style={{ padding: "16px 18px", marginBottom: 14, background: "rgba(46,224,196,0.07)", border: "1px solid rgba(46,224,196,0.2)", borderRadius: 10, display: "flex", alignItems: "center", gap: 18 }}>
        <div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.18em", color: TEAL_BRIGHT, fontWeight: 600 }}>STREAK</div>
          <div style={{ fontFamily: serif, fontSize: 36, letterSpacing: "-0.02em", lineHeight: 1, marginTop: 6, color: INK }}>{p.days}d</div>
        </div>
        <div style={{ flex: 1, display: "flex", gap: 4 }}>
          {Array.from({ length: 21 }).map((_, i) => (
            <div key={i} style={{ flex: 1, height: 32, borderRadius: 3, background: i < p.days ? TEAL : "rgba(242,237,228,0.06)" }} />
          ))}
        </div>
      </div>
    );
  }

  // ── Share as image (web-parity spec 2026-07-13) ─────────────────────────
  // My own tier, resolved lazily for the card's tier line (the share is
  // own-only, so only MY tier is ever needed). Coach roles read the coach
  // ladder; a failed fetch degrades to the role-only line — never blocks.
  // Cache KEYED BY THE AUTHENTICATED USER ID (spec review round): an account
  // switch in a live tab never reuses the prior account's tier, and an
  // unauthenticated resolve is never cached at all. The cache holds the
  // in-flight PROMISE and the uid comes from the LOCAL session (no network),
  // so the chooser's open-time prefetch leaves the image tap's await a
  // microtask — navigator.share keeps its transient activation (CodeRabbit).
  const shareMyTier = async (role) => {
    let uid = null;
    try {
      const sb = window.shapeDb && window.shapeDb.client;
      if (sb) { const { data } = await sb.auth.getSession(); uid = (data && data.session && data.session.user && data.session.user.id) || null; }
    } catch (e) {}
    if (!uid) return null;
    const r = String(role || "").toLowerCase();
    const key = uid + ":" + r;
    const cache = window.__shapeShareTier || (window.__shapeShareTier = {});
    if (cache[key] === undefined) {
      cache[key] = (async () => {
        if (r === "trainer" || r === "nutritionist" || r === "dietitian") {
          const res = await fetch("/api/coach/score?role=" + (r === "trainer" ? "trainer" : "nutritionist"), { credentials: "same-origin" });
          if (!res.ok) return null;
          const d = await res.json();
          return typeof d.current_tier === "string" ? d.current_tier : null;
        }
        const res = await fetch("/api/client/score", { credentials: "same-origin" });
        if (!res.ok) return null;
        const d = await res.json();
        return (d.current_tier && d.current_tier.name) || null;
      })().catch(() => null);
    }
    return cache[key];
  };

  // Build the card model from the SAME mapped post the card just drew and
  // render + share through the canonical renderer (window.ShapeShareCard —
  // the shells' module loader; callers gate on it existing, so a
  // stale-cached shell never offers the row).
  const shareAsImage = async (p) => {
    const SC = window.ShapeShareCard;
    if (!SC) return;
    const tier = await shareMyTier(p.role);
    const stats = (p.session && Array.isArray(p.session.stats)) ? p.session.stats : [];
    const isRun = Array.isArray(p.buckets) && p.buckets.indexOf("run") >= 0;
    const hero = stats[SC.bsHeroStatIndex(stats, { isRun })] || null;
    const model = SC.bsShareCardModel({
      who: p.who,
      tierLine: tier ? tier + " · " + (p.role || "Member") : (p.role || ""),
      title: p.title || "",
      heroStat: hero,
      stats,
      delta: p.delta || "",
      meal: p.meal || null,
      routePoints: p.route || null,
      dateLine: p.createdAt ? new Date(p.createdAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "",
    });
    const r = await SC.bsShareCardImage(model);
    // 'downloaded' shows no alert — the browser's own download UI confirms;
    // share-sheet abort is silent by contract. Only real failures speak.
    if (!r.ok) { try { window.alert("Could not render the card — try again."); } catch (e) {} }
  };

  // The link/image chooser — mirrors the mobile BSShareChooser's two rows.
  // Mounted only on OWN real posts (the callers gate); sits ABOVE the
  // Session details modal (z 120) so both entry points share it.
  function ShareChooserModal({ p, onShareLink, onClose }) {
    // Warm the tier the moment the chooser opens: the image tap's own await
    // then resolves from the promise cache in a microtask, so the OS share
    // sheet opens inside the tap's transient activation (CodeRabbit).
    React.useEffect(() => { shareMyTier(p.role); }, []);
    const rows = [
      ["Share link →", () => { onClose(); onShareLink(); }],
      ["Share as image →", () => { onClose(); shareAsImage(p); }],
    ];
    return (
      <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{ position: "fixed", inset: 0, zIndex: 130, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "18vh 18px" }}>
        <div style={{ width: "100%", maxWidth: 360, background: "#16130f", border: "1px solid rgba(242,237,228,0.12)", borderRadius: 14, padding: "14px 18px 8px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(242,237,228,0.55)" }}>Share</span>
            <button type="button" onClick={onClose} aria-label="Close" style={{ background: "transparent", border: 0, color: "rgba(242,237,228,0.5)", cursor: "pointer", fontSize: 14, padding: 2, lineHeight: 1 }}>✕</button>
          </div>
          {rows.map(([label, fn], i) => (
            <button type="button" key={label} onClick={fn} style={{ display: "flex", alignItems: "center", width: "100%", minHeight: 48, background: "transparent", border: 0, borderTop: i ? "1px solid rgba(242,237,228,0.08)" : "0", color: INK, cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", textAlign: "left", padding: "0 2px" }}>{label}</button>
          ))}
        </div>
      </div>
    );
  }

  // ✉ Send a live post into a real 1:1 DM (same RPCs the app uses); the
  // recipient sees it in their chat (app + site widget).
  function SendPostModal({ post, onClose }) {
    const [q, setQ] = React.useState("");
    const [people, setPeople] = React.useState([]);
    const [limited, setLimited] = React.useState(false); // the per-member search ceiling refused this one
    const [busy, setBusy] = React.useState("");
    React.useEffect(() => {
      let dead = false;
      const id = setTimeout(() => {
        const sb = window.shapeDb && window.shapeDb.client;
        if (!sb) { setPeople([]); return; }
        // ⚠ A REFUSAL IS NOT AN EMPTY RESULT. Past the per-member ceiling the RPC
        // raises PT429 (2026-08-29-search-rate-limit.sql); an empty list would
        // tell the sender that nobody by that name is on Shape. Matched on the
        // CODE, never the message.
        sb.rpc("search_members", { p_q: q || "" })
          .then(r => { if (dead) return; setLimited(!!(r.error && r.error.code === "PT429")); setPeople(Array.isArray(r.data) ? r.data : []); })
          .catch(e => { if (dead) return; setLimited(!!(e && e.code === "PT429")); setPeople([]); });
      }, 220);
      return () => { dead = true; clearTimeout(id); };
    }, [q]);
    const sendTo = async (m) => {
      if (busy) return;
      setBusy(m.id);
      try {
        const sb = window.shapeDb.client;
        const { data: cid, error } = await sb.rpc("get_or_create_member_conversation", { p_other_user_id: m.id });
        if (error || !cid) throw error || new Error("no_conversation");
        const { data: u } = await sb.auth.getUser();
        if (!u || !u.user) throw new Error("not_signed_in");
        const snippet = [post.title, post.body].filter(Boolean).join(" — ").slice(0, 200);
        const { error: e2 } = await sb.from("messages").insert({ conversation_id: cid, sender_id: u.user.id, body: `Shared ${post.who ? post.who + "'s" : "a"} post: “${snippet || "Activity"}”`, metadata: { kind: "shared_post", post_id: post.id || null } });
        if (e2) throw e2;
        try { window.alert(`Sent to ${m.full_name}`); } catch (e3) {}
        onClose();
      } catch (e4) { try { window.alert("Could not send — try again."); } catch (e5) {} }
      setBusy("");
    };
    return (
      <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "12vh 18px" }}>
        <div style={{ width: "100%", maxWidth: 440, background: "#16130f", border: "1px solid rgba(242,237,228,0.12)", borderRadius: 14, padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(242,237,228,0.55)" }}>Send to</span>
            <button onClick={onClose} aria-label="Close" style={{ background: "transparent", border: 0, color: "rgba(242,237,228,0.5)", cursor: "pointer", fontSize: 14, padding: 2, lineHeight: 1 }}>✕</button>
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search members…" autoFocus
            style={{ width: "100%", boxSizing: "border-box", padding: "10px 2px", border: 0, borderBottom: "1px solid rgba(242,237,228,0.2)", background: "transparent", color: INK, fontSize: 14.5, outline: "none" }} />
          <div style={{ maxHeight: 300, overflowY: "auto", marginTop: 6 }}>
            {limited ? (
              <div style={{ padding: "14px 2px", fontSize: 13, color: "rgba(242,237,228,0.5)" }}>Searching a little fast — give it a moment and try again.</div>
            ) : people.length === 0 ? (
              <div style={{ padding: "14px 2px", fontSize: 13, color: "rgba(242,237,228,0.5)" }}>{q ? "No one found." : "Search for someone to send this to."}</div>
            ) : people.map((m, i) => (
              <button key={m.id} disabled={!!busy} onClick={() => sendTo(m)} style={{ width: "100%", textAlign: "left", cursor: "pointer", background: "transparent", border: 0, borderTop: i ? "1px solid rgba(242,237,228,0.07)" : 0, padding: "10px 2px", display: "flex", alignItems: "center", gap: 10, color: INK, opacity: busy && busy !== m.id ? 0.5 : 1 }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.full_name || "Member"}</span>
                <span style={{ flexShrink: 0, fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: busy === m.id ? "rgba(242,237,228,0.4)" : TEAL_BRIGHT }}>{busy === m.id ? "Sending…" : "Send →"}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  function FeedItem({ p, onEdit, onDeleted }) {
    const [liked, setLiked] = React.useState(false);
    const [likeCount, setLikeCount] = React.useState(p.likes);
    const [sendOpen, setSendOpen] = React.useState(false);
    const [sessionOpen, setSessionOpen] = React.useState(false);
    // Share-as-image chooser (web-parity spec 2026-07-13): OWN real posts
    // only (the EDIT/DELETE gate), and only when the shell's module loader
    // delivered the renderer — a stale-cached shell keeps plain link share.
    const [shareOpen, setShareOpen] = React.useState(false);
    const canShareImage = !!(p.isMe && p.isLive && p.id && window.ShapeShareCard);
    const [showReplies, setShowReplies] = React.useState(false);
    const [draft, setDraft] = React.useState("");
    const [replies, setReplies] = React.useState([]);
    const totalReplies = p.comments + replies.length;

    // Live posts persist engagement to the real tables (same RLS the app uses);
    // demo cards stay optimistic-local so the feed always demonstrates itself.
    const sb = () => (window.shapeDb && window.shapeDb.client) || null;
    const toggleLike = async () => {
      setLikeCount(c => liked ? c - 1 : c + 1);
      setLiked(v => !v);
      if (!p.isLive || !p.id) return;
      try {
        const client = sb(); if (!client) return;
        const { data: u } = await client.auth.getUser();
        const uid = u && u.user && u.user.id; if (!uid) return;
        const { data: existing } = await client.from("community_likes").select("post_id").eq("post_id", p.id).eq("user_id", uid).maybeSingle();
        if (existing) await client.from("community_likes").delete().eq("post_id", p.id).eq("user_id", uid);
        else await client.from("community_likes").insert({ post_id: p.id, user_id: uid });
      } catch (e) {}
    };
    const submitReply = async () => {
      const t = draft.trim();
      if (!t) return;
      setReplies(rs => [...rs, { who: "You", t, time: "now" }]);
      setDraft("");
      if (!p.isLive || !p.id) return;
      try {
        const client = sb(); if (!client) return;
        const { data: u } = await client.auth.getUser();
        const uid = u && u.user && u.user.id; if (!uid) return;
        const name = (u.user.user_metadata && u.user.user_metadata.full_name) || String(u.user.email || "Member").split("@")[0];
        await client.from("community_comments").insert({ post_id: p.id, user_id: uid, author_name: name, body: t });
      } catch (e) {}
    };
    const onRepost = async () => {
      if (!p.isLive || !p.id) { try { window.alert("Sample post — repost works on real posts."); } catch (e) {} return; }
      try {
        const res = await fetch("/api/community/feed", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: p.title || "Repost", note: p.body || "", privacy: "public", metrics: { kind: "note", repostOf: { postId: p.id, who: p.who || "", title: p.title || "", body: String(p.body || "").slice(0, 240) } } }) });
        if (!res.ok) throw new Error("repost_failed");
        try { window.alert("Reposted to the feed"); } catch (e) {}
      } catch (e2) { try { window.alert("Could not repost."); } catch (e3) {} }
    };
    const onShare = () => {
      const url = window.location.href + "#post-" + (p.who || "").replace(/[^a-z0-9]/gi, "-").toLowerCase();
      try {
        if (navigator.share) navigator.share({ title: "Shape Community", text: p.body || p.title || "Check this out", url });
        else if (navigator.clipboard) { navigator.clipboard.writeText(url); alert("Link copied to clipboard"); }
      } catch (e) {}
    };

    return (
      <Card style={{ padding: 22 }}>
        <div style={{ display: "flex", gap: 12, marginBottom: 14, alignItems: "center" }}>
          <div style={{ width: 40, height: 40, borderRadius: 999, background: "#efece6", flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{p.who}</div>
              <div style={{ fontSize: 11, color: TEAL_BRIGHT, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.04em" }}>{p.role}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
              <span style={{ fontSize: 11, color: "rgba(242,237,228,0.45)" }}>{p.time}</span>
              <span style={{ width: 3, height: 3, borderRadius: 999, background: "rgba(242,237,228,0.25)" }} />
              <Pill>{p.tag}</Pill>
            </div>
          </div>
        </div>
        {p.session ? (
          <button onClick={() => setSessionOpen(true)} style={{ width: "100%", textAlign: "left", cursor: "pointer", display: "block", background: "rgba(46,224,196,0.06)", border: "1px solid rgba(46,224,196,0.22)", borderRadius: 10, padding: "14px 16px", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.16em", color: TEAL_BRIGHT, fontWeight: 600 }}>SESSION</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: TEAL_BRIGHT, fontWeight: 600 }}>Session details →</span>
            </div>
            <div style={{ fontFamily: serif, fontSize: 20, letterSpacing: "-0.015em", color: INK, marginBottom: (p.session.stats && p.session.stats.length) ? 10 : 0 }}>{p.session.title}</div>
            {p.session.stats && p.session.stats.length > 0 && (
              <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
                {p.session.stats.slice(0, 3).map((st, i) => (
                  <div key={i}>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(242,237,228,0.5)" }}>{st[0]}</div>
                    <div style={{ fontFamily: serif, fontSize: 19, color: INK, marginTop: 2, lineHeight: 1 }}>{st[1]}</div>
                  </div>
                ))}
              </div>
            )}
          </button>
        ) : (<>
          {p.kind === "pr"      && <PRStat p={p} />}
          {p.kind === "workout" && <WorkoutStat p={p} />}
          {p.kind === "run"     && <RunStat p={p} />}
          {p.kind === "tier"    && <TierStat p={p} />}
          {p.kind === "meal"    && <MealStat p={p} />}
          {p.kind === "streak"  && <StreakStat p={p} />}
        </>)}
        {p.meal && <MealPlate meal={p.meal} />}
        {p.milestone && <MilestoneStamp m={p.milestone} />}
        {p.body && <div style={{ fontSize: 14.5, lineHeight: 1.55, color: "rgba(242,237,228,0.9)" }}>{p.body}</div>}
        {p.photo && <img src={p.photo} alt={p.title || p.body || `Photo shared by ${p.who || "a member"}`} loading="lazy" style={{ display: "block", width: "100%", aspectRatio: "4 / 3", objectFit: "cover", borderRadius: 12, marginTop: p.body ? 12 : 2, border: "1px solid rgba(242,237,228,0.08)", background: "rgba(242,237,228,0.05)" }} />}
        {p.video && <video src={p.video} controls playsInline preload="metadata" style={{ display: "block", width: "100%", aspectRatio: "4 / 3", objectFit: "cover", borderRadius: 12, marginTop: p.body ? 12 : 2, background: "#000", border: "1px solid rgba(242,237,228,0.08)" }} />}
        {Array.isArray(p.mentions) && p.mentions.length > 0 && (
          <div style={{ marginTop: 8, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(242,237,228,0.6)" }}>
            with {p.mentions.map((mn, mi) => (
              <React.Fragment key={mi}>
                {mn.userId ? <a href={`MemberProfile.html?u=${mn.userId}`} style={{ color: TEAL_BRIGHT, textDecoration: "none", fontWeight: 600 }}>@{mn.name}</a> : <span style={{ color: TEAL_BRIGHT, fontWeight: 600 }}>@{mn.name}</span>}
                {mi < p.mentions.length - 1 ? ", " : ""}
              </React.Fragment>
            ))}
          </div>
        )}
        {p.note && !p.photo && <div style={{ fontSize: 12.5, lineHeight: 1.5, color: "rgba(242,237,228,0.55)", fontStyle: "italic", marginTop: 6 }}>"{p.note}"</div>}
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(242,237,228,0.06)", display: "flex", gap: 20, alignItems: "center", fontSize: 12, color: "rgba(242,237,228,0.55)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.04em" }}>
          <button onClick={toggleLike} aria-pressed={liked} aria-label={liked ? "Unlike" : "Like"}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", background: "transparent", border: 0, padding: 0, color: liked ? TEAL_BRIGHT : "rgba(242,237,228,0.55)", fontFamily: "inherit", fontSize: "inherit", letterSpacing: "inherit", transition: "color 0.15s, transform 0.15s", transform: liked ? "scale(1.05)" : "scale(1)" }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill={liked ? "currentColor" : "none"}>
              <path d="M6 10.2S1.5 7.5 1.5 4.5a2.5 2.5 0 0 1 4.5-1.5 2.5 2.5 0 0 1 4.5 1.5c0 3-4.5 5.7-4.5 5.7Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
            </svg>
            {likeCount}
          </button>
          <button onClick={() => setShowReplies(v => !v)} aria-expanded={showReplies} aria-label={showReplies ? "Hide replies" : "Show replies"}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", background: "transparent", border: 0, padding: 0, color: showReplies ? TEAL_BRIGHT : "rgba(242,237,228,0.55)", fontFamily: "inherit", fontSize: "inherit", letterSpacing: "inherit" }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 5.5a3 3 0 0 1 3-3h4a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H5l-2.5 2V7a2.5 2.5 0 0 1-.5-1.5Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/></svg>
            {totalReplies} replies
          </button>
          <button onClick={() => { if (!p.isLive || !p.id) { try { window.alert("Sample post — sending works on real posts."); } catch (e) {} return; } setSendOpen(true); }} aria-label="Send privately"
            style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", background: "transparent", border: 0, padding: 0, color: "rgba(242,237,228,0.55)", fontFamily: "inherit", fontSize: "inherit", letterSpacing: "inherit" }}>
            ✉ SEND
          </button>
          <button onClick={() => { if (canShareImage) setShareOpen(true); else onShare(); }} aria-label="Share"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", background: "transparent", border: 0, padding: 0, color: "rgba(242,237,228,0.55)", fontFamily: "inherit", fontSize: "inherit", letterSpacing: "inherit" }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M9 4.5V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1V7.5M6.5 4.5H10m0 0L8 2.5M10 4.5 8 6.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/></svg>
            SHARE
          </button>
          <button onClick={onRepost} aria-label="Repost"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", background: "transparent", border: 0, padding: 0, color: "rgba(242,237,228,0.55)", fontFamily: "inherit", fontSize: "inherit", letterSpacing: "inherit" }}>
            ⇄ REPOST
          </button>
          {p.isMe && p.isLive && p.id && onEdit && (
            <button onClick={() => onEdit(p)} aria-label="Edit post"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", background: "transparent", border: 0, padding: 0, color: "rgba(242,237,228,0.55)", fontFamily: "inherit", fontSize: "inherit", letterSpacing: "inherit" }}>
              ✎ EDIT
            </button>
          )}
          {p.isMe && p.isLive && p.id && (
            <button onClick={async () => {
              if (!(await window.ShapeConfirm.open({ title: "Delete this post?", message: "This permanently removes the post and its photo/video, likes, and comments.", confirmLabel: "Delete post" }))) return;
              try {
                const res = await fetch("/api/community/feed?id=" + encodeURIComponent(p.id), { method: "DELETE", credentials: "same-origin" });
                if (!res.ok) throw new Error("delete_failed");
                if (typeof onDeleted === "function") onDeleted(p.id);
              } catch (e) { try { window.alert("Could not delete."); } catch (e2) {} }
            }} aria-label="Delete post"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", background: "transparent", border: 0, padding: 0, color: "#c0533b", fontFamily: "inherit", fontSize: "inherit", letterSpacing: "inherit" }}>
              × DELETE
            </button>
          )}
        </div>
        {sendOpen && <SendPostModal post={p} onClose={() => setSendOpen(false)} />}
        {sessionOpen && <SessionDetailsModal p={p} onClose={() => setSessionOpen(false)} onShareImage={canShareImage ? () => setShareOpen(true) : null} />}
        {shareOpen && <ShareChooserModal p={p} onShareLink={onShare} onClose={() => setShareOpen(false)} />}

        {showReplies && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(242,237,228,0.06)" }}>
            {replies.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                {replies.map((r, i) => (
                  <div key={i} style={{ padding: "10px 12px", background: "rgba(10,197,168,0.06)", borderRadius: 8, marginBottom: 6 }}>
                    <div style={{ fontSize: 12, color: TEAL_BRIGHT, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.04em", marginBottom: 4 }}>{r.who} · {r.time}</div>
                    <div style={{ fontSize: 13.5, color: "rgba(242,237,228,0.9)", lineHeight: 1.5 }}>{r.t}</div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitReply(); }}
                placeholder="Reply…"
                style={{ flex: 1, padding: "10px 14px", borderRadius: 8, background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.12)", color: INK, fontFamily: sans, fontSize: 13.5, outline: "none" }}
              />
              <button onClick={submitReply} disabled={!draft.trim()}
                style={{ padding: "10px 18px", borderRadius: 8, background: draft.trim() ? TEAL : "rgba(242,237,228,0.08)", color: draft.trim() ? PAPER : "rgba(242,237,228,0.4)", border: 0, fontFamily: sans, fontSize: 13, fontWeight: 500, cursor: draft.trim() ? "pointer" : "default" }}>
                Send
              </button>
            </div>
          </div>
        )}
      </Card>
    );
  }

  function ChannelsCard({ channels, meetups }) {
    const [tab, setTab] = React.useState("channels"); // 'channels' | 'meetups'
    const [query, setQuery] = React.useState("");
    const [chFilter, setChFilter] = React.useState("all");
    const [joinedMap, setJoinedMap] = React.useState(() => {
      const m = {};
      channels.forEach(c => { m[c.name] = c.joined; });
      return m;
    });
    const toggle = (name) => setJoinedMap(prev => ({ ...prev, [name]: !prev[name] }));

    const q = query.trim().toLowerCase();
    const filtered = channels.filter(c => {
      if (q && !(c.name.toLowerCase().includes(q) || c.lastMsg.toLowerCase().includes(q))) return false;
      if (chFilter === "joined" && !joinedMap[c.name]) return false;
      if (chFilter === "trending" && !c.trending) return false;
      return true;
    });
    const joinedCount = channels.filter(c => joinedMap[c.name]).length;
    const FilterPill = ({ k, label, count }) => {
      const active = chFilter === k;
      return (
        <button onClick={() => setChFilter(k)} style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.1em",
          padding: "5px 10px", borderRadius: 999,
          background: active ? INK : "rgba(242,237,228,0.04)",
          color: active ? PAPER : "rgba(242,237,228,0.7)",
          border: active ? "none" : "1px solid rgba(242,237,228,0.12)",
          cursor: "pointer",
        }}>{label}{count != null ? ` · ${count}` : ""}</button>
      );
    };

    const meetupList = meetups || [];
    const TabBtn = ({ k, label, count }) => {
      const on = tab === k;
      return (
        <button onClick={() => setTab(k)} style={{
          flex: 1,
          padding: "10px 14px",
          borderRadius: 999,
          background: on ? INK : "transparent",
          color: on ? PAPER : "rgba(242,237,228,0.72)",
          border: on ? "none" : "1px solid rgba(242,237,228,0.14)",
          fontFamily: sans, fontSize: 12.5, fontWeight: 500,
          cursor: "pointer",
          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
          <span>{label}</span>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.08em",
            background: on ? "rgba(242,237,228,0.18)" : "rgba(242,237,228,0.06)",
            color: on ? PAPER : "rgba(242,237,228,0.65)",
            padding: "2px 7px", borderRadius: 999,
          }}>{count}</span>
        </button>
      );
    };

    return (
      <Card>
        <SectionTitle right={tab === "channels"
          ? `${channels.length} CHANNELS`
          : `${meetupList.length} SCHEDULED`}>{tab === "channels" ? "Channels" : "Meetups"}</SectionTitle>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <TabBtn k="channels" label="Channels" count={channels.length} />
          <TabBtn k="meetups" label="Meetups" count={meetupList.length} />
        </div>

        {tab === "channels" && <>
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search channels…"
            style={{ width: "100%", padding: "10px 14px", borderRadius: 8, background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.12)", color: INK, fontFamily: sans, fontSize: 13, outline: "none", marginBottom: 12 }}
          />
          <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
            <FilterPill k="all" label="ALL" count={channels.length} />
            <FilterPill k="joined" label="JOINED" count={joinedCount} />
            <FilterPill k="trending" label="TRENDING" />
          </div>

          {filtered.length === 0 && (
            <div style={{ padding: "26px 4px", color: "rgba(242,237,228,0.5)", fontSize: 13, textAlign: "center" }}>
              No channels match.
            </div>
          )}
          {filtered.map((c, i) => {
            const joined = !!joinedMap[c.name];
            return (
              <div key={c.name} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center", padding: "12px 0", borderTop: i === 0 ? "none" : "1px solid rgba(242,237,228,0.06)" }}>
                <a href={`Community.html?channel=${encodeURIComponent(c.name)}`} style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", color: TEAL_BRIGHT, fontSize: 13, fontWeight: 500 }}>#</span>
                    <span style={{ fontSize: 13.5, fontWeight: 500, color: INK }}>{c.name}</span>
                    {c.trending && <Pill tone="teal">TRENDING</Pill>}
                    {c.unread > 0 && joined && (
                      <span style={{ background: TEAL, color: PAPER, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.04em", padding: "2px 7px", borderRadius: 999 }}>{c.unread}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11.5, color: "rgba(242,237,228,0.55)", marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.lastMsg}</div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "rgba(242,237,228,0.4)", letterSpacing: "0.08em", marginTop: 3 }}>{c.members.toLocaleString()} members · {c.at}</div>
                </a>
                <button onClick={() => toggle(c.name)} style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.1em",
                  padding: "6px 12px", borderRadius: 999, cursor: "pointer",
                  background: joined ? "rgba(242,237,228,0.04)" : TEAL,
                  color: joined ? "rgba(242,237,228,0.7)" : PAPER,
                  border: joined ? "1px solid rgba(242,237,228,0.18)" : "none",
                  whiteSpace: "nowrap",
                }}>{joined ? "JOINED" : "JOIN"}</button>
              </div>
            );
          })}

          <div style={{ paddingTop: 14, marginTop: 6, borderTop: "1px solid rgba(242,237,228,0.08)" }}>
            <a href="Community.html?new-channel=1" style={{ display: "block", textAlign: "center", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.14em", color: TEAL_BRIGHT }}>+ NEW CHANNEL</a>
          </div>
        </>}

        {tab === "meetups" && <>
          {meetupList.length === 0 ? (
            <div style={{ padding: "26px 4px", color: "rgba(242,237,228,0.5)", fontSize: 13, textAlign: "center" }}>
              No meetups scheduled.
            </div>
          ) : (
            meetupList.map((m, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center", padding: "12px 0", borderTop: i === 0 ? "none" : "1px solid rgba(242,237,228,0.06)" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.12em", color: TEAL_BRIGHT, marginBottom: 3 }}>{m.when}</div>
                  <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.title}</div>
                  <div style={{ fontSize: 11, color: "rgba(242,237,228,0.55)", marginTop: 2 }}>{m.sub}</div>
                </div>
                <button style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.1em",
                  padding: "6px 11px", borderRadius: 999, cursor: "pointer",
                  background: m.rsvp ? "rgba(10,197,168,0.16)" : "rgba(242,237,228,0.04)",
                  color: m.rsvp ? TEAL_BRIGHT : "rgba(242,237,228,0.7)",
                  border: "1px solid " + (m.rsvp ? "rgba(10,197,168,0.3)" : "rgba(242,237,228,0.12)"),
                  whiteSpace: "nowrap",
                }}>{m.rsvp ? "GOING" : "RSVP"}</button>
              </div>
            ))
          )}
          <div style={{ paddingTop: 14, marginTop: 6, borderTop: "1px solid rgba(242,237,228,0.08)", display: "flex", justifyContent: "space-between", gap: 14 }}>
            <a href="Community.html?new-meetup=1" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.14em", color: TEAL_BRIGHT }}>+ NEW MEETUP</a>
            <a href="Community.html?meetups=1" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.14em", color: TEAL_BRIGHT }}>VIEW ALL →</a>
          </div>
        </>}
      </Card>
    );
  }

  const channels = [
    { name: "running",          members: 842, lastMsg: "anyone hitting the half this weekend?",       at: "2m",   joined: true,  unread: 4,  trending: true  },
    { name: "powerlifting",     members: 526, lastMsg: "265 squat PR today — programming worked",     at: "14m",  joined: true,  unread: 1                  },
    { name: "form-check",       members: 1304, lastMsg: "video posted — RDL hip hinge",               at: "1h",   joined: true,  unread: 0                  },
    { name: "nutrition-talk",   members: 678, lastMsg: "best protein bars under 200 cal?",            at: "2h",   joined: true,  unread: 12                 },
    { name: "marathon-training",members: 412, lastMsg: "week 8 of Pfitz 18/55 — heel strike fix",     at: "3h",   joined: false, unread: 0,  trending: true  },
    { name: "hypertrophy",      members: 891, lastMsg: "high-frequency chest split, worth it?",      at: "5h",   joined: false, unread: 0                  },
    { name: "recovery",         members: 384, lastMsg: "sauna + cold plunge protocol",                at: "6h",   joined: false, unread: 0                  },
    { name: "newbie",           members: 1567, lastMsg: "first squat day — terrified",                at: "8h",   joined: false, unread: 0                  },
    { name: "meal-prep",        members: 920, lastMsg: "sunday batch cook → 12 meals",                at: "yest", joined: false, unread: 0                  },
    { name: "shape-radio",      members: 234, lastMsg: "live show in 20: deload weeks explained",     at: "9h",   joined: false, unread: 0                  },
  ];
  const meetups = [
    { when: "SAT 6:30AM", title: "Prospect Park Long Run",      sub: "24 going · 12 from your borough",  rsvp: true  },
    { when: "TUE 7:00PM", title: "Form check drop-in (Zoom)",   sub: "with Maya Okafor",                  rsvp: false },
    { when: "APR 27",     title: "Brooklyn Half",               sub: "8 Shape runners confirmed",         rsvp: false },
  ];

  return (
    <DashPage
      navItems={navItems}
      payoutCard={payoutCard}
      eyebrow="4,218 MEMBERS · 128 ACTIVE NOW"
      title="Community"
      subtitle="What the Shape community is working on this week. Posts, meetups, and PRs from people training alongside you."
      actions={<>
        <button onClick={() => setMyPostsOnly(v => !v)} style={{ background: myPostsOnly ? "rgba(10,197,168,0.16)" : "transparent", color: myPostsOnly ? TEAL_BRIGHT : INK, border: `1px solid ${myPostsOnly ? "rgba(10,197,168,0.4)" : "rgba(242,237,228,0.25)"}`, padding: "10px 20px", borderRadius: 999, fontFamily: sans, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>{myPostsOnly ? "All posts" : "My posts"}</button>
        <button onClick={() => setComposerOpen(true)} style={{ background: INK, color: PAPER, border: 0, padding: "10px 22px", borderRadius: 999, fontFamily: sans, fontSize: 13, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap" }}>New post</button>
      </>}
    >
      <div data-tour="hero-community" style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 20 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {(() => {
            const filters = [
              { label: "ALL",      kinds: null },
              { label: "WORKOUTS", kinds: ["workout"] },
              { label: "PRs",      kinds: ["pr"] },
              { label: "RUNS",     kinds: ["run"] },
              { label: "NUTRITION", kinds: ["meal"] },
              { label: "MILESTONES", kinds: ["streak", "tier", "milestone"] },
              { label: "POSTS",    kinds: ["post"] },
            ];
            const visible = feed.filter(p => {
              if (myPostsOnly && !p.isMe) return false;
              const f = filters.find(x => x.label === filter);
              // Real posts filter by their activity buckets (kind stays 'post'
              // for the renderer; a PR'd run matches BOTH RUNS and PRs); demo
              // cards have no buckets → kind as before.
              return !f || !f.kinds || f.kinds.some(k => (p.buckets || [p.kind]).includes(k));
            });
            if (feedMode === "following" && liveEmpty) {
              return (
                <>
                  <div style={{ display: "flex", gap: 18, marginBottom: 4 }}>
                    {[["universal", "UNIVERSAL"], ["following", "FOLLOWING"]].map(([m, lab]) => {
                      const on = feedMode === m;
                      return (<button key={m} onClick={() => switchFeedMode(m)} aria-pressed={on} style={{ position: "relative", background: "transparent", border: 0, cursor: "pointer", padding: "8px 2px 10px", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: on ? INK : "rgba(242,237,228,0.45)" }}>{lab}{on && <span aria-hidden style={{ position: "absolute", left: 0, right: 0, bottom: 4, height: 2, background: TEAL_BRIGHT }} />}</button>);
                    })}
                  </div>
                  <div style={{ padding: "26px 4px" }}>
                    <div style={{ fontFamily: serif, fontSize: 19, fontWeight: 600, color: INK }}>Nothing from your people yet.</div>
                    <div style={{ marginTop: 6, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.12em", color: "rgba(242,237,228,0.55)" }}>FOLLOW MEMBERS TO BUILD THIS FEED</div>
                    <button onClick={() => switchFeedMode("universal")} style={{ marginTop: 12, background: "transparent", border: 0, cursor: "pointer", padding: "8px 0", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: TEAL_BRIGHT }}>SEE EVERYONE — UNIVERSAL →</button>
                  </div>
                </>
              );
            }
            return (
              <>
                <div style={{ display: "flex", gap: 18, marginBottom: 4 }}>
                  {[["universal", "UNIVERSAL"], ["following", "FOLLOWING"]].map(([m, lab]) => {
                    const on = feedMode === m;
                    return (<button key={m} onClick={() => switchFeedMode(m)} aria-pressed={on} style={{ position: "relative", background: "transparent", border: 0, cursor: "pointer", padding: "8px 2px 10px", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: on ? INK : "rgba(242,237,228,0.45)" }}>{lab}{on && <span aria-hidden style={{ position: "absolute", left: 0, right: 0, bottom: 4, height: 2, background: TEAL_BRIGHT }} />}</button>);
                  })}
                </div>
                <div style={{ display: "flex", gap: 8, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.08em", flexWrap: "wrap", alignItems: "center" }}>
                  {filters.map((f) => {
                    const on = f.label === filter;
                    return (
                      <button key={f.label} onClick={() => setFilter(f.label)}
                        style={{ padding: "6px 12px", borderRadius: 999, background: on ? "rgba(10,197,168,0.16)" : "rgba(242,237,228,0.04)", color: on ? TEAL_BRIGHT : "rgba(242,237,228,0.6)", border: "1px solid " + (on ? "rgba(10,197,168,0.3)" : "rgba(242,237,228,0.08)"), cursor: "pointer", fontFamily: "inherit", fontSize: "inherit", letterSpacing: "inherit" }}>
                        {f.label}
                      </button>
                    );
                  })}
                  {myPostsOnly && (
                    <span style={{ marginLeft: "auto", padding: "5px 10px", borderRadius: 999, background: "rgba(10,197,168,0.12)", color: TEAL_BRIGHT, border: "1px solid rgba(10,197,168,0.3)", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.12em" }}>
                      MY POSTS ONLY · {feed.filter(p => p.isMe).length}
                    </span>
                  )}
                </div>
                {visible.length === 0
                  ? (
                    <div style={{ padding: "32px 4px", color: "rgba(242,237,228,0.55)", fontSize: 13, textAlign: "center" }}>
                      {myPostsOnly ? "You haven't posted yet. Tap New post to share something." : "Nothing in this filter yet."}
                    </div>
                  )
                  : visible.map((p, i) => <FeedItem key={p.id || i} p={p}
                      onEdit={(post) => { setEditingPost(post); setComposerOpen(true); }}
                      onDeleted={(id) => setFeed(prev => prev.filter(x => x.id !== id))}
                    />)}
              </>
            );
          })()}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <ChannelsCard channels={channels} meetups={meetups} />
        </div>
      </div>
      {chatTabs && <ChatWidget tabs={chatTabs} />}
      {careerToast && (
        <div role="status" style={{ position: "fixed", left: "50%", bottom: 26, transform: "translateX(-50%)", zIndex: 300, background: "#14110e", border: "1px solid rgba(122,167,220,0.4)", borderRadius: 8, padding: "10px 18px", color: "#f2ede4", fontFamily: "'JetBrains Mono', monospace", fontSize: 12, letterSpacing: "0.08em" }}>+25 · CAREER · SHAPE SCORE</div>
      )}
      {composerOpen && (
        <PostComposer
          me={ME}
          editing={editingPost}
          onCancel={() => { setComposerOpen(false); setEditingPost(null); }}
          onSubmit={(post) => {
            setComposerOpen(false);
            if (post._edited && editingPost) {
              // Optimistically replace the edited post in the feed
              const patched = post._patchedPost;
              setFeed(prev => prev.map(x => {
                if (x.id !== (editingPost.postId || editingPost.id)) return x;
                // Prefer the server's authoritative patched row (it reflects an
                // intentional clear as null), then the optimistic payload via an
                // explicit !== undefined check (not `||`, which drops '' / null
                // clears), then the old value.
                const pPhoto = patched ? (patched.photo_url ?? null) : undefined;
                const pVideo = patched ? ((patched.metrics && patched.metrics.video_url) ?? null) : undefined;
                const pBody = patched ? (patched.note ?? "") : undefined;
                const pMentions = patched
                  ? ((patched.metrics && Array.isArray(patched.metrics.mentions)) ? patched.metrics.mentions : [])
                  : undefined;
                return {
                  ...x,
                  body: pBody !== undefined ? pBody : (post.body !== undefined ? post.body : x.body),
                  photo: pPhoto !== undefined ? pPhoto : (post.photo !== undefined ? post.photo : x.photo),
                  video: pVideo !== undefined ? pVideo : (post.video !== undefined ? post.video : x.video),
                  mentions: pMentions !== undefined ? pMentions : x.mentions,
                  tag: post.tag !== undefined ? post.tag : x.tag,
                };
              }));
              setEditingPost(null);
              return;
            }
            setEditingPost(null);
            // Optimistic create
            setFeed(prev => [{ id: "me-" + Date.now(), isMe: true, isLive: false, who: ME.who, role: ME.role, time: "now", likes: 0, comments: 0, ...post }, ...prev]);
            // Persist to the live feed (best-effort; the optimistic post already shows).
            const metrics = {};
            if (post.tag) metrics.tags = [String(post.tag).toUpperCase()];
            if (Array.isArray(post.mentions) && post.mentions.length) metrics.mentions = post.mentions;
            if (post.video) { metrics.kind = 'video'; metrics.video_url = post.video; }
            const isMs = post.kind === 'milestone' && post.milestone;
            if (isMs) {
              // THE APPOINTMENTS (spec 2026-07-13): stamp always stored, detail
              // omitted when blank. The generic +5 is excluded server-side by
              // the award_community_post milestone guard.
              metrics.kind = 'milestone';
              metrics.stamp = post.milestone.stamp;
              if (post.milestone.detail) metrics.detail = post.milestone.detail;
            }
            fetch('/api/community/feed', {
              method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title: isMs ? post.milestone.headline : ((post.body || '').trim() || (post.photo ? 'Photo' : post.video ? 'Video' : 'Post')),
                note: isMs ? '' : (post.body || ''),
                activityType: isMs ? 'milestone' : (post.kind || 'workout'),
                privacy: 'community',
                photoUrl: post.photo || '',
                metrics: Object.keys(metrics).length ? metrics : undefined,
              }),
            }).then(async (r) => {
              if (!isMs || !r || !r.ok) return;
              // The +25 CAREER award — AWAITED on the real post id (idempotent
              // monthly dedupe; granted=false on a same-month duplicate, and
              // the chip shows ONLY on a real grant). A failed claim queues
              // for the open-time catch-up (mobile parity).
              try {
                const j = await r.json();
                const pid = j && j.post && j.post.id;
                // ⚠ The owner comes from the POST RESPONSE, not a second
                // lookup. The queue is owner-scoped, so a claim with no uid
                // cannot be queued at all — and if connectivity dropped between
                // this successful POST and a getUser() round-trip, the award
                // RPC would fail AND the retry would be refused, losing the
                // earned +25 outright. The row we just created already carries
                // author_id (the API inserts author_id: user.id and returns
                // .select().single()), so the owner is already in hand.
                const uid = j && j.post && j.post.author_id;
                if (pid) await claimCareerAward(pid, true, uid);
              } catch (e) {}
            }).catch(() => {});
          }}
        />
      )}
    </DashPage>
  );
}

function PostComposer({ me, onCancel, onSubmit, editing }) {
  const KINDS = [
    { value: "post", label: "Post", tag: "" },
    { value: "pr", label: "PR", tag: "STRENGTH" },
    { value: "workout", label: "Workout", tag: "STRENGTH" },
    { value: "run", label: "Run", tag: "RUNNING" },
    { value: "meal", label: "Meal", tag: "NUTRITION" },
    { value: "milestone", label: "Milestone", tag: "MILESTONE" },
    { value: "video", label: "Video", tag: "" },
  ];
  const ed = editing || null;
  const [kind, setKind] = React.useState(ed ? (ed.kind || ((ed.video || ed.videoUrl) ? "video" : "post")) : "post");
  const [body, setBody] = React.useState(ed ? (ed.body || "") : "");
  // THE APPOINTMENTS (spec 2026-07-13): a required headline + a canonical
  // stamp; the textarea becomes the optional one-line detail. Mobile parity.
  const [msHeadline, setMsHeadline] = React.useState("");
  const [msStamp, setMsStamp] = React.useState("milestone");
  const [tag, setTag] = React.useState(ed ? (ed.tag || "") : "");
  const [photoUrl, setPhotoUrl] = React.useState(ed ? (ed.photo || ed.photoUrl || "") : "");
  const [photoBusy, setPhotoBusy] = React.useState(false);
  const [videoUrl, setVideoUrl] = React.useState(ed ? (ed.video || ed.videoUrl || "") : "");
  const [videoBusy, setVideoBusy] = React.useState(false);
  const fileRef = React.useRef(null);
  const videoRef = React.useRef(null);
  const [tagged, setTagged] = React.useState(ed && Array.isArray(ed.mentions) ? ed.mentions : []); // [{ userId, name }]
  const [tagQuery, setTagQuery] = React.useState("");
  const [tagResults, setTagResults] = React.useState([]);
  const [tagLimited, setTagLimited] = React.useState(false);
  const [tagOpen, setTagOpen] = React.useState(false);
  React.useEffect(() => {
    if (!tagOpen) return;
    const cl = window.shapeDb && window.shapeDb.client;
    if (!cl || !cl.rpc) return;
    let on = true;
    // ⚠ SAME RULE HERE. A refusal must not read as "nobody by that name" — the
    // tag picker is how a member credits a training partner, so an empty list
    // silently drops a real person out of the post.
    // ⚠ AND IT IS DEBOUNCED LIKE ITS SIBLING (SendPostModal, 220ms). This effect
    // fired one RPC PER KEYSTROKE, so the caller that generates the most search
    // load was the only one spending it a character at a time — a dozen requests
    // to type one name. That is what a per-member ceiling would have refused first.
    const id = setTimeout(() => {
      cl.rpc("search_members", { p_q: tagQuery || "" }).then((r) => {
        if (!on || !r) return;
        // ⚠ CLEAR THE RESULTS ON A REFUSAL. Leaving the PREVIOUS query's people in
        // place under the NEW query text is worse than the empty list this change
        // set out to fix: an empty list says "nobody", stale rows say "THIS person"
        // — and tagging one credits the wrong account on a public post.
        if (r.error) { setTagLimited(r.error.code === "PT429"); setTagResults([]); return; }
        setTagLimited(false);
        setTagResults((r.data || []).map((m) => ({ userId: m.id, name: m.full_name || "Member" })));
      }).catch((e) => { if (on) { setTagLimited(!!(e && e.code === "PT429")); setTagResults([]); } });
    }, 220);
    return () => { on = false; clearTimeout(id); };
  }, [tagOpen, tagQuery]);
  const toggleTag = (m) => setTagged((prev) => prev.some((x) => x.userId === m.userId) ? prev.filter((x) => x.userId !== m.userId) : [...prev, m]);
  const canSubmit = (kind === "milestone"
    ? msHeadline.trim().length > 0
    : (body.trim().length > 0 || !!photoUrl || !!videoUrl || tagged.length > 0)) && !photoBusy && !videoBusy;
  const uploadPhoto = async (file) => {
    const client = window.shapeDb && window.shapeDb.client;
    if (!client) throw new Error("Not connected.");
    const { data: ures } = await client.auth.getUser();
    const user = ures && ures.user;
    if (!user) throw new Error("Sign in to add a photo.");
    const ext = (((file.type || "").split("/")[1]) || "jpg").replace(/[^a-z0-9]/gi, "") || "jpg";
    const path = user.id + "/" + Date.now() + "-" + Math.random().toString(36).slice(2, 7) + "." + ext;
    const { error } = await client.storage.from("community-photos").upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
    if (error) throw error;
    const { data } = client.storage.from("community-photos").getPublicUrl(path);
    return (data && data.publicUrl) || null;
  };
  const onPhotoFile = async (e) => {
    const file = e.target && e.target.files && e.target.files[0];
    if (e.target) e.target.value = "";
    if (!file) return;
    setPhotoBusy(true);
    try { const url = await uploadPhoto(file); if (url) setPhotoUrl(url); }
    catch (err) { alert((err && err.message) || "Could not upload photo."); }
    finally { setPhotoBusy(false); }
  };
  const uploadVideo = async (file) => {
    const client = window.shapeDb && window.shapeDb.client;
    if (!client) throw new Error("Not connected.");
    const { data: ures } = await client.auth.getUser();
    const user = ures && ures.user; if (!user) throw new Error("Sign in to add a video.");
    const ext = (((file.type || "").split("/")[1]) || "mp4").replace(/[^a-z0-9]/gi, "") || "mp4";
    const path = user.id + "/" + Date.now() + "-" + Math.random().toString(36).slice(2, 7) + "." + ext;
    const { error } = await client.storage.from("coach-media").upload(path, file, { contentType: file.type || "video/mp4", upsert: false });
    if (error) throw error;
    const { data } = client.storage.from("coach-media").getPublicUrl(path);
    return (data && data.publicUrl) || null;
  };
  const onVideoFile = async (e) => {
    const file = e.target && e.target.files && e.target.files[0];
    if (e.target) e.target.value = "";
    if (!file) return;
    setVideoBusy(true);
    try { const url = await uploadVideo(file); if (url) setVideoUrl(url); }
    catch (err) { alert((err && err.message) || "Could not upload video."); }
    finally { setVideoBusy(false); }
  };
  const submit = async () => {
    if (!canSubmit) return;
    const k = KINDS.find(x => x.value === kind) || KINDS[0];
    const postPayload = { kind, body: body.trim(), tag: tag.trim() || k.tag || undefined, photo: photoUrl || undefined, video: videoUrl || undefined, mentions: tagged.length ? tagged : undefined };
    if (kind === "milestone") {
      const st = DC_MILESTONE_STAMPS.includes(msStamp) ? msStamp : "milestone";
      postPayload.milestone = { headline: msHeadline.trim().slice(0, 80), stamp: st, detail: body.trim().slice(0, 140) };
      postPayload.body = postPayload.milestone.headline; // the optimistic card leads with the headline
    }
    if (ed) {
      // Edit mode: PATCH the existing post
      const patchMetrics = {};
      // Always send tags/mentions (null when empty) so the server merge removes a
      // cleared key — only set when non-empty, they could never be cleared on edit.
      patchMetrics.tags = postPayload.tag ? [String(postPayload.tag).toUpperCase()] : null;
      patchMetrics.mentions = (Array.isArray(postPayload.mentions) && postPayload.mentions.length) ? postPayload.mentions : null;
      if (videoUrl) { patchMetrics.kind = "video"; patchMetrics.video_url = videoUrl; }
      else if ((ed.video || ed.videoUrl) && !videoUrl) { patchMetrics.video_url = ""; }
      try {
        const res = await fetch("/api/community/feed", {
          method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ postId: ed.postId || ed.id, title: (postPayload.body || "").trim() || (postPayload.photo ? "Photo" : "Post"), note: postPayload.body || "", photoUrl: postPayload.photo || "", metrics: Object.keys(patchMetrics).length ? patchMetrics : undefined }),
        });
        if (!res.ok) throw new Error("edit_failed");
        const result = await res.json();
        onSubmit({ ...postPayload, _edited: true, _patchedPost: result.post });
      } catch (err) { try { window.alert("Could not save edit."); } catch (e2) {} }
    } else {
      onSubmit(postPayload);
    }
  };
  return (
    <div onClick={onCancel}
      role="dialog" aria-modal="true"
      style={{ position: "fixed", inset: 0, zIndex: 220, background: "rgba(10,10,8,0.78)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: "min(560px, 100%)", background: "#1f1a16", color: INK, border: "1px solid rgba(242,237,228,0.12)", borderRadius: 16, padding: 28, boxShadow: "0 40px 120px rgba(0,0,0,0.6)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.14em", color: TEAL_BRIGHT }}>{ed ? "EDIT POST" : "NEW POST"}</div>
            <div style={{ fontFamily: serif, fontSize: 22, letterSpacing: "-0.015em", marginTop: 4 }}>{me.who}</div>
            <div style={{ fontSize: 11.5, color: "rgba(242,237,228,0.55)", marginTop: 2 }}>{me.role}</div>
          </div>
          <button onClick={onCancel} aria-label="Close" style={{ background: "transparent", color: "rgba(242,237,228,0.6)", border: 0, fontSize: 24, padding: "0 6px", cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {KINDS.map(k => {
            const on = k.value === kind;
            return (
              <button key={k.value} onClick={() => setKind(k.value)} style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.1em",
                padding: "6px 12px", borderRadius: 999, cursor: "pointer",
                background: on ? "rgba(10,197,168,0.16)" : "rgba(242,237,228,0.04)",
                color: on ? TEAL_BRIGHT : "rgba(242,237,228,0.7)",
                border: "1px solid " + (on ? "rgba(10,197,168,0.3)" : "rgba(242,237,228,0.08)"),
              }}>{k.label.toUpperCase()}</button>
            );
          })}
        </div>

        {kind === "milestone" && (
          <div style={{ marginBottom: 12 }}>
            <input
              value={msHeadline}
              onChange={e => setMsHeadline(e.target.value)}
              maxLength={80}
              placeholder="Headline — e.g. Promoted to Senior Engineer"
              style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 10, background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.12)", color: INK, fontFamily: sans, fontSize: 14, outline: "none" }}
            />
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
              {DC_MILESTONE_STAMPS.map(s => {
                const on = msStamp === s;
                return (
                  <button key={s} onClick={() => setMsStamp(s)} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.1em", padding: "5px 10px", borderRadius: 999, cursor: "pointer", background: on ? "rgba(122,167,220,0.16)" : "rgba(242,237,228,0.04)", color: on ? "#7aa7dc" : "rgba(242,237,228,0.7)", border: "1px solid " + (on ? "rgba(122,167,220,0.4)" : "rgba(242,237,228,0.08)") }}>{s.replace("_", " ").toUpperCase()}</button>
                );
              })}
            </div>
            <div style={{ marginTop: 8, fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.06em", color: "rgba(242,237,228,0.5)" }}>+25 Shape Score — once a month, whatever the visibility. No pay figures, ever.</div>
          </div>
        )}
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          autoFocus
          rows={kind === "milestone" ? 2 : 5}
          maxLength={kind === "milestone" ? 140 : undefined}
          placeholder={kind === "milestone" ? "One line on what it took (optional)…" : "What's on your mind? Share a PR, a workout, a meal, or a thought."}
          style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 10, background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.12)", color: INK, fontFamily: sans, fontSize: 14, lineHeight: 1.5, outline: "none", resize: "vertical" }}
        />

        <div style={{ marginTop: 10 }}>
          <input
            type="text"
            value={tag}
            onChange={e => setTag(e.target.value)}
            placeholder="Tag (optional) e.g. STRENGTH, RUNNING, NUTRITION"
            style={{ width: "100%", boxSizing: "border-box", padding: "10px 14px", borderRadius: 8, background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.12)", color: INK, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, letterSpacing: "0.08em", outline: "none" }}
          />
        </div>

        <input ref={fileRef} type="file" accept="image/*" onChange={onPhotoFile} style={{ display: "none" }} />
        <input ref={videoRef} type="file" accept="video/*" onChange={onVideoFile} style={{ display: "none" }} />
        {photoUrl ? (
          <div style={{ marginTop: 12, position: "relative", display: "inline-block" }}>
            <img src={photoUrl} alt="" style={{ display: "block", maxHeight: 180, maxWidth: "100%", borderRadius: 10, border: "1px solid rgba(242,237,228,0.14)" }} />
            <button onClick={() => setPhotoUrl("")} aria-label="Remove photo" style={{ position: "absolute", top: 8, right: 8, width: 26, height: 26, borderRadius: 999, background: "rgba(10,10,8,0.7)", color: INK, border: "1px solid rgba(242,237,228,0.2)", cursor: "pointer", fontSize: 15, lineHeight: 1 }}>×</button>
          </div>
        ) : (
          <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => fileRef.current && fileRef.current.click()} disabled={photoBusy} style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(242,237,228,0.04)", color: photoBusy ? "rgba(242,237,228,0.45)" : INK, border: "1px solid rgba(242,237,228,0.14)", padding: "9px 14px", borderRadius: 999, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.08em", cursor: photoBusy ? "default" : "pointer" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="M21 16l-5-5L5 19"/></svg>
              {photoBusy ? "UPLOADING…" : "ADD PHOTO"}
            </button>
            <button onClick={() => { setTagOpen(v => !v); setTagQuery(""); }} style={{ display: "inline-flex", alignItems: "center", gap: 8, background: tagOpen ? "rgba(10,197,168,0.14)" : "rgba(242,237,228,0.04)", color: tagOpen ? TEAL_BRIGHT : INK, border: "1px solid " + (tagOpen ? "rgba(10,197,168,0.3)" : "rgba(242,237,228,0.14)"), padding: "9px 14px", borderRadius: 999, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.08em", cursor: "pointer" }}>
              <span style={{ fontFamily: serif, fontWeight: 700, fontSize: 14, lineHeight: 1 }}>@</span> TAG PEOPLE{tagged.length ? ` · ${tagged.length}` : ""}
            </button>
          </div>
        )}
        {kind === "video" && (
          <div style={{ marginTop: 12 }}>
            {videoUrl ? (
              <div style={{ position: "relative" }}>
                <video src={videoUrl} controls playsInline preload="metadata" style={{ display: "block", width: "100%", maxHeight: 220, borderRadius: 10, background: "#000", border: "1px solid rgba(242,237,228,0.14)" }} />
                <button onClick={() => setVideoUrl("")} aria-label="Remove video" style={{ position: "absolute", top: 8, right: 8, width: 26, height: 26, borderRadius: 999, background: "rgba(10,10,8,0.7)", color: INK, border: "1px solid rgba(242,237,228,0.2)", cursor: "pointer", fontSize: 15, lineHeight: 1 }}>×</button>
              </div>
            ) : (
              <button onClick={() => videoRef.current && videoRef.current.click()} disabled={videoBusy} style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(242,237,228,0.04)", color: videoBusy ? "rgba(242,237,228,0.45)" : INK, border: "1px solid rgba(242,237,228,0.14)", padding: "9px 14px", borderRadius: 999, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.08em", cursor: videoBusy ? "default" : "pointer" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
                {videoBusy ? "UPLOADING…" : "ADD VIDEO"}
              </button>
            )}
          </div>
        )}
        {tagged.length > 0 && (
          <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {tagged.map((x) => <button key={x.userId} onClick={() => toggleTag(x)} style={{ display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 999, border: "1px solid rgba(10,197,168,0.4)", background: "rgba(10,197,168,0.12)", color: INK, padding: "5px 11px", fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, cursor: "pointer" }}>@{x.name} ✕</button>)}
          </div>
        )}
        {tagOpen && (
          <div style={{ marginTop: 10, border: "1px solid rgba(242,237,228,0.12)", borderRadius: 12, background: "rgba(242,237,228,0.02)", padding: 10 }}>
            <input autoFocus value={tagQuery} onChange={(e) => setTagQuery(e.target.value)} placeholder="Search members to tag…" style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 8, background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.12)", color: INK, fontFamily: sans, fontSize: 13.5, outline: "none", marginBottom: 8 }} />
            <div style={{ maxHeight: 180, overflowY: "auto" }}>
              {tagResults.map((m) => { const on = tagged.some((x) => x.userId === m.userId); return (
                <button key={m.userId} onClick={() => toggleTag(m)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "9px 10px", borderRadius: 8, border: "1px solid " + (on ? "rgba(10,197,168,0.4)" : "rgba(242,237,228,0.08)"), background: on ? "rgba(10,197,168,0.1)" : "transparent", color: INK, marginBottom: 6, cursor: "pointer" }}>
                  <span style={{ fontSize: 13.5, fontWeight: 500 }}>{m.name}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.08em", color: on ? TEAL_BRIGHT : "rgba(242,237,228,0.5)" }}>{on ? "TAGGED ✓" : "TAG"}</span>
                </button>
              ); })}
              {/* ⚠ The refusal is its OWN branch, ahead of the list — mirroring the send
                  picker above. Hanging it off `tagResults.length === 0` meant any state
                  that left rows behind could hide it; belt and braces, since the wrong
                  answer here is a wrongly-tagged member. */}
              {tagLimited ? (
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(242,237,228,0.45)", padding: "6px 2px" }}>Searching a little fast — give it a moment.</div>
              ) : tagResults.length === 0 ? (
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(242,237,228,0.45)", padding: "6px 2px" }}>{tagQuery.trim() ? "No matches." : "Type a name to find someone."}</div>
              ) : null}
            </div>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18 }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: "rgba(242,237,228,0.5)", letterSpacing: "0.08em" }}>{body.length} CHARS</span>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onCancel} style={{ background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.18)", padding: "10px 18px", borderRadius: 999, fontFamily: sans, fontSize: 13, cursor: "pointer" }}>Cancel</button>
            <button onClick={submit} disabled={!canSubmit} style={{ background: canSubmit ? TEAL : "rgba(242,237,228,0.06)", color: canSubmit ? PAPER : "rgba(242,237,228,0.4)", border: 0, padding: "10px 22px", borderRadius: 999, fontFamily: sans, fontSize: 13, fontWeight: 500, cursor: canSubmit ? "pointer" : "default" }}>{ed ? "Save" : "Post"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

if (typeof window !== "undefined") {
  window.CommunityPage = CommunityPage;
  window.PostComposer = PostComposer;
}
