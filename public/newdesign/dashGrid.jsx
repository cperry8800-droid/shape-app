// DashGrid — reorderable / hideable dashboard widgets. Generalizes ShapeHomeCards
// (pageShell.jsx) to arbitrary widget content + a full/half responsive grid, persisted
// per-role to user_goals('dashboard_layout'). Pure helpers are inlined here as a mirror
// of public/newdesign/dashboardLayout.mjs (babel-standalone can't import) — keep identical.
// Website only.
const DG_INK = "#f2ede4";
const DG_MUTE = "rgba(242,237,228,0.5)";

function dgResolveLayout(saved, allKeys, defaultOrder) {
  const all = new Set(allKeys);
  const savedOrder = (saved && Array.isArray(saved.order)) ? saved.order.filter((k) => all.has(k)) : [];
  const seen = new Set(savedOrder);
  const order = savedOrder.slice();
  for (const k of defaultOrder) if (all.has(k) && !seen.has(k)) { order.push(k); seen.add(k); }
  const hidden = (saved && Array.isArray(saved.hidden)) ? saved.hidden.filter((k) => all.has(k)) : [];
  return { order, hidden };
}
function dgMoveKey(order, key, beforeKey) {
  if (key === beforeKey) return order.slice();
  const next = order.filter((k) => k !== key);
  const idx = beforeKey == null ? -1 : next.indexOf(beforeKey);
  if (idx < 0) next.push(key); else next.splice(idx, 0, key);
  return next;
}
function dgStepKey(order, key, dir) {
  const i = order.indexOf(key); if (i < 0) return order.slice();
  const j = i + (dir < 0 ? -1 : 1); if (j < 0 || j >= order.length) return order.slice();
  const next = order.slice(); next.splice(i, 1); next.splice(j, 0, key); return next;
}
function dgBtn(extra) { return { width: 26, height: 26, borderRadius: 7, border: 0, background: "transparent", color: DG_MUTE, fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 800, cursor: "pointer", lineHeight: 1, ...(extra || {}) }; }

function DashGrid({ role, widgets }) {
  const defaultOrder = widgets.map((w) => w.key);
  const byKey = {}; widgets.forEach((w) => { byKey[w.key] = w; });
  const allKeys = defaultOrder;

  const [layout, setLayout] = React.useState(() => ({ order: defaultOrder.slice(), hidden: [] }));
  const [drag, setDrag] = React.useState(null);
  const [over, setOver] = React.useState(null);
  const docRef = React.useRef({}); // the whole multi-role doc, for merge-on-save

  React.useEffect(() => {
    if (!(window.shapeDb && window.shapeDb.getUserGoals)) return;
    window.shapeDb.getUserGoals("dashboard_layout").then((doc) => {
      docRef.current = doc && typeof doc === "object" ? doc : {};
      setLayout(dgResolveLayout(docRef.current[role], allKeys, defaultOrder));
    }).catch(() => {});
    // eslint-disable-next-line
  }, [role]);

  const persist = (next) => {
    setLayout(next);
    try {
      docRef.current = { ...docRef.current, [role]: { order: next.order, hidden: next.hidden } };
      if (window.shapeDb && window.shapeDb.saveUserGoals) window.shapeDb.saveUserGoals("dashboard_layout", docRef.current);
    } catch (e) {}
  };

  const visible = layout.order.filter((k) => !layout.hidden.includes(k));
  const hide = (k) => persist({ order: layout.order, hidden: [...layout.hidden, k] });
  const restore = (k) => persist({ order: layout.order, hidden: layout.hidden.filter((x) => x !== k) });
  const reset = () => persist({ order: defaultOrder.slice(), hidden: [] });
  const step = (k, dir) => persist({ ...layout, order: dgStepKey(layout.order, k, dir) });
  const onDrop = (target) => {
    if (drag && drag !== target) persist({ ...layout, order: dgMoveKey(layout.order, drag, target) });
    setDrag(null); setOver(null);
  };

  const chrome = (k) => {
    const w = byKey[k];
    const span = w.size === "full" ? "1 / -1" : "auto";
    const isOver = over === k && drag && drag !== k;
    return (
      <div key={k}
        draggable
        onDragStart={() => setDrag(k)}
        onDragEnd={() => { setDrag(null); setOver(null); }}
        onDragOver={(e) => { e.preventDefault(); if (over !== k) setOver(k); }}
        onDrop={(e) => { e.preventDefault(); onDrop(k); }}
        style={{ gridColumn: span, position: "relative", opacity: drag === k ? 0.45 : 1,
          outline: isOver ? "1.5px dashed " + DG_INK : "none", outlineOffset: 3, borderRadius: 6 }}>
        {/* drag / move / hide chrome — top-right, over the card corner */}
        <div style={{ position: "absolute", top: 6, right: 8, zIndex: 3, display: "inline-flex", gap: 2, alignItems: "center",
          background: "rgba(11,14,12,0.55)", borderRadius: 8, padding: "1px 3px" }}>
          <span title="Drag to move" style={{ cursor: "grab", color: DG_MUTE, fontSize: 14, padding: "0 3px" }}>⠿</span>
          <button title="Move earlier" onClick={() => step(k, -1)} style={dgBtn()}>▲</button>
          <button title="Move later" onClick={() => step(k, 1)} style={dgBtn()}>▼</button>
          <button title="Hide" onClick={() => hide(k)} style={dgBtn()}>×</button>
        </div>
        {w.render()}
      </div>
    );
  };

  return (
    <div>
      <div className="dash-cols" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
        {visible.map(chrome)}
      </div>
      {(layout.hidden.length > 0) && (
        <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: DG_MUTE }}>Hidden ·</span>
          {layout.hidden.map((k) => (
            <button key={k} onClick={() => restore(k)} title="Restore" style={{ padding: "5px 11px", borderRadius: 999, border: "1px solid rgba(242,237,228,0.2)", background: "transparent", color: DG_MUTE, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, cursor: "pointer" }}>
              + {byKey[k] ? (byKey[k].title || k) : k}
            </button>
          ))}
          <a href="#" onClick={(e) => { e.preventDefault(); reset(); }} style={{ marginLeft: "auto", fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase", color: DG_MUTE, textDecoration: "none", borderBottom: "1px solid rgba(242,237,228,0.25)" }}>Reset layout</a>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { DashGrid });
