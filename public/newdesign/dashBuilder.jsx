// Trainer Programs v2 — library + performance zones and the workout builder
// (dashboard-v2 spec step). Logic lives in dashBuilderCore.js (pure, tested);
// this file is UI. Templates persist to /api/coach/plans (detail.builder —
// the same store the mobile builder and marketplace share); assignment
// snapshots into client_workouts via /api/trainer/workout, which is what the
// client today-rail, calendar, and app already read. Signed out / API down:
// the demo templates render under the demo band, and drafts go to
// localStorage so the builder is fully usable in preview.
//
// Load order: pageShell → trainerDashboard → coachNav → dashSignals →
// dashData → dashToday → dashClient (DashWorkoutCard) → dashBuilderCore →
// this file.

const DBU_INK50 = "rgba(242,237,228,0.55)";
const DBU_MONO = "'JetBrains Mono', monospace";
const DBU_RUST = "#c0533b";

function dbuBtn(primary, c) {
  const col = c || "#2ee0c4";
  return primary
    ? { fontFamily: DBU_MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#06231f", background: col, border: 0, borderRadius: 4, padding: "8px 13px", cursor: "pointer" }
    : { fontFamily: DBU_MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(242,237,228,0.7)", background: "transparent", border: "1px solid rgba(242,237,228,0.18)", borderRadius: 4, padding: "8px 13px", cursor: "pointer" };
}
const dbuField = { boxSizing: "border-box", padding: "7px 9px", borderRadius: 4, border: "1px solid rgba(242,237,228,0.16)", background: "rgba(242,237,228,0.04)", color: "#f2ede4", fontFamily: "'Space Grotesk', sans-serif", fontSize: 12.5, outline: "none" };
const dbuLabel = { fontFamily: DBU_MONO, fontSize: 7.5, letterSpacing: "0.1em", textTransform: "uppercase", color: DBU_INK50, display: "block", marginBottom: 3 };

function dbuGoalTag(key) {
  return DashBuilder.GOAL_TAGS.find((g) => g.key === key) || DashBuilder.GOAL_TAGS[1];
}

// ── Template persistence (live API ⇄ localStorage drafts) ───────────────────
const DBU_DRAFT_KEY = "shape.dashBuilderDrafts";
function dbuReadDrafts() {
  try { return JSON.parse(localStorage.getItem(DBU_DRAFT_KEY) || "{}"); } catch (e) { return {}; }
}
function dbuWriteDraft(id, name, doc) {
  try {
    const all = dbuReadDrafts();
    all[id] = { name, doc, at: Date.now() };
    localStorage.setItem(DBU_DRAFT_KEY, JSON.stringify(all));
  } catch (e) {}
}

// ── Exercise picker popover ──────────────────────────────────────────────────
function DbuExercisePicker({ onPick, onClose }) {
  const [q, setQ] = React.useState("");
  const results = DashBuilder.searchExercises(q);
  return (
    <div style={{ position: "absolute", zIndex: 60, top: "100%", left: 0, marginTop: 6, width: 340, background: "#14110e", border: "1px solid rgba(242,237,228,0.16)", borderRadius: 8, boxShadow: "0 18px 48px rgba(0,0,0,0.5)", padding: 10 }}>
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") onClose(); }} placeholder="Search exercises, muscles, equipment…" style={{ ...dbuField, width: "100%", marginBottom: 8 }} />
      <div style={{ maxHeight: 260, overflowY: "auto" }}>
        {results.map((ex) => (
          <button key={ex.id} onClick={() => onPick(ex)} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, width: "100%", textAlign: "left", background: "transparent", border: 0, borderTop: "1px solid rgba(242,237,228,0.05)", padding: "8px 4px", cursor: "pointer", color: "#f2ede4" }}>
            <span style={{ fontSize: 12.5, fontWeight: 500 }}>{ex.name}</span>
            <span style={{ fontFamily: DBU_MONO, fontSize: 8.5, letterSpacing: "0.06em", textTransform: "uppercase", color: DBU_INK50 }}>{ex.muscle} · {ex.equipment}</span>
          </button>
        ))}
        {!results.length && <div style={{ fontSize: 12, color: DBU_INK50, padding: 8 }}>No match — try a muscle or equipment name.</div>}
      </div>
    </div>
  );
}

// ── Exercise row editor ──────────────────────────────────────────────────────
function DbuRow({ row, label, onChange, onRemove, onMove }) {
  const set = (k, v) => onChange({ ...row, [k]: v });
  const cycleGroup = () => {
    const order = [null, "A", "B", "C"];
    set("group", order[(order.indexOf(row.group) + 1) % order.length]);
  };
  const prog = row.progression;
  return (
    <div style={{ border: "1px solid rgba(242,237,228,0.08)", borderLeft: "3px solid " + (row.group ? "#2ee0c4" : "rgba(242,237,228,0.16)"), borderRadius: 4, padding: "9px 11px", marginBottom: 7, background: "rgba(242,237,228,0.02)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
        <button onClick={cycleGroup} title="Superset group — adjacent rows with the same letter pair as A1/A2" style={{ ...dbuBtn(false), padding: "4px 8px", color: row.group ? "#2ee0c4" : DBU_INK50, borderColor: row.group ? "rgba(46,224,196,0.4)" : "rgba(242,237,228,0.18)" }}>{label}</button>
        <span style={{ flex: 1, fontSize: 13.5, fontWeight: 500, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.name}<span style={{ fontFamily: DBU_MONO, fontSize: 8.5, color: DBU_INK50, marginLeft: 8 }}>{row.muscle} · {row.equipment}</span></span>
        <button onClick={() => onMove(-1)} aria-label="Move up" style={{ ...dbuBtn(false), padding: "4px 7px" }}>▲</button>
        <button onClick={() => onMove(1)} aria-label="Move down" style={{ ...dbuBtn(false), padding: "4px 7px" }}>▼</button>
        <button onClick={onRemove} aria-label="Remove exercise" style={{ ...dbuBtn(false), padding: "4px 8px", color: "#e0644b", borderColor: "rgba(224,100,75,0.4)" }}>×</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "64px 84px 110px 76px 84px 84px", gap: 8 }}>
        <div><span style={dbuLabel}>Sets</span><input type="number" min="1" value={row.sets} onChange={(e) => set("sets", Math.max(1, Number(e.target.value) || 1))} style={{ ...dbuField, width: "100%" }} /></div>
        <div><span style={dbuLabel}>Reps</span><input value={row.reps} onChange={(e) => set("reps", e.target.value)} style={{ ...dbuField, width: "100%" }} /></div>
        <div>
          <span style={dbuLabel}>Load · {row.loadType === "pct" ? "%1RM" : row.loadType === "rpe" ? "RPE" : "kg"}</span>
          <div style={{ display: "flex", gap: 4 }}>
            <input type="number" value={row.load} onChange={(e) => set("load", Number(e.target.value) || 0)} style={{ ...dbuField, width: 54 }} />
            <select value={row.loadType} onChange={(e) => set("loadType", e.target.value)} style={{ ...dbuField, width: 52, padding: "7px 4px" }}>
              <option value="kg">kg</option><option value="pct">%</option><option value="rpe">RPE</option>
            </select>
          </div>
        </div>
        <div><span style={dbuLabel}>Tempo</span><input value={row.tempo} onChange={(e) => set("tempo", e.target.value)} placeholder="31X1" style={{ ...dbuField, width: "100%" }} /></div>
        <div><span style={dbuLabel}>Rest</span><input value={row.rest} onChange={(e) => set("rest", e.target.value)} placeholder="90s" style={{ ...dbuField, width: "100%" }} /></div>
        <div>
          <span style={dbuLabel}>Progress</span>
          <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: prog ? "#2ee0c4" : DBU_INK50, cursor: "pointer", paddingTop: 6 }}>
            <input type="checkbox" checked={!!prog} onChange={(e) => set("progression", e.target.checked ? { rule: "all-reps", incKg: row.loadType === "kg" ? 2.5 : undefined, incPct: row.loadType === "pct" ? 2.5 : undefined, incRpe: row.loadType === "rpe" ? 0.5 : undefined } : null)} />
            auto
          </label>
        </div>
      </div>
      {prog && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 7 }}>
          <span style={{ fontFamily: DBU_MONO, fontSize: 8.5, letterSpacing: "0.06em", color: "#2ee0c4" }}>IF ALL REPS HIT → +</span>
          <input type="number" step="0.5" value={prog.incKg ?? prog.incPct ?? prog.incRpe ?? 0}
            onChange={(e) => {
              const v = Number(e.target.value) || 0;
              set("progression", { rule: "all-reps", incKg: row.loadType === "kg" ? v : undefined, incPct: row.loadType === "pct" ? v : undefined, incRpe: row.loadType === "rpe" ? v : undefined });
            }} style={{ ...dbuField, width: 64 }} />
          <span style={{ fontFamily: DBU_MONO, fontSize: 8.5, color: DBU_INK50 }}>{row.loadType === "pct" ? "% next week" : row.loadType === "rpe" ? "RPE next week" : "kg next week"}</span>
        </div>
      )}
      <div style={{ marginTop: 7 }}>
        <span style={dbuLabel}>Cue · renders on the client's card exactly as typed</span>
        <input value={row.cue} onChange={(e) => set("cue", e.target.value)} placeholder='e.g. "brace before the walkout"' style={{ ...dbuField, width: "100%" }} />
      </div>
    </div>
  );
}

// ── Day editor (right pane) ──────────────────────────────────────────────────
function DbuDayEditor({ day, onChange, playlists }) {
  const [pickerFor, setPickerFor] = React.useState(null); // block index
  const labels = DashBuilder.rowLabels(day);
  let labelIdx = 0;
  const setBlock = (bi, next) => onChange({ ...day, blocks: day.blocks.map((b, i) => (i === bi ? next : b)) });
  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <span style={dbuLabel}>Day name</span>
          <input value={day.name} onChange={(e) => onChange({ ...day, name: e.target.value })} style={{ ...dbuField, width: "100%", fontSize: 14 }} />
        </div>
        <div>
          <span style={dbuLabel}>Shape Radio playlist · chips on the client card</span>
          <select value={day.playlist ? day.playlist.name : ""} onChange={(e) => {
            const p = playlists.find((x) => x.name === e.target.value);
            onChange({ ...day, playlist: p ? { name: p.name, meta: p.meta || "" } : null });
          }} style={{ ...dbuField, minWidth: 220 }}>
            <option value="">No playlist</option>
            {playlists.map((p) => <option key={p.name} value={p.name}>{p.name}{p.meta ? " · " + p.meta : ""}</option>)}
          </select>
        </div>
      </div>
      {day.blocks.map((block, bi) => (
        <div key={bi} style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
            <select value={block.kind} onChange={(e) => setBlock(bi, { ...block, kind: e.target.value })} style={{ ...dbuField, fontFamily: DBU_MONO, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.1em", color: DBU_RUST, padding: "5px 7px" }}>
              {DashBuilder.BLOCK_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
            </select>
            <div style={{ flex: 1, height: 2, background: "linear-gradient(90deg, " + DBU_RUST + ", rgba(192,83,59,0.2) 45%, transparent 85%)" }} />
            {day.blocks.length > 1 && <button onClick={() => onChange({ ...day, blocks: day.blocks.filter((_, i) => i !== bi) })} style={{ ...dbuBtn(false), padding: "4px 8px", color: "#e0644b", borderColor: "rgba(224,100,75,0.4)" }}>Remove block</button>}
          </div>
          {block.rows.map((row, ri) => {
            const label = labels[labelIdx]; labelIdx += 1;
            return (
              <DbuRow key={row.id} row={row} label={label}
                onChange={(next) => setBlock(bi, { ...block, rows: block.rows.map((r, i) => (i === ri ? next : r)) })}
                onRemove={() => setBlock(bi, { ...block, rows: block.rows.filter((_, i) => i !== ri) })}
                onMove={(dir) => {
                  const rows = [...block.rows];
                  const j = ri + dir;
                  if (j < 0 || j >= rows.length) return;
                  [rows[ri], rows[j]] = [rows[j], rows[ri]];
                  setBlock(bi, { ...block, rows });
                }} />
            );
          })}
          <div style={{ position: "relative", display: "inline-block" }}>
            <button onClick={() => setPickerFor(pickerFor === bi ? null : bi)} style={dbuBtn(false)}>+ Exercise</button>
            {pickerFor === bi && (
              <DbuExercisePicker
                onPick={(ex) => { setBlock(bi, { ...block, rows: [...block.rows, DashBuilder.newRow(ex)] }); setPickerFor(null); }}
                onClose={() => setPickerFor(null)} />
            )}
          </div>
        </div>
      ))}
      <button onClick={() => onChange({ ...day, blocks: [...day.blocks, { kind: "accessory", rows: [] }] })} style={{ ...dbuBtn(false), marginTop: 2 }}>+ Block</button>
    </div>
  );
}

// ── Assign modal — multi-client + start date; marks the programming queue ───
function DbuAssignModal({ template, doc, clients, queue, live, onClose }) {
  const [picked, setPicked] = React.useState({});
  const [startDate, setStartDate] = React.useState(() => {
    const d = new Date(); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); // next Monday
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  });
  const [state, setState] = React.useState("");
  // ⚠ The guardrail's REASON, kept. A 409 is the gate holding the week and it
  // carries the sentence the coach has to act on ("this is a 40% jump on
  // her last four weeks"); a fixed "try again" is advice that can never work,
  // because retrying an unchanged week returns the same 409 forever.
  const [errMsg, setErrMsg] = React.useState("");
  const queueState = (id) => { const q = (queue || []).find((r) => r.client.profile.id === id); return q ? q.state : null; };
  const dayCount = doc.weeks.reduce((s, w) => s + w.days.length, 0);
  const ids = Object.keys(picked).filter((k) => picked[k]);

  const assign = async () => {
    if (!ids.length || state === "working" || state === "done") return;
    setState("working");
    setErrMsg("");
    const rows = DashBuilder.buildAssignmentRows(doc, { id: template.id, name: template.name }, startDate);
    // Weeks publish one at a time, so a failure partway through leaves the
    // earlier weeks LIVE. Counting them is the difference between "nothing
    // happened" and "three weeks landed and week four was held" — and only the
    // second is true.
    let landed = 0;
    let totalWeeks = 0;
    try {
      if (live) {
        // ⚠ ONE PUBLISH PER WEEK, not per session. The boundary evaluates and
        // replaces a whole client-week, so sending sessions one at a time
        // republishes the same week once per session — ~36 publishes and ~36
        // telemetry rows for a 12-week program, which skews §10.2's flag-rate
        // denominators by counting one authoring act as 36. Grouping is in
        // dashBuilderCore (pure + tested) because a session bucketed into the
        // wrong week is judged against the wrong load and lands in a replace
        // that clears a week it was never part of.
        const weekGroups = DashBuilder.groupAssignmentWeeks(rows);
        totalWeeks = weekGroups.length;
        for (const wk of weekGroups) {
          const res = await fetch("/api/trainer/workout", {
            method: "POST", credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              clientIds: ids,
              sessions: wk.rows.map((row) => ({
                title: row.title, description: template.name, kind: "template",
                scheduledDate: row.scheduledDate, payload: row.payload,
              })),
            }),
          });
          // A 409 is the progression guardrail HOLDING the week, not a fault —
          // it carries the reason in `error`, and throwing "HTTP 409" would
          // strip exactly the sentence the coach needs to act on.
          if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            throw new Error(d.error || ("HTTP " + res.status));
          }
          landed += 1;
        }
      }
      // Plan written → those clients leave the programming queue for this week.
      try {
        const m = new Date(); m.setHours(0, 0, 0, 0); m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
        const key = "shape.dashQueueDone." + m.getFullYear() + "-" + String(m.getMonth() + 1).padStart(2, "0") + "-" + String(m.getDate()).padStart(2, "0");
        const done = new Set(JSON.parse(localStorage.getItem(key) || "[]"));
        ids.forEach((id) => done.add(id));
        localStorage.setItem(key, JSON.stringify([...done]));
      } catch (e) {}
      setState("done");
      setTimeout(onClose, 1100);
    } catch (e) {
      const reason = (e && e.message ? String(e.message) : "").trim();
      // Name what actually landed. Silence here reads as "nothing was written",
      // and the coach would re-assign the whole program on top of the weeks that
      // already published.
      const partial = landed > 0
        ? "First " + landed + " of " + totalWeeks + " week" + (totalWeeks === 1 ? "" : "s") + " published. "
        : "";
      setErrMsg(partial + (reason || "Couldn't assign — try again."));
      setState("error");
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 250 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(10,10,8,0.65)", backdropFilter: "blur(3px)" }} />
      <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "min(460px, 94vw)", maxHeight: "86vh", overflowY: "auto", background: "#14110e", border: "1px solid rgba(242,237,228,0.14)", borderRadius: 10, padding: 22, color: "#f2ede4", fontFamily: "'Space Grotesk', sans-serif" }}>
        <div style={{ fontFamily: DBU_MONO, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: DBU_RUST }}>Assign · {template.name}</div>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 23, margin: "6px 0 4px" }}>Put clients on it.</div>
        <div style={{ fontSize: 12, color: DBU_INK50, marginBottom: 14 }}>{doc.weeks.length} week{doc.weeks.length === 1 ? "" : "s"} · {dayCount} days · snapshot v{doc.version} — your later template edits won't change what they get.</div>
        <span style={dbuLabel}>Start date</span>
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ ...dbuField, marginBottom: 12 }} />
        <span style={dbuLabel}>Clients</span>
        <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid rgba(242,237,228,0.08)", borderRadius: 6, padding: "2px 10px", marginBottom: 14 }}>
          {clients.map((c) => {
            const id = c.profile.id;
            const qs = queueState(id);
            return (
              <label key={id} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 10, alignItems: "center", padding: "8px 0", borderTop: "1px solid rgba(242,237,228,0.05)", cursor: "pointer" }}>
                <input type="checkbox" checked={!!picked[id]} onChange={(e) => setPicked({ ...picked, [id]: e.target.checked })} />
                <span style={{ fontSize: 13 }}>{c.profile.name}</span>
                {qs && <DashPill c={qs === "ready" ? "#2ee0c4" : "#d8a23a"}>{qs === "ready" ? "Ready" : "Awaiting check-in"}</DashPill>}
              </label>
            );
          })}
          {!clients.length && <div style={{ fontSize: 12, color: DBU_INK50, padding: 8 }}>No clients loaded.</div>}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button onClick={assign} disabled={!ids.length || state === "working"} style={{ ...dbuBtn(true, DBU_RUST), color: "#fff", padding: "11px 18px", opacity: !ids.length || state === "working" ? 0.6 : 1 }}>
            {state === "working" ? "Assigning…" : state === "done" ? "Assigned ✓" : "Publish to " + (ids.length || 0) + " client" + (ids.length === 1 ? "" : "s")}
          </button>
          <button onClick={onClose} style={dbuBtn(false)}>Cancel</button>
          {!live && <span style={{ fontFamily: DBU_MONO, fontSize: 8.5, color: DBU_INK50 }}>DEMO · marks the queue only</span>}
        </div>
        {state === "error" && (
          // A guardrail reason is a SENTENCE, so it gets a line to be read on —
          // out of the button row, where a long one would wrap the actions apart.
          // role=alert because this is the one thing on the screen the coach must
          // not miss.
          <div role="alert" style={{ marginTop: 12, borderLeft: "3px solid " + DBU_RUST, paddingLeft: 11 }}>
            <div style={{ fontFamily: DBU_MONO, fontSize: 8.5, letterSpacing: "0.16em", textTransform: "uppercase", color: DBU_RUST }}>Publish stopped</div>
            <div style={{ fontSize: 12.5, lineHeight: 1.45, color: "#f2ede4", marginTop: 3 }}>{errMsg}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── The builder (tree left · day editor right · always-on client preview) ───
function DbuBuilder({ template, clients, queue, live, playlists, onBack, onSaved }) {
  const [name, setName] = React.useState(template.name);
  const [doc, setDoc] = React.useState(() => JSON.parse(JSON.stringify(template.detail.builder)));
  const [sel, setSel] = React.useState({ w: 0, d: 0 });
  const [preview, setPreview] = React.useState(true);
  const [saveState, setSaveState] = React.useState("saved");
  const [assigning, setAssigning] = React.useState(false);
  const idRef = React.useRef(template.id);
  const dragRef = React.useRef(null);

  // Autosave (debounced): live → /api/coach/plans, else localStorage drafts.
  React.useEffect(() => {
    setSaveState("dirty");
    const t = setTimeout(async () => {
      setSaveState("saving");
      try {
        if (live) {
          if (idRef.current && !String(idRef.current).startsWith("demo-")) {
            const res = await fetch("/api/coach/plans", { method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: idRef.current, name, detail: { ...(template.detail || {}), builder: doc } }) });
            if (!res.ok) throw new Error("save failed");
          } else {
            const res = await fetch("/api/coach/plans", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "program", name, meta: doc.weeks.length + " weeks", detail: { builder: doc } }) });
            const d = await res.json();
            if (d && d.plan && d.plan.id) idRef.current = d.plan.id;
            else if (d && d.id) idRef.current = d.id;
          }
        } else {
          dbuWriteDraft(idRef.current || "draft-" + Date.now().toString(36), name, doc);
        }
        setSaveState("saved");
        onSaved && onSaved({ id: idRef.current, name, doc });
      } catch (e) { setSaveState("error"); }
    }, 1200);
    return () => clearTimeout(t);
  }, [doc, name]);

  const week = doc.weeks[sel.w];
  const day = week && week.days[sel.d];
  const setWeeks = (weeks) => setDoc({ ...doc, weeks });
  const setDay = (next) => setWeeks(doc.weeks.map((w, wi) => (wi === sel.w ? { ...w, days: w.days.map((d, di) => (di === sel.d ? next : d)) } : w)));

  const duplicateWeek = (wi) => {
    const next = DashBuilder.applyProgression(doc.weeks[wi]);
    setWeeks([...doc.weeks.slice(0, wi + 1), next, ...doc.weeks.slice(wi + 1)]);
  };
  const toggleDeload = (wi) => {
    const w = doc.weeks[wi];
    if (w.deload) setWeeks(doc.weeks.map((x, i) => (i === wi ? { ...x, deload: false } : x))); // unflag; sets stay as edited
    else setWeeks(doc.weeks.map((x, i) => (i === wi ? DashBuilder.deloadWeek(x) : x)));
  };
  const moveDay = (wi, di, to) => {
    if (to < 0 || to >= doc.weeks[wi].days.length) return;
    const days = [...doc.weeks[wi].days];
    const [d] = days.splice(di, 1);
    days.splice(to, 0, d);
    setWeeks(doc.weeks.map((w, i) => (i === wi ? { ...w, days } : w)));
    if (sel.w === wi && sel.d === di) setSel({ w: wi, d: to });
  };

  const previewCard = day ? DashBuilder.dayToClientCard(day, { coach: "you" }) : null;
  const saveLabel = saveState === "saving" ? "Saving…" : saveState === "dirty" ? "Unsaved edits…" : saveState === "error" ? "Save failed — retrying on next edit" : live ? "Saved" : "Draft saved locally";

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <button onClick={onBack} style={dbuBtn(false)}>← Library</button>
        <input value={name} onChange={(e) => setName(e.target.value)} style={{ ...dbuField, fontSize: 16, fontWeight: 500, minWidth: 240 }} />
        <DashPill c={dbuGoalTag(doc.goalTag).c}>{dbuGoalTag(doc.goalTag).label}</DashPill>
        <span style={{ fontFamily: DBU_MONO, fontSize: 8.5, color: DBU_INK50 }}>v{doc.version} · {saveLabel}</span>
        <div style={{ flex: 1 }} />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: DBU_MONO, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: preview ? "#2ee0c4" : DBU_INK50, cursor: "pointer" }}>
          <input type="checkbox" checked={preview} onChange={(e) => setPreview(e.target.checked)} /> Client preview
        </label>
        <button onClick={() => { setDoc({ ...doc, version: (doc.version || 1) + 1 }); }} title="Bump the template version — assignments stamp the version they were sent from" style={dbuBtn(false)}>Publish v{(doc.version || 1) + 1}</button>
        <button onClick={() => setAssigning(true)} style={{ ...dbuBtn(true, DBU_RUST), color: "#fff" }}>Assign to clients →</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: preview ? "230px 1fr 360px" : "230px 1fr", gap: 16, alignItems: "start" }}>
        {/* Tree */}
        <div className="dash-plate" style={{ "--dac": DBU_RUST, padding: "14px 14px" }}>
          {doc.weeks.map((w, wi) => (
            <div key={wi} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontFamily: DBU_MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: DBU_RUST }}>Week {wi + 1}</span>
                {w.deload && <DashPill c="#7bbf5a">Deload</DashPill>}
              </div>
              <div style={{ display: "flex", gap: 5, margin: "6px 0 7px" }}>
                <button onClick={() => duplicateWeek(wi)} title="Duplicate — progression rules auto-fill the new week" style={{ ...dbuBtn(false), padding: "3px 7px", fontSize: 8 }}>Duplicate</button>
                <button onClick={() => toggleDeload(wi)} title="Deload: −40% volume, then edit freely" style={{ ...dbuBtn(false), padding: "3px 7px", fontSize: 8, color: w.deload ? "#7bbf5a" : undefined }}>Deload</button>
                {doc.weeks.length > 1 && <button onClick={() => { setWeeks(doc.weeks.filter((_, i) => i !== wi)); setSel({ w: 0, d: 0 }); }} style={{ ...dbuBtn(false), padding: "3px 7px", fontSize: 8, color: "#e0644b" }}>×</button>}
              </div>
              {w.days.map((d, di) => {
                const on = sel.w === wi && sel.d === di;
                return (
                  <div key={di} draggable
                    onDragStart={() => { dragRef.current = { wi, di }; }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => { const f = dragRef.current; if (f && f.wi === wi) moveDay(wi, f.di, di); dragRef.current = null; }}
                    style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <button onClick={() => setSel({ w: wi, d: di })} style={{ flex: 1, textAlign: "left", cursor: "pointer", border: "1px solid " + (on ? DBU_RUST : "rgba(242,237,228,0.1)"), borderLeft: "3px solid " + (on ? DBU_RUST : "rgba(242,237,228,0.18)"), background: on ? "rgba(192,83,59,0.12)" : "transparent", color: "#f2ede4", borderRadius: 4, padding: "7px 9px", fontSize: 12.5 }}>
                      {d.name}
                      <span style={{ display: "block", fontFamily: DBU_MONO, fontSize: 8, color: DBU_INK50, marginTop: 2 }}>{d.blocks.reduce((s, b) => s + b.rows.length, 0)} moves{d.playlist ? " · ♪" : ""}</span>
                    </button>
                    <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <button onClick={() => moveDay(wi, di, di - 1)} aria-label="Move day up" style={{ ...dbuBtn(false), padding: "1px 5px", fontSize: 8 }}>▲</button>
                      <button onClick={() => moveDay(wi, di, di + 1)} aria-label="Move day down" style={{ ...dbuBtn(false), padding: "1px 5px", fontSize: 8 }}>▼</button>
                    </span>
                  </div>
                );
              })}
              <button onClick={() => { setWeeks(doc.weeks.map((x, i) => (i === wi ? { ...x, days: [...x.days, DashBuilder.newDay("Day " + (x.days.length + 1))] } : x))); }} style={{ ...dbuBtn(false), padding: "3px 8px", fontSize: 8 }}>+ Day</button>
            </div>
          ))}
          <button onClick={() => setWeeks([...doc.weeks, DashBuilder.newWeek()])} style={dbuBtn(false)}>+ Week</button>
        </div>

        {/* Day editor */}
        <div className="dash-plate dash-plate--tick" style={{ "--dac": DBU_RUST, paddingLeft: 24 }}>
          {day ? <DbuDayEditor day={day} onChange={setDay} playlists={playlists} /> : <div style={{ color: DBU_INK50, fontSize: 13 }}>Pick a day on the left.</div>}
        </div>

        {/* Client preview — the EXACT card the client dashboard renders */}
        {preview && (
          <div style={{ position: "sticky", top: 90 }}>
            <div style={{ fontFamily: DBU_MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: DBU_INK50, marginBottom: 8 }}>Client preview · their workout card</div>
            <div className="dash-plate dash-plate--tick dash-plate--bracket" style={{ "--dac": DBU_RUST, paddingLeft: 24 }}>
              <DashWorkoutCard workout={previewCard} interactive={false} maxRows={99} />
            </div>
          </div>
        )}
      </div>

      {assigning && <DbuAssignModal template={{ id: idRef.current, name }} doc={doc} clients={clients} queue={queue} live={live} onClose={() => setAssigning(false)} />}
    </div>
  );
}

// ── Performance zone ─────────────────────────────────────────────────────────
function DbuPerformance({ template, live }) {
  const perf = live ? null : DashBuilder.demoPerformance(template.id);
  if (!perf) {
    return <div style={{ fontSize: 12.5, color: DBU_INK50, lineHeight: 1.55 }}>Performance tracks from your first assignment of this template — subscriber, completion, and drop-off data appear once clients run it.</div>;
  }
  const max = Math.max(...perf.retention, 1);
  return (
    <div>
      <div style={{ display: "flex", gap: 22, marginBottom: 12 }}>
        <div><div style={{ fontFamily: "'Fraunces', serif", fontSize: 24, lineHeight: 1 }}>{perf.subscribers}</div><div style={{ fontFamily: DBU_MONO, fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: DBU_INK50, marginTop: 4 }}>Active subscribers</div></div>
        <div><div style={{ fontFamily: "'Fraunces', serif", fontSize: 24, lineHeight: 1 }}>{perf.completion}%</div><div style={{ fontFamily: DBU_MONO, fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: DBU_INK50, marginTop: 4 }}>Completion rate</div></div>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 64 }}>
        {perf.retention.map((v, i) => (
          <div key={i} title={"Week " + (i + 1) + " · " + v + "% retained"} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, height: "100%", justifyContent: "flex-end" }}>
            <div style={{ width: "100%", height: Math.round((v / max) * 100) + "%", background: v >= 70 ? "#2ee0c4" : v >= 50 ? "#d8a23a" : "#e0644b", borderRadius: 1, opacity: 0.85 }} />
            <span style={{ fontFamily: DBU_MONO, fontSize: 7, color: DBU_INK50 }}>W{i + 1}</span>
          </div>
        ))}
      </div>
      <div style={{ fontFamily: DBU_MONO, fontSize: 8.5, letterSpacing: "0.08em", color: DBU_INK50, marginTop: 8 }}>
        Per-week retention · drop-off at {(() => { let worst = 1, drop = 0; for (let i = 1; i < perf.retention.length; i++) { const d = perf.retention[i - 1] - perf.retention[i]; if (d > drop) { drop = d; worst = i + 1; } } return "week " + worst + " (−" + drop + " pts)"; })()}
      </div>
    </div>
  );
}

// ── The page ─────────────────────────────────────────────────────────────────
function TrainerProgramsPage() {
  const { clients, queue, today: live, source } = useDashboard("trainer");
  const [templates, setTemplates] = React.useState(null);
  const [view, setView] = React.useState(null); // null = library, else template being edited
  const [perfId, setPerfId] = React.useState(null);
  const [tagFilter, setTagFilter] = React.useState("all");
  const [playlists, setPlaylists] = React.useState([
    { name: "Lower Push — Peak", meta: "95–138 BPM · 14 tracks" },
    { name: "Pull Heavy", meta: "92–128 BPM · 12 tracks" },
    { name: "Tempo 32", meta: "165–172 BPM" },
  ]);
  const isLive = !!live;

  React.useEffect(() => {
    let on = true;
    (async () => {
      try {
        const res = await fetch("/api/coach/plans?kind=program", { credentials: "same-origin" });
        if (!res.ok) throw new Error();
        const d = await res.json();
        const rows = (d.plans || d || []).filter((p) => p && p.detail && p.detail.builder);
        if (on) setTemplates(rows.length ? rows : DashBuilder.demoTemplates());
      } catch (e) { if (on) setTemplates(DashBuilder.demoTemplates()); }
      try {
        const res = await fetch("/api/coach/soundtracks", { credentials: "same-origin" });
        if (!res.ok) throw new Error();
        const d = await res.json();
        const lists = (d.soundtracks || d.playlists || []).map((s) => ({ name: s.name, meta: [s.track_count ? s.track_count + " tracks" : null].filter(Boolean).join(" · ") }));
        if (on && lists.length) setPlaylists(lists);
      } catch (e) {}
    })();
    return () => { on = false; };
  }, []);

  const list = (templates || []).filter((t) => tagFilter === "all" || t.detail.builder.goalTag === tagFilter);
  const perfTemplate = (templates || []).find((t) => t.id === perfId) || list[0] || null;
  const [assignFor, setAssignFor] = React.useState(null);

  return (
    <React.Fragment>
      {source === "demo" && <DashDemoBand />}
      <DashPage
        tourHero="hero-programs"
        navItems={trainerNavItems("programs")}
        payoutCard={live
          ? { label: "MONTHLY · NET", amount: live.kpis.monthlyNetCents != null ? dashMoney(live.kpis.monthlyNetCents) : "—", sub: live.kpis.activeClients + " active subs · payouts connect soon" }
          : trainerPayoutCard}
        eyebrow={(templates ? templates.length : 0) + " TEMPLATES · VERSIONED"}
        title="Programs"
        subtitle={view ? "Editing — autosaves as you build; Assign publishes a snapshot to the client's today-rail." : "Your template library and how each one performs. Assign pre-fills the programming queue."}
      >
        {view ? (
          <DbuBuilder
            template={view}
            clients={clients}
            queue={queue}
            live={isLive}
            playlists={playlists}
            onBack={() => setView(null)}
            onSaved={({ id, name, doc }) => {
              setTemplates((prev) => (prev || []).map((t) => (t === view || t.id === id ? { ...t, id: id || t.id, name, detail: { ...(t.detail || {}), builder: doc } } : t)));
            }}
          />
        ) : (
          <React.Fragment>
            {/* Zone 1 — Library */}
            <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
              {[["all", "All"]].concat(DashBuilder.GOAL_TAGS.map((g) => [g.key, g.label])).map(([k, l]) => (
                <button key={k} onClick={() => setTagFilter(k)} style={{ ...dbuBtn(false), color: tagFilter === k ? "#2ee0c4" : "rgba(242,237,228,0.7)", borderColor: tagFilter === k ? "rgba(46,224,196,0.4)" : "rgba(242,237,228,0.18)" }}>{l}</button>
              ))}
              <div style={{ flex: 1 }} />
              <button onClick={() => setView({ id: null, name: "New program", detail: { builder: DashBuilder.newProgram("New program") } })} style={dbuBtn(true)}>+ New program</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 14, marginBottom: 22 }}>
              {templates == null && <div style={{ color: DBU_INK50, fontSize: 13 }}>Loading templates…</div>}
              {list.map((t) => {
                const b = t.detail.builder;
                const tag = dbuGoalTag(b.goalTag);
                const days = b.weeks.reduce((s, w) => s + w.days.length, 0);
                return (
                  <div key={t.id || t.name} className="dash-plate dash-plate--tick dash-plate--bracket" style={{ "--dac": tag.c, paddingLeft: 22 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                      <span className="dash-eyebrow" style={{ color: tag.c }}>{tag.label}</span>
                      <span style={{ fontFamily: DBU_MONO, fontSize: 8.5, color: DBU_INK50 }}>v{b.version}</span>
                    </div>
                    <div style={{ fontFamily: "'Fraunces', serif", fontSize: 21, letterSpacing: "-0.015em", margin: "7px 0 3px" }}>{t.name}</div>
                    <div style={{ fontFamily: DBU_MONO, fontSize: 9, color: DBU_INK50 }}>{b.weeks.length} week{b.weeks.length === 1 ? "" : "s"} · {days} day{days === 1 ? "" : "s"}</div>
                    <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                      <button onClick={() => setAssignFor(t)} style={{ ...dbuBtn(true, DBU_RUST), color: "#fff" }}>Assign to client</button>
                      <button onClick={() => setView(t)} style={dbuBtn(false)}>Edit</button>
                      <button onClick={() => setPerfId(t.id)} style={{ ...dbuBtn(false), color: perfTemplate && perfTemplate.id === t.id ? "#2ee0c4" : undefined }}>Performance</button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Zone 2 — Performance */}
            {perfTemplate && (
              <div className="dash-plate dash-plate--tick dash-plate--bracket" style={{ "--dac": "#2ee0c4", paddingLeft: 24, maxWidth: 720 }}>
                <div className="dash-eyebrow">Performance · {perfTemplate.name}</div>
                <div className="dash-ledger" style={{ marginTop: 9 }} />
                <DbuPerformance template={perfTemplate} live={isLive} />
              </div>
            )}
          </React.Fragment>
        )}
      </DashPage>
      {assignFor && (
        <DbuAssignModal
          template={{ id: assignFor.id, name: assignFor.name }}
          doc={assignFor.detail.builder}
          clients={clients} queue={queue} live={isLive}
          onClose={() => setAssignFor(null)} />
      )}
    </React.Fragment>
  );
}

Object.assign(window, { TrainerProgramsPage, DbuBuilder, DbuAssignModal, DbuPerformance });
