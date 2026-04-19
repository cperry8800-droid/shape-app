// Shared page-background editor for public profile pages.
// Persists to localStorage under `shape.profileBg.<kind>` with shape:
//   { image: <url | dataURL>, overlay: 0..1 }
// Exposes <BgEditor kind="trainer" | "nutritionist" ... /> via window.

function BgEditor({ kind, defaultImage, defaultOverlay = 0.6, presets = [] }) {
  const storageKey = `shape.profileBg.${kind}`;
  const read = () => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          image: parsed.image || defaultImage,
          overlay: typeof parsed.overlay === "number" ? parsed.overlay : defaultOverlay,
        };
      }
    } catch (e) {}
    return { image: defaultImage, overlay: defaultOverlay };
  };
  const [state, setState] = React.useState(read);
  const [saved, setSaved] = React.useState(false);
  const publicHref = kind === "trainer" ? "TrainerPublic.html" : "NutritionistPublic.html";

  const persist = (next) => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
      setSaved(true);
      window.clearTimeout(persist._t);
      persist._t = window.setTimeout(() => setSaved(false), 1400);
    } catch (e) {}
  };

  const update = (patch) => {
    const next = { ...state, ...patch };
    setState(next);
    persist(next);
  };

  const onUpload = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      update({ image: ev.target.result });
    };
    reader.readAsDataURL(file);
  };

  const reset = () => {
    try { window.localStorage.removeItem(storageKey); } catch (e) {}
    setState({ image: defaultImage, overlay: defaultOverlay });
    setSaved(true);
    window.clearTimeout(persist._t);
    persist._t = window.setTimeout(() => setSaved(false), 1400);
  };

  const isCustom = state.image && state.image.startsWith("data:");
  const overlayPct = Math.round(state.overlay * 100);

  return (
    <Card style={{ marginTop: 20 }}>
      <SectionTitle right={saved ? "SAVED" : "LIVE ON PUBLIC PAGE"}>Page background</SectionTitle>

      {/* Preview */}
      <div style={{ position: "relative", height: 180, borderRadius: 10, overflow: "hidden", marginBottom: 18, border: "1px solid rgba(242,237,228,0.08)" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: `url("${state.image}")`, backgroundSize: "cover", backgroundPosition: "center" }} />
        <div style={{ position: "absolute", inset: 0, background: `rgba(26,22,18,${state.overlay})` }} />
        <div style={{ position: "absolute", left: 16, bottom: 12, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.14em", color: "rgba(242,237,228,0.85)", textTransform: "uppercase" }}>
          Preview · overlay {overlayPct}%{isCustom ? " · custom upload" : ""}
        </div>
      </div>

      {/* Presets */}
      {presets.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
          {presets.map((preset) => {
            const active = !isCustom && state.image === preset.url;
            return (
              <button key={preset.url} onClick={() => update({ image: preset.url })} style={{
                position: "relative",
                width: 120, height: 72,
                borderRadius: 8, overflow: "hidden",
                border: active ? `2px solid ${TEAL}` : "1px solid rgba(242,237,228,0.15)",
                padding: 0, cursor: "pointer", background: "transparent",
              }}>
                <div style={{ position: "absolute", inset: 0, backgroundImage: `url("${preset.url}")`, backgroundSize: "cover", backgroundPosition: "center" }} />
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(0deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 50%)" }} />
                <div style={{ position: "absolute", left: 8, bottom: 6, fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.08em", color: "#fff", textTransform: "uppercase" }}>{preset.label}</div>
              </button>
            );
          })}
        </div>
      )}

      {/* Upload + overlay controls */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, alignItems: "center" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(242,237,228,0.55)" }}>Upload your own</span>
          <span style={{
            display: "inline-flex", alignItems: "center", justifyContent: "space-between",
            padding: "11px 14px", borderRadius: 8, border: "1px dashed rgba(242,237,228,0.2)",
            fontSize: 13, color: "rgba(242,237,228,0.75)", cursor: "pointer", background: "rgba(242,237,228,0.03)",
          }}>
            <span>{isCustom ? "Custom image active — click to replace" : "Choose image (JPG or PNG)"}</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.1em", color: TEAL_BRIGHT }}>BROWSE →</span>
            <input type="file" accept="image/*" onChange={onUpload} style={{ display: "none" }} />
          </span>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ display: "flex", justifyContent: "space-between", fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(242,237,228,0.55)" }}>
            <span>Darken overlay</span>
            <span style={{ color: INK }}>{overlayPct}%</span>
          </span>
          <input type="range" min="0" max="100" step="1" value={overlayPct}
            onChange={(e) => update({ overlay: Number(e.target.value) / 100 })}
            style={{ accentColor: TEAL, width: "100%" }} />
          <span style={{ fontSize: 12, color: "rgba(242,237,228,0.5)" }}>Higher values darken the image so your content reads cleanly.</span>
        </label>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 20, paddingTop: 18, borderTop: "1px solid rgba(242,237,228,0.06)", alignItems: "center" }}>
        <a href={publicHref} target="_blank" rel="noopener" style={{ background: INK, color: PAPER, padding: "10px 18px", borderRadius: 999, fontFamily: sans, fontSize: 12.5, fontWeight: 500, textDecoration: "none" }}>Preview public page ↗</a>
        <button onClick={reset} style={{ background: "transparent", color: "rgba(242,237,228,0.75)", border: "1px solid rgba(242,237,228,0.2)", padding: "10px 16px", borderRadius: 999, fontFamily: sans, fontSize: 12.5, cursor: "pointer" }}>Reset to default</button>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "rgba(242,237,228,0.5)" }}>Saved locally for this demo · {isCustom ? "custom upload" : "preset"}</span>
      </div>
    </Card>
  );
}

window.BgEditor = BgEditor;
