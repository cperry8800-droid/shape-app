// Trainer/Nutritionist Playlists page — three workflows in one page, as tabs.
// Library: browse & create. Matrix: bulk-assign. Builder: deep-edit one playlist.
// Driven by a `ctx` prop so it works for both roles.

const PlaylistCtx = React.createContext(null);

function PlaylistPage({ ctx }) {
  const { useState, useEffect } = React;
  const storageKey = `shape.${ctx.role}.playlists.view`;
  const [view, setView] = useState(() => {
    try { return localStorage.getItem(storageKey) || "library"; } catch { return "library"; }
  });
  const [query, setQuery] = useState("");

  const setViewPersist = (v) => {
    setView(v);
    try { localStorage.setItem(storageKey, v); } catch {}
  };

  const filtered = ctx.playlists.filter(p => !query || p.name.toLowerCase().includes(query.toLowerCase()));
  const totalAttached = ctx.playlists.reduce((s, p) => s + p.attachedTo.length, 0);
  const totalListens = ctx.playlists.reduce((s, p) => s + p.listens, 0);

  return (
    <PlaylistCtx.Provider value={ctx}>
      <DashPage
        navItems={ctx.navItems("playlists")}
        payoutCard={ctx.payoutCard}
        eyebrow={`${ctx.playlists.length} PLAYLISTS · ${totalAttached} ${ctx.attachmentUnitPlural.toUpperCase()} ATTACHMENTS · ${totalListens.toLocaleString()} CLIENT LISTENS`}
        title="Playlists"
        subtitle={ctx.subtitle}
        actions={<>
          <button style={pillGhost}>Shared with me</button>
          <button style={pillPrimary}>+ New playlist</button>
        </>}
      >
        <PlaylistTabs value={view} onChange={setViewPersist} ctx={ctx} />

        {view === "library" && <LibraryGrid query={query} setQuery={setQuery} items={filtered} />}
        {view === "matrix"  && <AttachMatrix />}
        {view === "builder" && <BuilderDrawer query={query} setQuery={setQuery} items={filtered} />}
      </DashPage>
    </PlaylistCtx.Provider>
  );
}

const pillGhost = { background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.25)", padding: "10px 20px", borderRadius: 999, fontFamily: sans, fontSize: 13, cursor: "pointer" };
const pillPrimary = { background: INK, color: PAPER, border: 0, padding: "10px 22px", borderRadius: 999, fontFamily: sans, fontSize: 13, fontWeight: 500, cursor: "pointer" };

// ────────────────────────────────────────────────────────────
// A · Library grid
// ────────────────────────────────────────────────────────────
function LibraryGrid({ query, setQuery, items }) {
  const [selected, setSelected] = React.useState(null);
  return (
    <React.Fragment>
      <SearchBar query={query} setQuery={setQuery} placeholder="Search playlists…" />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginBottom: 32 }}>
        <NewPlaylistCard />
        {items.map(p => <PlaylistCard key={p.id} p={p} onOpen={() => setSelected(p)} />)}
      </div>

      <Card>
        <SectionTitle right="ALL ATTACHMENTS">Attachments across your programs</SectionTitle>
        <AttachmentTable />
      </Card>

      {selected && <PlaylistDetail p={selected} onClose={() => setSelected(null)} />}
    </React.Fragment>
  );
}

function PlaylistCard({ p, onOpen }) {
  const ctx = React.useContext(PlaylistCtx);
  return (
    <Card style={{ padding: 0, overflow: "hidden", cursor: "pointer" }}>
      <div onClick={onOpen}
        style={{ height: 168, background: p.cover, padding: 18, display: "flex", flexDirection: "column", justifyContent: "space-between", position: "relative" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(8px)", padding: "6px 10px", borderRadius: 999, fontSize: 10.5, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.1em", color: PAPER }}>
            <ProviderMark kind={p.provider} size={12} />
            {p.provider === "apple" ? "APPLE MUSIC" : "SPOTIFY"}
          </div>
          {p.shared && <div style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.12em", color: "rgba(242,237,228,0.7)" }}>SHARED</div>}
        </div>
        <div>
          <div style={{ fontFamily: serif, fontSize: 26, letterSpacing: "-0.015em", lineHeight: 1.05, marginBottom: 6 }}>{p.name}</div>
          <div style={{ fontSize: 11.5, fontFamily: "'JetBrains Mono', monospace", color: "rgba(242,237,228,0.75)", letterSpacing: "0.06em" }}>
            {p.bpm} BPM · {p.trackCount} tracks · {p.duration}
          </div>
        </div>
        <div style={{ position: "absolute", right: 18, bottom: 18, width: 44, height: 44, borderRadius: 999, background: p.accent, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 12px 28px rgba(0,0,0,0.4)" }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="#1a1612"><path d="M4 2.5v11l10-5.5z"/></svg>
        </div>
      </div>
      <div style={{ padding: 16 }}>
        <div style={{ fontSize: 13, color: "rgba(242,237,228,0.7)", lineHeight: 1.5, minHeight: 40 }}>{p.note}</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(242,237,228,0.08)", fontSize: 11.5, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.06em", color: "rgba(242,237,228,0.55)" }}>
          <span>{p.attachedTo.length} {ctx.attachmentUnit}{p.attachedTo.length !== 1 && "s"}</span>
          <span>{p.listens.toLocaleString()} listens</span>
          <span>{p.updated}</span>
        </div>
      </div>
    </Card>
  );
}

function NewPlaylistCard() {
  const [open, setOpen] = React.useState(false);
  const [url, setUrl] = React.useState("");
  return (
    <React.Fragment>
      <button onClick={() => setOpen(true)}
        style={{ all: "unset", cursor: "pointer", border: "1.5px dashed rgba(242,237,228,0.2)", borderRadius: 12, padding: 18, height: 344, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, fontFamily: sans, background: "rgba(242,237,228,0.02)", transition: "all 0.2s" }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = TEAL; e.currentTarget.style.background = "rgba(30,192,168,0.04)"; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(242,237,228,0.2)"; e.currentTarget.style.background = "rgba(242,237,228,0.02)"; }}>
        <div style={{ width: 56, height: 56, borderRadius: 999, background: "rgba(30,192,168,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={TEAL_BRIGHT} strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4 }}>New playlist</div>
          <div style={{ fontSize: 12, color: "rgba(242,237,228,0.55)", lineHeight: 1.5 }}>Paste a Spotify or<br/>Apple Music link</div>
        </div>
      </button>

      {open && (
        <div onClick={() => setOpen(false)} style={modalOverlay}>
          <div onClick={e => e.stopPropagation()} style={{ ...modalCard, maxWidth: 520 }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.14em", color: TEAL_BRIGHT, marginBottom: 8 }}>NEW PLAYLIST</div>
            <h3 style={{ fontFamily: serif, fontSize: 28, margin: 0, fontWeight: 400 }}>Paste a link</h3>
            <p style={{ fontSize: 13.5, color: "rgba(242,237,228,0.7)", lineHeight: 1.55, margin: "10px 0 22px" }}>
              From Spotify or Apple Music. We'll pull cover, tracks, duration, and BPM range automatically.
            </p>
            <label style={lbl}>Playlist URL</label>
            <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://open.spotify.com/playlist/…" style={input} />
            <label style={lbl}>Name (optional override)</label>
            <input placeholder="e.g. Heavy Squat Day" style={input} />
            <label style={lbl}>Note for client</label>
            <textarea rows="2" placeholder="What's the vibe? Any cues?" style={{ ...input, resize: "vertical", fontFamily: sans }} />
            <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
              <button onClick={() => setOpen(false)} style={{ ...pillPrimary, flex: 1 }}>Import playlist</button>
              <button onClick={() => setOpen(false)} style={pillGhost}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </React.Fragment>
  );
}

function PlaylistDetail({ p, onClose }) {
  const ctx = React.useContext(PlaylistCtx);
  return (
    <div onClick={onClose} style={modalOverlay}>
      <div onClick={e => e.stopPropagation()} style={{ ...modalCard, maxWidth: 640, padding: 0 }}>
        <div style={{ height: 180, background: p.cover, padding: 24, display: "flex", alignItems: "flex-end", position: "relative" }}>
          <button onClick={onClose} style={{ position: "absolute", top: 16, right: 16, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(8px)", border: 0, color: PAPER, width: 32, height: 32, borderRadius: 999, cursor: "pointer", fontSize: 16 }}>×</button>
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(0,0,0,0.4)", padding: "5px 10px", borderRadius: 999, fontSize: 10.5, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.1em", marginBottom: 10 }}>
              <ProviderMark kind={p.provider} size={11} />
              {p.provider === "apple" ? "APPLE MUSIC" : "SPOTIFY"}
            </div>
            <h3 style={{ fontFamily: serif, fontSize: 32, fontWeight: 400, margin: 0, letterSpacing: "-0.02em" }}>{p.name}</h3>
            <div style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace", color: "rgba(242,237,228,0.75)", letterSpacing: "0.06em", marginTop: 6 }}>
              {p.bpm} BPM · {p.trackCount} tracks · {p.duration}
            </div>
          </div>
        </div>
        <div style={{ padding: 24 }}>
          <div style={{ fontSize: 14, color: "rgba(242,237,228,0.8)", lineHeight: 1.55, marginBottom: 20, fontStyle: "italic" }}>"{p.note}"</div>

          <div style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.12em", color: "rgba(242,237,228,0.55)", marginBottom: 10 }}>ATTACHED TO</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {p.attachedTo.map(tid => {
                const w = ctx.attachTargets.find(x => x.id === tid);
                return <span key={tid} style={{ background: "rgba(30,192,168,0.1)", border: "1px solid rgba(30,192,168,0.25)", padding: "6px 12px", borderRadius: 999, fontSize: 12, fontFamily: sans, color: TEAL_BRIGHT }}>{w?.name}</span>;
              })}
              <span style={{ border: "1px dashed rgba(242,237,228,0.25)", padding: "6px 12px", borderRadius: 999, fontSize: 12, fontFamily: sans, color: "rgba(242,237,228,0.55)", cursor: "pointer" }}>+ Attach {ctx.attachmentUnit}</span>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.12em", color: "rgba(242,237,228,0.55)", marginBottom: 10 }}>PREVIEW · FIRST 5 TRACKS</div>
            <div style={{ background: "rgba(242,237,228,0.03)", borderRadius: 8, overflow: "hidden" }}>
              {p.sampleTracks.map(([artist, title, dur], i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "30px 1fr auto", gap: 12, padding: "12px 14px", alignItems: "center", borderTop: i === 0 ? "none" : "1px solid rgba(242,237,228,0.05)" }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(242,237,228,0.45)" }}>{String(i + 1).padStart(2, "0")}</div>
                  <div>
                    <div style={{ fontSize: 13.5, marginBottom: 2 }}>{title}</div>
                    <div style={{ fontSize: 11.5, color: "rgba(242,237,228,0.55)" }}>{artist}</div>
                  </div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(242,237,228,0.45)" }}>{dur}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 22 }}>
            <button style={{ ...pillPrimary, flex: 1 }}>Attach to {ctx.attachmentUnit}</button>
            <button style={pillGhost}>Share with team</button>
            <button style={pillGhost}>Open in {p.provider === "apple" ? "Apple" : "Spotify"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// B · Attach matrix
// ────────────────────────────────────────────────────────────
function AttachMatrix() {
  const ctx = React.useContext(PlaylistCtx);
  const playlists = ctx.playlists;
  const targets = ctx.attachTargets;
  const [state, setState] = React.useState(() => {
    const m = {};
    playlists.forEach(p => p.attachedTo.forEach(w => { m[`${w}::${p.id}`] = true; }));
    return m;
  });
  const toggle = (w, p) => setState(s => ({ ...s, [`${w}::${p}`]: !s[`${w}::${p}`] }));

  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "18px 24px", borderBottom: "1px solid rgba(242,237,228,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.14em", color: TEAL_BRIGHT, marginBottom: 6 }}>ATTACH MATRIX</div>
          <div style={{ fontFamily: serif, fontSize: 22, fontWeight: 400 }}>{ctx.attachmentUnitPlural[0].toUpperCase() + ctx.attachmentUnitPlural.slice(1)} × Playlists</div>
          <div style={{ fontSize: 12.5, color: "rgba(242,237,228,0.55)", marginTop: 4 }}>Click a cell to attach or detach. Every client with that {ctx.attachmentUnit} sees the playlist.</div>
        </div>
        <button style={pillPrimary}>+ New playlist</button>
      </div>

      <div style={{ overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead>
            <tr>
              <th style={thFirst}>{ctx.attachmentUnitPlural.toUpperCase()}</th>
              {playlists.map(p => (
                <th key={p.id} style={{ ...th, minWidth: 120 }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 6, background: p.cover }} />
                    <div style={{ fontSize: 11, fontFamily: sans, fontWeight: 500, color: INK, textAlign: "center", lineHeight: 1.25, whiteSpace: "normal", textTransform: "none", letterSpacing: 0 }}>{p.name}</div>
                    <div style={{ fontSize: 10, color: "rgba(242,237,228,0.45)", fontFamily: "'JetBrains Mono', monospace" }}>{p.bpm}</div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {targets.map(w => (
              <tr key={w.id}>
                <td style={tdFirst}>
                  <div style={{ fontSize: 13.5, fontWeight: 500, marginBottom: 3 }}>{w.name}</div>
                  <div style={{ fontSize: 11, color: "rgba(242,237,228,0.5)", fontFamily: "'JetBrains Mono', monospace" }}>{w.program} · {w.clientsDoing} clients</div>
                </td>
                {playlists.map(p => {
                  const on = state[`${w.id}::${p.id}`];
                  return (
                    <td key={p.id} style={td}>
                      <button onClick={() => toggle(w.id, p.id)}
                        style={{ width: 36, height: 36, borderRadius: 10, border: on ? `1.5px solid ${p.accent}` : "1px solid rgba(242,237,228,0.1)", background: on ? p.accent : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto", transition: "all 0.15s" }}>
                        {on && <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#1a1612" strokeWidth="2.5"><path d="M3 8.5l3 3 7-7"/></svg>}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

const th = { padding: "16px 10px", textAlign: "center", fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.12em", color: "rgba(242,237,228,0.5)", borderBottom: "1px solid rgba(242,237,228,0.08)", verticalAlign: "bottom" };
const thFirst = { ...th, textAlign: "left", minWidth: 240, paddingLeft: 24, position: "sticky", left: 0, background: "#1a1612", zIndex: 1 };
const td = { padding: "10px 8px", borderTop: "1px solid rgba(242,237,228,0.05)", textAlign: "center" };
const tdFirst = { padding: "14px 24px", borderTop: "1px solid rgba(242,237,228,0.05)", position: "sticky", left: 0, background: "#1a1612", zIndex: 1, minWidth: 240 };

// ────────────────────────────────────────────────────────────
// C · Builder drawer
// ────────────────────────────────────────────────────────────
function BuilderDrawer({ query, setQuery, items }) {
  const [active, setActive] = React.useState(items[0]);
  React.useEffect(() => { if (!items.find(x => x.id === active?.id)) setActive(items[0]); }, [items]);

  return (
    <React.Fragment>
      <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 16 }}>
        <div>
          <SearchBar query={query} setQuery={setQuery} placeholder="Search your playlists…" compact />
          <div style={{ border: "1px solid rgba(242,237,228,0.08)", borderRadius: 10, overflow: "hidden" }}>
            <button style={{ all: "unset", display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", width: "100%", boxSizing: "border-box", cursor: "pointer", background: "rgba(30,192,168,0.05)", borderBottom: "1px solid rgba(242,237,228,0.08)" }}>
              <div style={{ width: 30, height: 30, borderRadius: 999, background: "rgba(30,192,168,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={TEAL_BRIGHT} strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
              </div>
              <span style={{ fontSize: 13.5, color: TEAL_BRIGHT, fontWeight: 500 }}>New playlist</span>
            </button>
            {items.map(p => (
              <button key={p.id} onClick={() => setActive(p)}
                style={{ all: "unset", display: "grid", gridTemplateColumns: "42px 1fr auto", gap: 12, padding: "12px 16px", width: "100%", boxSizing: "border-box", cursor: "pointer", background: active?.id === p.id ? "rgba(242,237,228,0.06)" : "transparent", borderBottom: "1px solid rgba(242,237,228,0.06)", alignItems: "center" }}>
                <div style={{ width: 42, height: 42, borderRadius: 6, background: p.cover }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: "rgba(242,237,228,0.5)", fontFamily: "'JetBrains Mono', monospace" }}>{p.attachedTo.length} · {p.bpm}</div>
                </div>
                <ProviderMark kind={p.provider} size={13} />
              </button>
            ))}
          </div>
        </div>

        {active && <BuilderDetailPane p={active} />}
      </div>
    </React.Fragment>
  );
}

function BuilderDetailPane({ p }) {
  const ctx = React.useContext(PlaylistCtx);
  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ height: 120, background: p.cover, padding: 20, display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(0,0,0,0.4)", padding: "5px 10px", borderRadius: 999, fontSize: 10.5, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.1em", marginBottom: 8 }}>
            <ProviderMark kind={p.provider} size={11} />
            {p.provider === "apple" ? "APPLE MUSIC" : "SPOTIFY"}
          </div>
          <div style={{ fontFamily: serif, fontSize: 30, fontWeight: 400, letterSpacing: "-0.02em" }}>{p.name}</div>
        </div>
        <button style={{ background: p.accent, color: "#1a1612", border: 0, padding: "10px 20px", borderRadius: 999, fontFamily: sans, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>▶ Preview</button>
      </div>

      <div style={{ padding: 24 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16, marginBottom: 22, fontSize: 11.5, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.06em", color: "rgba(242,237,228,0.55)" }}>
          <div><div style={{ color: INK, fontFamily: "Fraunces", fontSize: 22, marginBottom: 4 }}>{p.trackCount}</div>TRACKS</div>
          <div><div style={{ color: INK, fontFamily: "Fraunces", fontSize: 22, marginBottom: 4 }}>{p.bpm}</div>BPM RANGE</div>
          <div><div style={{ color: INK, fontFamily: "Fraunces", fontSize: 22, marginBottom: 4 }}>{p.duration}</div>RUNTIME</div>
          <div><div style={{ color: INK, fontFamily: "Fraunces", fontSize: 22, marginBottom: 4 }}>{p.listens.toLocaleString()}</div>CLIENT LISTENS</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          <div>
            <div style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.12em", color: "rgba(242,237,228,0.55)", marginBottom: 10 }}>NOTE FOR CLIENT</div>
            <div style={{ border: "1px solid rgba(242,237,228,0.1)", borderRadius: 8, padding: "12px 14px", fontSize: 13.5, color: "rgba(242,237,228,0.85)", lineHeight: 1.55, fontStyle: "italic", marginBottom: 22 }}>"{p.note}"</div>

            <div style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.12em", color: "rgba(242,237,228,0.55)", marginBottom: 10 }}>ATTACHED {ctx.attachmentUnitPlural.toUpperCase()} ({p.attachedTo.length})</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
              {targets.map(w => {
                const on = p.attachedTo.includes(w.id);
                return (
                  <label key={w.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: `1px solid ${on ? "rgba(30,192,168,0.3)" : "rgba(242,237,228,0.08)"}`, background: on ? "rgba(30,192,168,0.06)" : "transparent", borderRadius: 8, cursor: "pointer" }}>
                    <div style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${on ? p.accent : "rgba(242,237,228,0.2)"}`, background: on ? p.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                      {on && <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="#1a1612" strokeWidth="3"><path d="M3 8.5l3 3 7-7"/></svg>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{w.name}</div>
                      <div style={{ fontSize: 11, color: "rgba(242,237,228,0.5)", fontFamily: "'JetBrains Mono', monospace" }}>{w.program} · {w.clientsDoing} clients</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.12em", color: "rgba(242,237,228,0.55)", marginBottom: 10 }}>TRACKS</div>
            <div style={{ background: "rgba(242,237,228,0.03)", borderRadius: 8, overflow: "hidden", maxHeight: 420, overflowY: "auto" }}>
              {[...p.sampleTracks, ...p.sampleTracks, ...p.sampleTracks].slice(0, p.trackCount).map(([artist, title, dur], i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "28px 1fr auto", gap: 10, padding: "10px 14px", alignItems: "center", borderTop: i === 0 ? "none" : "1px solid rgba(242,237,228,0.05)" }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: "rgba(242,237,228,0.45)" }}>{String(i + 1).padStart(2, "0")}</div>
                  <div>
                    <div style={{ fontSize: 12.5, marginBottom: 2 }}>{title}</div>
                    <div style={{ fontSize: 10.5, color: "rgba(242,237,228,0.55)" }}>{artist}</div>
                  </div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: "rgba(242,237,228,0.45)" }}>{dur}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 24, paddingTop: 20, borderTop: "1px solid rgba(242,237,228,0.08)" }}>
          <button style={pillPrimary}>Save changes</button>
          <button style={pillGhost}>Share with team</button>
          <button style={pillGhost}>Replace source link</button>
          <div style={{ flex: 1 }} />
          <button style={{ ...pillGhost, color: "rgba(255,150,150,0.9)", borderColor: "rgba(255,150,150,0.2)" }}>Delete</button>
        </div>
      </div>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────
// Shared bits
// ────────────────────────────────────────────────────────────
function PlaylistTabs({ value, onChange, ctx }) {
  const tabs = [
    { id: "library", label: "Library",          sub: "Browse & create",       icon: "grid" },
    { id: "matrix",  label: "Attach matrix",    sub: `Bulk-assign to ${ctx.attachmentUnitPlural}`, icon: "matrix" },
    { id: "builder", label: "Builder",          sub: "Deep-edit tracks & notes", icon: "edit" },
  ];
  return (
    <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid rgba(242,237,228,0.08)", paddingBottom: 2 }}>
      {tabs.map(t => {
        const on = value === t.id;
        return (
          <button key={t.id} onClick={() => onChange(t.id)}
            style={{ all: "unset", cursor: "pointer", padding: "14px 18px", display: "inline-flex", alignItems: "center", gap: 12, borderBottom: `2px solid ${on ? TEAL_BRIGHT : "transparent"}`, marginBottom: -1, fontFamily: sans }}>
            <TabIcon kind={t.icon} on={on} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: on ? INK : "rgba(242,237,228,0.75)" }}>{t.label}</div>
              <div style={{ fontSize: 11, color: "rgba(242,237,228,0.45)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.06em", marginTop: 2 }}>{t.sub}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function TabIcon({ kind, on }) {
  const c = on ? TEAL_BRIGHT : "rgba(242,237,228,0.45)";
  if (kind === "grid") return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8">
      <rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>
      <rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>
    </svg>
  );
  if (kind === "matrix") return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>
    </svg>
  );
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="m18.5 2.5 3 3L12 15l-4 1 1-4 9.5-9.5z" fill={on ? "rgba(30,192,168,0.12)" : "transparent"}/>
    </svg>
  );
}

function SearchBar({ query, setQuery, placeholder, compact }) {
  return (
    <div style={{ position: "relative", marginBottom: compact ? 14 : 20 }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(242,237,228,0.4)" strokeWidth="2" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }}>
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <input value={query} onChange={e => setQuery(e.target.value)} placeholder={placeholder}
        style={{ width: "100%", boxSizing: "border-box", background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.1)", borderRadius: 10, padding: "12px 14px 12px 40px", fontFamily: sans, fontSize: 13.5, color: INK, outline: "none" }} />
    </div>
  );
}

function AttachmentTable() {
  const ctx = React.useContext(PlaylistCtx);
  const rows = [];
  ctx.playlists.forEach(p => {
    p.attachedTo.forEach(tid => {
      const w = ctx.attachTargets.find(x => x.id === tid);
      if (w) rows.push({ p, w });
    });
  });
  return (
    <div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "40px 2fr 2fr 1fr 1fr 80px", gap: 14, padding: "12px 4px", borderTop: i === 0 ? "none" : "1px solid rgba(242,237,228,0.06)", alignItems: "center" }}>
          <div style={{ width: 36, height: 36, borderRadius: 6, background: r.p.cover }} />
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 500 }}>{r.p.name}</div>
            <div style={{ fontSize: 11, color: "rgba(242,237,228,0.5)", fontFamily: "'JetBrains Mono', monospace" }}>{r.p.bpm} BPM · {r.p.trackCount} tracks</div>
          </div>
          <div>
            <div style={{ fontSize: 13, color: TEAL_BRIGHT }}>→ {r.w.name}</div>
            <div style={{ fontSize: 11, color: "rgba(242,237,228,0.5)", fontFamily: "'JetBrains Mono', monospace" }}>{r.w.program}</div>
          </div>
          <div style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace", color: "rgba(242,237,228,0.55)" }}>{r.w.clientsDoing} clients</div>
          <div style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace", color: "rgba(242,237,228,0.55)" }}>{r.p.listens} listens</div>
          <button style={{ background: "transparent", color: "rgba(242,237,228,0.55)", border: "1px solid rgba(242,237,228,0.15)", padding: "5px 10px", borderRadius: 6, fontSize: 11, fontFamily: sans, cursor: "pointer" }}>Detach</button>
        </div>
      ))}
    </div>
  );
}

const modalOverlay = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 };
const modalCard = { background: "#1a1612", border: "1px solid rgba(242,237,228,0.1)", borderRadius: 14, width: "100%", padding: 28, maxHeight: "90vh", overflow: "auto", boxShadow: "0 40px 80px rgba(0,0,0,0.5)" };
const lbl = { display: "block", fontSize: 11, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.12em", color: "rgba(242,237,228,0.55)", marginBottom: 6, marginTop: 14 };
const input = { width: "100%", boxSizing: "border-box", background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.1)", borderRadius: 8, padding: "10px 14px", fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: INK, outline: "none" };

Object.assign(window, { PlaylistPage });
