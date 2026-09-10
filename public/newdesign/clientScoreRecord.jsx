// The Record · the Leaderboard · How it works — the three Shape Score surfaces the
// Score page's own actions promised and never had (review 2026-09-09, C1/R17: "VIEW
// FULL LEDGER →" was href="#", and both header buttons had no handler at all).
//
// ⚠ NO NEW ROUTES AND NO MIGRATION. `/api/client/score-record` and `/api/leaderboard`
// have existed and been consumed by nothing; this file is the consumer. The Record is
// `bsScoreRecord`'s own output rendered as-is — the same aggregation twin the mobile
// app reads, so the two surfaces cannot disagree about a member's history.
//
// ⚠ AND EVERY EMPTY HERE IS HONEST, DELIBERATELY. The Score page this hangs off falls
// back to a fabricated 1,284-point breakdown and an invented ledger when its fetch
// fails; these panels never do. "You have not earned points yet", "we could not read
// it" and "you are not on the board" are three different sentences and are written as
// three different sentences.

const CSR_MONO = "'JetBrains Mono', monospace";
const CSR_DIM = "rgba(242,237,228,0.5)";
const CSR_RED = "#e0463c";
const CSR_RANGES = [["1w", "1W"], ["1m", "1M"], ["3m", "3M"], ["all", "ALL"]];
// ⚠ "week" IS A ROLLING WINDOW, NOT A CALENDAR WEEK. Both RPCs define it as
// `now() - interval '7 days'`, so early on a Tuesday it is mostly LAST week's activity
// — calling it "This week" describes a boundary the ranking does not use. "month" IS a
// calendar month (`date_trunc('month', now())`) and "all" is since 1970, so those two
// labels are accurate and stay.
const CSR_PERIODS = [["week", "Last 7 days"], ["month", "This month"], ["all", "All time"]];

function csrLabel(text) {
  return <div style={{ fontFamily: CSR_MONO, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: CSR_DIM }}>{text}</div>;
}
function csrNum(n) { return (Number(n) || 0).toLocaleString(); }
function csrSigned(n) {
  const v = Number(n) || 0;
  return (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toLocaleString();
}
function csrDay(iso) {
  // ⚠ PARSED AS LOCAL, NOT AS UTC. `new Date("2026-09-08")` is midnight UTC, which is
  // the PREVIOUS DAY for anyone west of it — a member in Los Angeles would have read
  // every row of their own history one day early.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso);
  if (isNaN(d.getTime())) return String(iso || "");
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

// ⚠ "NOT SIGNED IN" IS NOT "IT BROKE", AND NEITHER IS "NOT A MEMBER". Both routes
// answer a signed-out visitor with 401 (`requireMembership` / `currentUser`), and a
// signed-in NON-member with 402 — so a marketing visitor pressing these buttons on the
// demo Score page was told their record "couldn't be read just now" and invited to
// reload, which can never work. Three different answers, three different sentences.
//
// ⚠ AND A 2xx BODY IS NOT AUTOMATICALLY AN ANSWER. Accepting any parseable JSON as
// `ready` let a body that does not satisfy the route's contract — a truncated proxy
// response, a route rewritten, a gateway's own JSON error page — render through the
// panel's EMPTY branches: `{lifetime: 9}` drew "Nothing on the ledger yet", which is
// the exact empty-versus-unreadable distinction this reader exists to keep. Each
// caller says what its payload must contain, and a body that does not is unreadable.
function csrRead(url, shaped) {
  return fetch(url, { credentials: "same-origin" }).then(function (r) {
    if (r.status === 401) return { kind: "anon" };
    if (r.status === 402) return { kind: "gated" };
    if (!r.ok) return { kind: "error" };
    return r.json().then(function (d) {
      if (typeof shaped === "function" && !shaped(d)) return { kind: "error" };
      return { kind: "ready", data: d };
    }, function () { return { kind: "error" }; });
  }, function () { return { kind: "error" }; });
}
// `bsScoreRecord` fills every range key on every call, so a payload missing one is not
// a member with no history — it is a body that did not come from that function.
function csrRecordShaped(d) {
  if (!d || typeof d !== "object") return false;
  if (typeof d.lifetime !== "number" || !Array.isArray(d.history)) return false;
  if (!d.ranges || typeof d.ranges !== "object") return false;
  for (var i = 0; i < CSR_RANGES.length; i++) {
    var r = d.ranges[CSR_RANGES[i][0]];
    if (!r || typeof r !== "object" || !Array.isArray(r.series)) return false;
  }
  return true;
}
// `me` is legitimately null for an unranked member, so its ABSENCE is what fails and
// its null-ness does not. An explicit `"me" in d` check was here and is gone: with the
// key absent `d.me` is undefined, which the final line already refuses, so the check
// was provably a no-op — measured, when a mutation deleting it changed nothing.
function csrBoardShaped(d) {
  if (!d || typeof d !== "object") return false;
  if (!Array.isArray(d.entries)) return false;
  return d.me === null || typeof d.me === "object";
}
// The sentence each non-ready state gets. `null` means "this state renders data".
function csrStateNote(kind, what) {
  if (kind === "loading") return "Reading " + what + "…";
  if (kind === "anon") return "Sign in to see " + what + ".";
  if (kind === "gated") return "A Shape membership opens " + what + ".";
  if (kind === "error") return "Couldn't read " + what + " just now. Nothing has changed — reload to try again.";
  return null;
}

// A cumulative line. Written rather than reused because the shared `Sparkline`
// normalises against max alone and divides by `data.length - 1` — a flat series reads
// as a floor and a single point yields NaN, and both are ordinary for a new member.
// ⚠ THE GEOMETRY IS A PURE FUNCTION SO IT CAN BE DRIVEN. Everything that can be
// arithmetically wrong here — the one-point case, the flat series, a falling one —
// is decided in this function; the component only draws what it returns.
function csrLineGeometry(series, height, width) {
  const H = Number(height) || 90;
  const W = Number(width) || 600;
  const pts = (series || []).map((p) => Number(p && p.cumulative) || 0);
  if (!pts.length) return null;
  const lo = Math.min.apply(null, pts);
  const hi = Math.max.apply(null, pts);
  const span = hi - lo || 1;              // a flat series would otherwise divide by 0
  const step = pts.length > 1 ? W / (pts.length - 1) : 0;
  const xy = pts.map((v, i) => [
    // A single point has no span to lay out along, so it sits in the middle rather
    // than at x = NaN (`W / (length - 1)` with length 1).
    pts.length > 1 ? i * step : W / 2,
    H - ((v - lo) / span) * (H - 8) - 4,
  ]);
  const path = xy.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" ");
  return { W: W, H: H, path: path, fill: path + " L " + W + " " + H + " L 0 " + H + " Z", last: xy[xy.length - 1] };
}

function CsrLine({ series, height = 90 }) {
  const g = csrLineGeometry(series, height, 600);
  if (!g) return null;
  return (
    <svg viewBox={"0 0 " + g.W + " " + g.H} preserveAspectRatio="none" style={{ width: "100%", height: g.H, display: "block" }} aria-hidden="true">
      <path d={g.fill} fill="rgba(10,197,168,0.10)" stroke="none" />
      <path d={g.path} fill="none" stroke={TEAL_BRIGHT} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <circle cx={g.last[0]} cy={g.last[1]} r="3.5" fill={TEAL_BRIGHT} />
    </svg>
  );
}

function CsrBar({ label, value, max, tone }) {
  const pct = max > 0 ? Math.max(2, Math.round((Math.abs(value) / max) * 100)) : 0;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(96px, 150px) 1fr auto", gap: 12, alignItems: "center", padding: "7px 0" }}>
      <div style={{ fontSize: 12.5, color: "rgba(242,237,228,0.8)" }}>{label}</div>
      <div style={{ height: 6, borderRadius: 3, background: "rgba(242,237,228,0.07)", overflow: "hidden" }}>
        <div style={{ width: pct + "%", height: "100%", background: tone || TEAL_BRIGHT }} />
      </div>
      <div style={{ fontFamily: CSR_MONO, fontSize: 12, color: tone || TEAL_BRIGHT, fontVariantNumeric: "tabular-nums" }}>{csrSigned(value)}</div>
    </div>
  );
}

// ── The Record ───────────────────────────────────────────────────────────────
function ClientScoreRecord() {
  const [state, setState] = React.useState({ kind: "loading" });
  const [range, setRange] = React.useState("1m");
  React.useEffect(() => {
    let on = true;
    // ⚠ A FAILED READ IS NOT AN EMPTY LEDGER. Rendering zeroes here would tell a member
    // with a long history that they have earned nothing.
    csrRead("/api/client/score-record", csrRecordShaped).then((r) => { if (on) setState(r); });
    return () => { on = false; };
  }, []);

  const note = csrStateNote(state.kind, "your record");
  if (note) {
    return (
      <Card>
        {csrLabel("The record")}
        <div style={{ marginTop: 10, fontSize: 13, color: CSR_DIM }}>{note}</div>
      </Card>
    );
  }
  const rec = state.data || {};
  const rep = (rec.ranges && rec.ranges[range]) || null;
  const history = Array.isArray(rec.history) ? rec.history : [];
  if (!history.length) {
    return (
      <Card>
        {csrLabel("The record")}
        <div style={{ marginTop: 10, fontSize: 13.5, color: "rgba(242,237,228,0.7)", lineHeight: 1.55 }}>
          Nothing on the ledger yet. Your first logged workout, meal or habit opens this
          page — every point you earn is written here with the reason it was given.
        </div>
      </Card>
    );
  }
  const cats = (rep && rep.byCategory) || [];
  const catMax = cats.reduce((m, c) => Math.max(m, Math.abs(c.earned)), 0);
  const pens = (rep && rep.penalties) || [];
  const penMax = pens.reduce((m, p) => Math.max(m, Math.abs(p.total)), 0);
  return (
    <React.Fragment>
      <Card>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          {csrLabel("The record")}
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            {CSR_RANGES.map(([k, l]) => (
              <button key={k} type="button" onClick={() => setRange(k)} aria-pressed={range === k}
                style={{ fontFamily: CSR_MONO, fontSize: 10, letterSpacing: "0.1em", padding: "6px 10px", minHeight: 24, borderRadius: 4, cursor: "pointer",
                  border: "1px solid " + (range === k ? TEAL_BRIGHT : "rgba(242,237,228,0.18)"),
                  background: range === k ? "rgba(10,197,168,0.14)" : "transparent", color: range === k ? TEAL_BRIGHT : CSR_DIM }}>{l}</button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 26, flexWrap: "wrap", marginTop: 12 }}>
          <div>
            {csrLabel("Lifetime")}
            <div style={{ fontFamily: serif, fontSize: 30, color: INK, fontVariantNumeric: "tabular-nums" }}>{csrNum(rec.lifetime)}</div>
          </div>
          <div>
            {csrLabel("Earned")}
            <div style={{ fontFamily: CSR_MONO, fontSize: 18, color: TEAL_BRIGHT, fontVariantNumeric: "tabular-nums", marginTop: 6 }}>{csrSigned(rep ? rep.earned : 0)}</div>
          </div>
          <div>
            {csrLabel("Lost")}
            <div style={{ fontFamily: CSR_MONO, fontSize: 18, color: rep && rep.lost ? CSR_RED : CSR_DIM, fontVariantNumeric: "tabular-nums", marginTop: 6 }}>{rep && rep.lost ? "−" + csrNum(rep.lost) : "0"}</div>
          </div>
          <div>
            {csrLabel("Net")}
            <div style={{ fontFamily: CSR_MONO, fontSize: 18, color: INK, fontVariantNumeric: "tabular-nums", marginTop: 6 }}>{csrSigned(rep ? rep.net : 0)}</div>
          </div>
        </div>
        {rep && rep.series && rep.series.length
          ? <div style={{ marginTop: 14 }}><CsrLine series={rep.series} /></div>
          : <div style={{ marginTop: 12, fontSize: 12.5, color: CSR_DIM }}>No points moved in this window.</div>}
        {/* ⚠ THE STORE IS ABSENT ON PURPOSE, and the number would not reconcile without
            it: `bsScoreRecord` drops `store_redeem` rows, because a cap bought with
            points is spending rather than a fall in standing — the same exclusion
            score-derive and the roster's weekly reading make. */}
        <div style={{ marginTop: 10, fontSize: 11, color: CSR_DIM, lineHeight: 1.5 }}>
          Redemptions in the store aren't shown — spending points doesn't change what you earned.
        </div>
      </Card>

      {cats.length ? (
        <Card style={{ marginTop: 14 }}>
          {csrLabel("Where the points came from")}
          <div style={{ marginTop: 8 }}>
            {cats.map((c) => <CsrBar key={c.key} label={c.label} value={c.earned} max={catMax} />)}
          </div>
        </Card>
      ) : null}

      {pens.length ? (
        <Card style={{ marginTop: 14 }}>
          {csrLabel("What it cost you")}
          <div style={{ marginTop: 8 }}>
            {pens.map((p, i) => <CsrBar key={i} label={p.note} value={p.total} max={penMax} tone={CSR_RED} />)}
          </div>
        </Card>
      ) : null}

      <Card style={{ marginTop: 14 }}>
        {csrLabel("Every entry")}
        <div style={{ marginTop: 8 }}>
          {history.map((day) => (
            <div key={day.date} style={{ borderTop: "1px solid rgba(242,237,228,0.07)", paddingTop: 10, marginTop: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                <span style={{ fontFamily: CSR_MONO, fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: CSR_DIM }}>{csrDay(day.date)}</span>
                <span style={{ fontFamily: CSR_MONO, fontSize: 12, color: day.subtotal < 0 ? CSR_RED : TEAL_BRIGHT, fontVariantNumeric: "tabular-nums" }}>{csrSigned(day.subtotal)}</span>
              </div>
              {(day.rows || []).map((r, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "baseline", padding: "5px 0" }}>
                  <span style={{ fontSize: 13, color: "rgba(242,237,228,0.82)" }}>{r.note}</span>
                  <span style={{ fontFamily: CSR_MONO, fontSize: 12, color: r.isPenalty ? CSR_RED : TEAL_BRIGHT, fontVariantNumeric: "tabular-nums" }}>{csrSigned(r.delta)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </Card>
    </React.Fragment>
  );
}

// ── The Leaderboard ──────────────────────────────────────────────────────────
function ClientLeaderboard() {
  const [period, setPeriod] = React.useState("month");
  const [state, setState] = React.useState({ kind: "loading" });
  React.useEffect(() => {
    let on = true;
    setState({ kind: "loading" });
    csrRead("/api/leaderboard?period=" + encodeURIComponent(period) + "&limit=50", csrBoardShaped)
      .then((r) => { if (on) setState(r); });
    return () => { on = false; };
  }, [period]);

  const switcher = (
    <div style={{ display: "flex", gap: 6, marginLeft: "auto", flexWrap: "wrap" }}>
      {CSR_PERIODS.map(([k, l]) => (
        <button key={k} type="button" onClick={() => setPeriod(k)} aria-pressed={period === k}
          style={{ fontFamily: CSR_MONO, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", padding: "6px 10px", minHeight: 24, borderRadius: 4, cursor: "pointer",
            border: "1px solid " + (period === k ? TEAL_BRIGHT : "rgba(242,237,228,0.18)"),
            background: period === k ? "rgba(10,197,168,0.14)" : "transparent", color: period === k ? TEAL_BRIGHT : CSR_DIM }}>{l}</button>
      ))}
    </div>
  );
  const head = <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>{csrLabel("Leaderboard")}{switcher}</div>;

  const note = csrStateNote(state.kind, "the leaderboard");
  if (note) return <Card>{head}<div style={{ marginTop: 10, fontSize: 13, color: CSR_DIM }}>{note}</div></Card>;
  const data = state.data || {};
  const entries = Array.isArray(data.entries) ? data.entries : [];
  const me = data.me || null;
  return (
    <Card>
      {head}
      {/* ⚠ `me === null` HAS TWO CAUSES AND THIS COPY MUST NOT PICK ONE.
          `shape_leaderboard_me` filters `having sum(delta) > 0`, so a member who earned
          nothing in the window gets no row — and the RPC also drops anyone whose
          `client_privacy_prefs.leaderboard` is 'off'. An earlier draft told them to
          "turn it on in Settings", which is wrong twice: it asserts the opt-out as the
          cause, and NOTHING IN THIS REPOSITORY WRITES THAT KEY — not the website, not
          the app — so it is advice nobody can follow. It states the fact instead. */}
      {me
        ? <div style={{ marginTop: 12, display: "flex", gap: 20, flexWrap: "wrap", alignItems: "baseline" }}>
            <div>{csrLabel("Your rank")}<div style={{ fontFamily: serif, fontSize: 28, color: INK, fontVariantNumeric: "tabular-nums" }}>#{csrNum(me.rank)}</div></div>
            <div>{csrLabel("Of")}<div style={{ fontFamily: CSR_MONO, fontSize: 16, color: CSR_DIM, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>{csrNum(me.total)}</div></div>
            <div>{csrLabel("Your points")}<div style={{ fontFamily: CSR_MONO, fontSize: 16, color: TEAL_BRIGHT, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>{csrNum(me.points)}</div></div>
          </div>
        : <div style={{ marginTop: 10, fontSize: 12.5, color: CSR_DIM, lineHeight: 1.5 }}>
            You're not ranked in this window. The board counts points earned inside it —
            log something and you'll place.
          </div>}
      <div style={{ marginTop: 14 }}>
        {entries.length ? entries.map((e) => (
          <div key={e.userId} style={{ display: "grid", gridTemplateColumns: "44px 1fr auto", gap: 12, alignItems: "center", padding: "9px 6px", borderTop: "1px solid rgba(242,237,228,0.06)",
            background: e.isMe ? "rgba(10,197,168,0.07)" : "transparent", borderRadius: e.isMe ? 4 : 0 }}>
            <span style={{ fontFamily: CSR_MONO, fontSize: 12, color: e.rank <= 3 ? TEAL_BRIGHT : CSR_DIM, fontVariantNumeric: "tabular-nums" }}>#{csrNum(e.rank)}</span>
            <span style={{ fontSize: 13.5, color: e.isMe ? INK : "rgba(242,237,228,0.82)", fontWeight: e.isMe ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name || "A member"}{e.isMe ? " · you" : ""}</span>
            <span style={{ fontFamily: CSR_MONO, fontSize: 12.5, color: TEAL_BRIGHT, fontVariantNumeric: "tabular-nums" }}>{csrNum(e.points)}</span>
          </div>
        )) : <div style={{ fontSize: 12.5, color: CSR_DIM }}>Nobody has earned points in this window yet.</div>}
      </div>
    </Card>
  );
}

// ── How it works ─────────────────────────────────────────────────────────────
// Plain description of the ladder and the rules. ⚠ IT QUOTES NO NUMBER IT HAS NOT
// BEEN GIVEN: the tiers come from the caller (the Score page's own table, which the
// API's `current_tier` is matched against), and nothing here invents a per-action
// point value — those live in the SQL and would go stale the first time they changed.
function ClientScoreHowItWorks({ tiers, currentTier }) {
  const rows = Array.isArray(tiers) ? tiers : [];
  return (
    <React.Fragment>
      <Card>
        {csrLabel("How the Shape Score works")}
        <div style={{ marginTop: 10, fontSize: 13.5, lineHeight: 1.6, color: "rgba(242,237,228,0.82)" }}>
          Every logged workout, meal, habit and check-in adds points to one running
          total. It updates nightly. Missing something you committed to takes points
          off — the Record shows both sides, entry by entry.
        </div>
        <div style={{ marginTop: 10, fontSize: 12.5, lineHeight: 1.6, color: CSR_DIM }}>
          Your tier is high-water-marked: a bad month dents the number, but it never
          demotes you. Spending points in the store doesn't change your standing either.
        </div>
      </Card>
      <Card style={{ marginTop: 14 }}>
        {csrLabel("The ladder")}
        <div style={{ marginTop: 8 }}>
          {rows.map((t) => {
            const here = currentTier && t[0] === currentTier;
            return (
              <div key={t[0]} style={{ display: "grid", gridTemplateColumns: "minmax(70px, 100px) minmax(70px, 110px) 1fr", gap: 12, alignItems: "baseline", padding: "9px 6px",
                borderTop: "1px solid rgba(242,237,228,0.06)", background: here ? "rgba(10,197,168,0.07)" : "transparent", borderRadius: here ? 4 : 0 }}>
                <span style={{ fontFamily: serif, fontSize: 15, color: here ? TEAL_BRIGHT : INK }}>{t[0]}{here ? " ·" : ""}</span>
                <span style={{ fontFamily: CSR_MONO, fontSize: 11.5, color: CSR_DIM, fontVariantNumeric: "tabular-nums" }}>{t[2]}</span>
                <span style={{ fontSize: 12.5, color: "rgba(242,237,228,0.75)" }}>{t[3]}</span>
              </div>
            );
          })}
        </div>
      </Card>
    </React.Fragment>
  );
}

Object.assign(window, { ClientScoreRecord, ClientLeaderboard, ClientScoreHowItWorks, csrLineGeometry, csrStateNote, csrRecordShaped, csrBoardShaped });
