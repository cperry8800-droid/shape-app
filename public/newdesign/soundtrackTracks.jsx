// A playlist's tracks in the Playlists Builder (owner, 2026-11-05): the real track list from Spotify,
// an energy tag per track (Easy / Build / Peak, saved as it is picked), and ↑ / ↓ to reorder, written
// back to the coach's own Spotify playlist. Reads and writes /api/coach/soundtracks/tracks. Shape never
// streams a track: titles, artists and lengths only, and "Open in Spotify" for the music.
//
// SoundtrackTracks({ id, provider, url })
// Window globals, read at render time (no module system on the website).

const STK_MONO = "'JetBrains Mono', monospace";
const STK_INK50 = "var(--sh-ink2, #a09b94)";
const STK_ENERGY = [["easy", "Easy", "#7bbf5a"], ["build", "Build", "#d8a23a"], ["peak", "Peak", "#e2574c"]];

function stkLen(ms) {
  if (!Number.isFinite(ms)) return "";
  const s = Math.round(ms / 1000);
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

function SoundtrackTracks({ id, provider, url }) {
  const [data, setData] = React.useState(undefined); // undefined loading · { error } · the read
  const [msg, setMsg] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const load = React.useCallback(() => {
    setData(undefined);
    fetch("/api/coach/soundtracks/tracks?id=" + encodeURIComponent(id), { credentials: "same-origin", cache: "no-store" })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })).catch(() => ({ ok: false, j: {} })))
      .then(({ ok, j }) => setData(ok ? j : { error: j.error || "Couldn't read the tracks." }))
      .catch(() => setData({ error: "Couldn't read the tracks." }));
  }, [id]);
  React.useEffect(() => { load(); }, [load]);

  if (data === undefined) return <div style={{ fontSize: 12.5, color: STK_INK50, padding: "10px 0" }}>Reading the tracks…</div>;
  if (data.error) return <div role="status" style={{ fontSize: 12.5, color: STK_INK50, padding: "10px 0" }}>{data.error} <button type="button" onClick={load} style={{ background: "transparent", border: 0, color: "var(--sh-accent, #2ee0c4)", cursor: "pointer" }}>Retry</button></div>;
  if (data.reason === "apple") return <div style={{ fontSize: 12.5, color: STK_INK50, padding: "10px 0" }}>Apple Music track lists aren't read here yet. {url && <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--sh-accent, #2ee0c4)" }}>Open in Apple Music ↗</a>}</div>;
  if (data.reason === "no_link") return <div style={{ fontSize: 12.5, color: STK_INK50, padding: "10px 0" }}>Add the playlist's Spotify link to see its tracks.</div>;

  const tracks = data.tracks || [];
  const tag = async (t, energy) => {
    if (!t.id || busy) return;
    const next = t.energy === energy ? null : energy;
    setBusy(true); setMsg("");
    const before = data;
    setData({ ...data, tracks: tracks.map((x) => (x.id === t.id ? { ...x, energy: next } : x)) });
    try {
      const r = await fetch("/api/coach/soundtracks/tracks", { method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, tags: { [t.id]: next } }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Not saved.");
      setData((d) => ({ ...d, tagged: j.tagged }));
    } catch (e) { setData(before); setMsg((e && e.message) || "Not saved."); }
    finally { setBusy(false); }
  };
  const move = async (from, to) => {
    if (busy || to < 0 || to >= tracks.length) return;
    setBusy(true); setMsg("");
    const before = data;
    const next = tracks.slice();
    const [t] = next.splice(from, 1);
    next.splice(to, 0, t);
    setData({ ...data, tracks: next });
    try {
      const r = await fetch("/api/coach/soundtracks/tracks", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, from, to, count: tracks.length, snapshotId: data.snapshotId || null }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Spotify didn't take the move.");
      setData((d) => ({ ...d, snapshotId: j.snapshotId || d.snapshotId }));
    } catch (e) { setData(before); setMsg((e && e.message) || "Spotify didn't take the move."); }
    finally { setBusy(false); }
  };
  const arrow = { background: "transparent", border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.12)", color: "var(--sh-ink, #f2ede4)", borderRadius: 4, width: 26, height: 26, cursor: busy ? "wait" : "pointer", fontSize: 11 };
  return (
    <div data-soundtrack-tracks={id} style={{ marginTop: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", flexWrap: "wrap", marginBottom: 8 }}>
        <span style={{ fontFamily: STK_MONO, fontSize: 11, letterSpacing: "0.12em", color: STK_INK50 }}>TRACKS FROM SPOTIFY · {tracks.length}{data.total > tracks.length ? " of " + data.total : ""} · TAGGED {data.tagged || 0}</span>
        {url && <a href={url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "var(--sh-accent, #2ee0c4)" }}>Open in Spotify ↗</a>}
      </div>
      {!data.canReorder && <div style={{ fontSize: 11.5, color: STK_INK50, marginBottom: 8 }}>Connect Spotify in Settings to reorder your own playlists from here.</div>}
      {data.tagsStored === false && <div style={{ fontSize: 11.5, color: STK_INK50, marginBottom: 8 }}>Energy tags can't be saved yet.</div>}
      {msg && <div role="status" style={{ fontSize: 12, color: STK_INK50, marginBottom: 8 }}>{msg}</div>}
      <div style={{ background: "rgba(var(--sh-ink-rgb, 242,237,228),0.03)", borderRadius: 8, maxHeight: 460, overflowY: "auto" }}>
        {tracks.map((t, i) => (
          <div key={(t.id || "x") + i} style={{ display: "grid", gridTemplateColumns: "28px 1fr auto auto" + (data.canReorder ? " auto" : ""), gap: 10, padding: "8px 12px", alignItems: "center", borderTop: i ? "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.05)" : "none" }}>
            <span style={{ fontFamily: STK_MONO, fontSize: 10.5, color: STK_INK50 }}>{String(i + 1).padStart(2, "0")}</span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
              <span style={{ display: "block", fontSize: 10.5, color: STK_INK50, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.artists}</span>
            </span>
            <span style={{ display: "inline-flex", gap: 4 }} role="group" aria-label={"Energy for " + t.name}>
              {STK_ENERGY.map(([k, label, c]) => (
                <button key={k} type="button" aria-pressed={t.energy === k} disabled={!t.id || busy} onClick={() => tag(t, k)}
                  style={{ fontFamily: STK_MONO, fontSize: 8.5, letterSpacing: "0.08em", textTransform: "uppercase", padding: "4px 7px", borderRadius: 4, cursor: t.id ? "pointer" : "default", border: "1px solid " + (t.energy === k ? c : "rgba(var(--sh-ink-rgb, 242,237,228),0.12)"), background: t.energy === k ? c : "transparent", color: t.energy === k ? "#1a1612" : STK_INK50 }}>{label}</button>
              ))}
            </span>
            <span style={{ fontFamily: STK_MONO, fontSize: 10.5, color: STK_INK50 }}>{stkLen(t.durationMs)}</span>
            {data.canReorder && (
              <span style={{ display: "inline-flex", gap: 4 }}>
                <button type="button" style={arrow} disabled={busy || i === 0} aria-label={"Move " + t.name + " up"} onClick={() => move(i, i - 1)}>↑</button>
                <button type="button" style={arrow} disabled={busy || i === tracks.length - 1} aria-label={"Move " + t.name + " down"} onClick={() => move(i, i + 1)}>↓</button>
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { SoundtrackTracks });
