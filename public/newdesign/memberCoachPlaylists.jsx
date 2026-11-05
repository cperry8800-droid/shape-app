// The playlists a member's own coach sent them, on the member website (owner, 2026-11-05): the trainer's on
// Workouts, the nutritionist's cooking playlists on Nutrition, as the app shows them on Train and Eat.
// Reads /api/client/coach-playlists; each opens in the member's own Spotify or Apple Music (Shape never
// streams it). Nothing sent, or a failed read, renders nothing: never a sample.
//
// MemberCoachPlaylists({ role })
// Window globals, read at render time (no module system on the website).

function MemberCoachPlaylists({ role }) {
  const [rows, setRows] = React.useState(null);
  React.useEffect(() => {
    let on = true;
    fetch("/api/client/coach-playlists?role=" + encodeURIComponent(role), { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (on) setRows(d && Array.isArray(d.playlists) ? d.playlists : null); })
      .catch(() => { if (on) setRows(null); });
    return () => { on = false; };
  }, [role]);
  if (!Array.isArray(rows) || !rows.length) return null;
  const ink50 = "var(--sh-ink2, #a09b94)";
  const coach = rows[0].coachName ? String(rows[0].coachName).split(" ")[0] : (role === "nutritionist" ? "your nutritionist" : "your trainer");
  return (
    <section data-coach-playlists={role} style={{ marginTop: 22 }}>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", color: ink50, marginBottom: 10 }}>
        {role === "nutritionist" ? "Cooking playlists" : "Playlists"} from {coach}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(260px, 100%), 1fr))", gap: 10 }}>
        {rows.map((p) => {
          const color = p.provider === "apple" ? "#fa243c" : "#1db954";
          const meta = [p.tracks ? p.tracks + " tracks" : null, p.duration, p.bpm ? p.bpm + " BPM" : null].filter(Boolean).join(" · ");
          const inner = (
            <>
              <div style={{ fontSize: 14, fontWeight: 500 }}>♪ {p.name}</div>
              {meta && <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, color: ink50, marginTop: 4 }}>{meta}</div>}
              {p.tag && <div style={{ fontSize: 12, color: ink50, marginTop: 4, fontStyle: "italic" }}>{p.tag}</div>}
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color, marginTop: 8 }}>{p.url ? "Open in " + (p.provider === "apple" ? "Apple Music" : "Spotify") + " ↗" : "No link yet"}</div>
            </>
          );
          const box = { display: "block", border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.12)", borderLeft: "3px solid " + color, borderRadius: 8, padding: "12px 14px", color: "var(--sh-ink, #f2ede4)", textDecoration: "none" };
          return p.url
            ? <a key={p.id || p.name} href={p.url} target="_blank" rel="noopener noreferrer" style={box}>{inner}</a>
            : <div key={p.id || p.name} style={box}>{inner}</div>;
        })}
      </div>
    </section>
  );
}

Object.assign(window, { MemberCoachPlaylists });
