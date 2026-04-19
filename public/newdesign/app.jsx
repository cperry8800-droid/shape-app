// App bootstrapping + switcher + Tweaks panel
const { useState: useStateApp, useEffect: useEffectApp } = React;

// Mount each direction
ReactDOM.createRoot(document.getElementById("dir-A")).render(<DirA />);
ReactDOM.createRoot(document.getElementById("dir-B")).render(<DirB />);
ReactDOM.createRoot(document.getElementById("dir-C")).render(<DirC />);

// ---- Switcher ----
// Direction B (Editorial) is the live design; A and C stay mounted
// for internal Tweaks-panel previewing but the public switcher bar
// is gone.
const dirs = ["A", "B", "C"];
setActive("B");

function setActive(d) {
  dirs.forEach(x => {
    const el = document.getElementById("dir-" + x);
    if (el) el.hidden = x !== d;
  });
  document.querySelectorAll("#switcher button").forEach(b => {
    b.classList.toggle("on", b.dataset.dir === d);
  });
  localStorage.setItem("shape.dir", d);
  window.scrollTo({ top: 0, behavior: "auto" });
}

const switcherEl = document.getElementById("switcher");
if (switcherEl) {
  switcherEl.addEventListener("click", (e) => {
    if (e.target.dataset.dir) setActive(e.target.dataset.dir);
  });
}

// ---- Tweaks ----
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#0ac5a8",
  "showFloatingChips": true,
  "heroCopy": "default"
}/*EDITMODE-END*/;

function TweaksPanel() {
  const [open, setOpen] = useStateApp(false);
  const [state, setState] = useStateApp(TWEAK_DEFAULTS);

  useEffectApp(() => {
    const handler = (e) => {
      if (e.data?.type === "__activate_edit_mode") setOpen(true);
      if (e.data?.type === "__deactivate_edit_mode") setOpen(false);
    };
    window.addEventListener("message", handler);
    // announce AFTER listener is installed
    window.parent.postMessage({ type: "__edit_mode_available" }, "*");
    return () => window.removeEventListener("message", handler);
  }, []);

  useEffectApp(() => {
    // Apply accent live to CSS vars
    document.documentElement.style.setProperty("--teal", state.accent);
  }, [state.accent]);

  const update = (patch) => {
    const next = { ...state, ...patch };
    setState(next);
    window.parent.postMessage({ type: "__edit_mode_set_keys", edits: patch }, "*");
  };

  if (!open) return null;

  const accents = [
    ["Signal teal", "#0ac5a8"],
    ["Deep teal", "#068a75"],
    ["Spring", "#7de3a8"],
    ["Cobalt", "#2e7dff"],
    ["Ember", "#ff6a3d"],
    ["Ink", "#0a1f1b"],
  ];

  return (
    <div style={{ position: "fixed", right: 20, bottom: 20, width: 300, background: "rgba(12,16,14,0.96)", color: "#fff", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: 18, fontFamily: "'Inter Tight', sans-serif", fontSize: 13, zIndex: 10000, boxShadow: "0 20px 60px rgba(0,0,0,0.4)", backdropFilter: "blur(12px)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.12em", color: "rgba(255,255,255,0.5)" }}>TWEAKS</div>
        <button onClick={() => setOpen(false)} style={{ background: "transparent", border: 0, color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 16 }}>×</button>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginBottom: 8 }}>Direction</div>
        <div style={{ display: "flex", gap: 4 }}>
          {dirs.map(d => (
            <button key={d} onClick={() => setActive(d)} style={{ flex: 1, padding: "8px 0", borderRadius: 6, border: "1px solid rgba(255,255,255,0.12)", background: localStorage.getItem("shape.dir") === d ? "#fff" : "transparent", color: localStorage.getItem("shape.dir") === d ? "#0a1f1b" : "#fff", fontSize: 11, fontFamily: "'JetBrains Mono', monospace", cursor: "pointer" }}>{d}</button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginBottom: 8 }}>Accent color</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6 }}>
          {accents.map(([n, c]) => (
            <button key={c} title={n} onClick={() => update({ accent: c })} style={{ aspectRatio: "1/1", background: c, border: state.accent === c ? "2px solid #fff" : "1px solid rgba(255,255,255,0.12)", borderRadius: 6, cursor: "pointer" }} />
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={state.showFloatingChips} onChange={e => update({ showFloatingChips: e.target.checked })} />
          <span style={{ fontSize: 12.5 }}>Show floating chips (hero)</span>
        </label>
      </div>

      <div style={{ marginBottom: 4 }}>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginBottom: 8 }}>Hero headline</div>
        <div style={{ display: "grid", gap: 4 }}>
          {["default", "performance", "community"].map(v => (
            <button key={v} onClick={() => update({ heroCopy: v })} style={{ padding: "8px 10px", textAlign: "left", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: state.heroCopy === v ? "rgba(10,197,168,0.18)" : "transparent", color: "#fff", fontSize: 12, fontFamily: "inherit", cursor: "pointer" }}>
              {v === "default" && "Train with a human. Not an app."}
              {v === "performance" && "Your performance. Handled."}
              {v === "community" && "Real coaches. Real community."}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("tweaks-root")).render(<TweaksPanel />);
