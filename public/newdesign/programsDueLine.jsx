// The Programs page's "who needs next week's program" line (owner decision A, 2026-11-05). Counts are
// pure (programsDue.js); this reads next week's published workouts of the coach's clients from
// /api/calendar (clientPlans=1, the Schedule's own read) and names each client, each name opening the
// Programs page with that client chosen for the assignment (dashRouteParam('client')). No "send"
// step: a program is live on the client's calendar the moment it is assigned.
//
// ProgramsDueLine({ role, clients, queue, live })
// Window globals, read at render time (no module system on the website).

function ProgramsDueLine({ role, clients, queue, live }) {
  const PD = window.ProgramsDue;
  const [plans, setPlans] = React.useState(undefined); // undefined loading · null unread · { plans, readable }
  const [open, setOpen] = React.useState(false);
  const week = PD ? PD.nextWeekOf(new Date()) : null;
  React.useEffect(() => {
    if (!PD || !live || !week) return undefined;
    let on = true;
    let tz = "";
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) {}
    const q = new URLSearchParams({ from: week.start, to: week.end, clientPlans: "1", role: "trainer" });
    if (tz) q.set("tz", tz);
    fetch("/api/calendar?" + q.toString(), { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (on) setPlans(j && Array.isArray(j.clientPlans) ? { plans: j.clientPlans, readable: j.clientPlansReadable !== false } : null); })
      .catch(() => { if (on) setPlans(null); });
    return () => { on = false; };
  }, [live, week && week.start]);
  if (!PD || !live) return null;
  const ink50 = "var(--sh-ink2, #a09b94)";
  const box = { border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.12)", borderRadius: 8, padding: "12px 14px", margin: "0 0 16px", fontSize: 13 };
  if (plans === undefined) return <div style={{ ...box, color: ink50 }}>Checking who has next week's program…</div>;
  const due = plans ? PD.programsDue({ clients, queue, plans: plans.plans, readable: plans.readable }) : null;
  if (!due) return <div role="status" style={{ ...box, color: ink50 }}>Couldn't read next week's calendar, so who still needs a program isn't shown.</div>;
  const href = (id) => (typeof dashLinkedTab === "function" ? dashLinkedTab("programs", role, { client: id }) : "#programs?client=" + encodeURIComponent(id));
  const tag = { checked: "Checked in", waiting: "Waiting on a check-in", unknown: "Check-in not read" };
  return (
    <div data-programs-due style={box}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <span><strong>{PD.dueLine(due)}</strong> <span style={{ color: ink50, fontSize: 12 }}>Week of {week.start}</span></span>
        {due.need.length > 0 && <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} style={{ background: "transparent", border: 0, color: "var(--sh-accent, #2ee0c4)", cursor: "pointer", fontSize: 12.5, padding: 0 }}>{open ? "Hide names" : "Show names"}</button>}
      </div>
      {open && (
        <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0", display: "flex", flexWrap: "wrap", gap: 8 }}>
          {due.need.map((c) => (
            <li key={c.id}>
              <a href={href(c.id)} title={"Choose a program for " + c.name} style={{ display: "inline-flex", gap: 6, alignItems: "baseline", border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.14)", borderRadius: 999, padding: "5px 11px", color: "var(--sh-ink, #f2ede4)", textDecoration: "none", fontSize: 12.5 }}>
                {c.name}<span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, letterSpacing: "0.08em", textTransform: "uppercase", color: ink50 }}>{tag[c.state]}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      <div style={{ marginTop: 8, fontSize: 11.5, color: ink50 }}>A program is live on the client's calendar as soon as you assign it.</div>
    </div>
  );
}

Object.assign(window, { ProgramsDueLine });
