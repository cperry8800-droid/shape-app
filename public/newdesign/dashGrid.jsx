// DashGrid — freely draggable + RESIZABLE dashboard widgets, powered by GridStack
// (window.GridStack, vendored at /vendor/gridstack/). GridStack owns the layout
// (drag / resize / x,y,w,h); React owns each card's CONTENT, portaled into the
// GridStack-managed item node so live data keeps rendering. Layout persists per
// role + tab to user_goals('dashboard_layout'). Pure helpers are inlined here as a
// mirror of public/newdesign/dashboardLayout.mjs — keep identical. Website only.
const DG_MUTE = "rgba(242,237,228,0.5)";

function dgWidgetW(size) { return size === "full" ? 12 : 6; }
function dgResolveGridLayout(saved, widgets) {
  const bySize = {}; widgets.forEach((w) => { bySize[w.key] = w.size; });
  const existing = new Set(widgets.map((w) => w.key));
  const hidden = (saved && Array.isArray(saved.hidden)) ? saved.hidden.filter((k) => existing.has(k)) : [];
  const hiddenSet = new Set(hidden);
  const savedItems = (saved && Array.isArray(saved.items)) ? saved.items.filter((i) => i && existing.has(i.id)) : [];
  const placed = new Set(savedItems.map((i) => i.id));
  const visible = [];
  for (const i of savedItems) { if (hiddenSet.has(i.id)) continue; visible.push({ key: i.id, x: i.x, y: i.y, w: i.w || dgWidgetW(bySize[i.id]), h: i.h }); }
  for (const w of widgets) { if (placed.has(w.key) || hiddenSet.has(w.key)) continue; visible.push({ key: w.key, w: dgWidgetW(w.size), autoPosition: true }); }
  return { visible, hidden };
}

// Inject the dark-theme overrides for GridStack chrome once.
let _dgStyled = false;
function dgInjectStyle() {
  if (_dgStyled || typeof document === "undefined") return; _dgStyled = true;
  const s = document.createElement("style");
  s.textContent = `
.dash-gridstack .grid-stack-item-content{overflow:hidden}
.dash-gridstack .grid-stack-placeholder>.placeholder-content{border:1.5px dashed rgba(46,224,196,0.75);background:rgba(46,224,196,0.07);border-radius:8px}
.dash-gridstack .ui-resizable-se{background-image:none;width:22px;height:22px;right:4px;bottom:4px;z-index:20;border-right:2.5px solid rgba(46,224,196,0.85);border-bottom:2.5px solid rgba(46,224,196,0.85);border-bottom-right-radius:6px;cursor:se-resize;opacity:.5;transition:opacity .12s}
.dash-gridstack .grid-stack-item:hover .ui-resizable-se{opacity:1}
.dash-wchrome{opacity:0;transition:opacity .12s}
.dash-gridstack .grid-stack-item:hover .dash-wchrome{opacity:1}
.dash-drag-handle{cursor:move}
`;
  document.head.appendChild(s);
}

// Guard GridStack's sizeToContent so it silently skips an item that has no child to
// measure yet (its ResizeObserver fires before React has portaled the card in, and the
// stock method logs "firstElementChild is null"). The observer re-fires once the portal
// renders, so the real content-fit measure still happens — this only suppresses the noise.
function dgPatchGridStack() {
  const GS = (typeof window !== "undefined") && window.GridStack;
  if (!GS || GS._dashResizeGuard || !GS.prototype || typeof GS.prototype.resizeToContent !== "function") return;
  const orig = GS.prototype.resizeToContent;
  GS.prototype.resizeToContent = function (el) {
    try {
      const c = el && el.querySelector && el.querySelector(".grid-stack-item-content");
      if (!c || !c.firstElementChild) return;   // nothing portaled in yet — skip quietly
    } catch (e) { /* fall through to the original */ }
    return orig.apply(this, arguments);
  };
  GS._dashResizeGuard = true;
}

function DashGrid({ role, tab = "today", widgets }) {
  const byKey = {}; widgets.forEach((w) => { byKey[w.key] = w; });
  const elRef = React.useRef(null);
  const gridRef = React.useRef(null);
  const docRef = React.useRef({});
  const itemRef = React.useRef({});   // key -> grid-item DOM element (for removeWidget)
  const [hosts, setHosts] = React.useState({}); // key -> .grid-stack-item-content (portal target)
  const [hidden, setHidden] = React.useState([]);
  const [ready, setReady] = React.useState(false);

  // saved layout for THIS role+tab from the merged doc.
  const savedFor = () => { try { return ((docRef.current[role] || {})[tab]) || null; } catch (e) { return null; } };
  const persist = (next) => {
    try {
      const r = { ...(docRef.current[role] || {}), [tab]: next };
      docRef.current = { ...docRef.current, [role]: r };
      if (window.shapeDb && window.shapeDb.saveUserGoals) window.shapeDb.saveUserGoals("dashboard_layout", docRef.current);
    } catch (e) {}
  };
  const persistFromGrid = () => {
    const grid = gridRef.current; if (!grid) return;
    let items = [];
    try { items = (grid.save(false) || []).map((n) => ({ id: n.id, x: n.x, y: n.y, w: n.w, h: n.h })); } catch (e) {}
    persist({ items, hidden });
  };

  // Add one widget to the grid; return its content host element for the portal.
  const addOne = (spec) => {
    const grid = gridRef.current; if (!grid) return null;
    const opts = { id: spec.key, w: spec.w, h: spec.h };
    if (spec.autoPosition) opts.autoPosition = true; else { opts.x = spec.x; opts.y = spec.y; }
    const el = grid.addWidget(opts);
    itemRef.current[spec.key] = el;
    // Portal the card directly into the GridStack-managed item-content; sizeToContent
    // (wired up by addWidget, guarded by dgPatchGridStack) fits the item to it.
    return el.querySelector(".grid-stack-item-content");
  };

  // ── init GridStack once per role/tab; load saved → add widgets → set portal hosts.
  React.useEffect(() => {
    if (typeof window === "undefined" || !window.GridStack || !elRef.current) return undefined;
    dgInjectStyle();
    dgPatchGridStack();
    let destroyed = false;
    const boot = () => {
      if (destroyed || !elRef.current) return;
      const grid = window.GridStack.init({
        column: 12, columnOpts: { breakpointForWindow: true, breakpoints: [{ w: 768, c: 1 }] },
        cellHeight: 64, margin: 8, float: true,
        handle: ".dash-drag-handle", resizable: { handles: "se" }, alwaysShowResizeHandle: true,
        sizeToContent: true, animate: true,
      }, elRef.current);
      gridRef.current = grid;
      const layout = dgResolveGridLayout(savedFor(), widgets);
      const nextHosts = {};
      grid.batchUpdate();
      for (const spec of layout.visible) { const host = addOne(spec); if (host) nextHosts[spec.key] = host; }
      grid.commit();
      setHidden(layout.hidden);
      setHosts(nextHosts);
      setReady(true);
      grid.on("change", persistFromGrid);
      grid.on("resizestop dragstop", persistFromGrid);
    };
    // shapeDb may be async; load the saved doc first, then boot.
    if (window.shapeDb && window.shapeDb.getUserGoals) {
      window.shapeDb.getUserGoals("dashboard_layout").then((doc) => { docRef.current = (doc && typeof doc === "object") ? doc : {}; boot(); }).catch(boot);
    } else { boot(); }
    return () => {
      destroyed = true;
      try { if (gridRef.current) gridRef.current.destroy(false); } catch (e) {}
      gridRef.current = null; itemRef.current = {};
    };
    // eslint-disable-next-line
  }, [role, tab]);

  // Heights are handled by GridStack's sizeToContent (a ResizeObserver fires when the
  // React portal renders each card) — no manual resizeToContent needed.

  const hide = (key) => {
    const grid = gridRef.current; const el = itemRef.current[key];
    if (grid && el) { try { grid.removeWidget(el, true); } catch (e) {} }
    delete itemRef.current[key];
    setHosts((h) => { const n = { ...h }; delete n[key]; return n; });
    const nextHidden = hidden.includes(key) ? hidden : [...hidden, key];
    setHidden(nextHidden);
    setTimeout(() => { let items = []; try { items = (grid.save(false) || []).map((n) => ({ id: n.id, x: n.x, y: n.y, w: n.w, h: n.h })); } catch (e) {} persist({ items, hidden: nextHidden }); }, 0);
  };
  const restore = (key) => {
    const w = byKey[key]; if (!w) return;
    const host = addOne({ key, w: dgWidgetW(w.size), autoPosition: true });
    setHosts((h) => ({ ...h, [key]: host }));
    const nextHidden = hidden.filter((x) => x !== key);
    setHidden(nextHidden);
    setTimeout(() => { persistFromGrid(); }, 60);
  };
  const reset = () => {
    const grid = gridRef.current; if (!grid) return;
    try { grid.removeAll(true); } catch (e) {}
    itemRef.current = {};
    const layout = dgResolveGridLayout(null, widgets);
    const nextHosts = {};
    grid.batchUpdate();
    for (const spec of layout.visible) { const host = addOne(spec); if (host) nextHosts[spec.key] = host; }
    grid.commit();
    setHosts(nextHosts); setHidden([]);
    setTimeout(() => persist({ items: [], hidden: [] }), 0);
  };

  const chrome = (key) => {
    const w = byKey[key]; if (!w) return null;
    const content = w.render();
    if (content == null || content === false) return null;
    return (
      <div style={{ position: "relative" }}>
        <div className="dash-drag-handle dash-wchrome" style={{ position: "absolute", top: 5, right: 6, zIndex: 5, display: "inline-flex", gap: 1, alignItems: "center", background: "rgba(11,14,12,0.72)", borderRadius: 7, padding: "1px 2px" }}>
          <span title="Drag to move" style={{ color: DG_MUTE, fontSize: 12, padding: "0 2px", lineHeight: 1 }}>⠿</span>
          <button title="Hide" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); hide(key); }} style={{ width: 18, height: 18, borderRadius: 5, border: 0, background: "transparent", color: DG_MUTE, fontSize: 12, fontWeight: 800, cursor: "pointer", lineHeight: 1, padding: 0 }}>×</button>
        </div>
        {content}
      </div>
    );
  };

  return (
    <div>
      <div ref={elRef} className="grid-stack dash-gridstack"></div>
      {Object.keys(hosts).map((key) => (hosts[key] ? ReactDOM.createPortal(chrome(key), hosts[key]) : null))}
      {hidden.length > 0 && (
        <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: DG_MUTE }}>Hidden ·</span>
          {hidden.map((key) => (
            <button key={key} onClick={() => restore(key)} title="Restore" style={{ padding: "5px 11px", borderRadius: 999, border: "1px solid rgba(242,237,228,0.2)", background: "transparent", color: DG_MUTE, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, cursor: "pointer" }}>
              + {byKey[key] ? (byKey[key].title || key) : key}
            </button>
          ))}
          <a href="#" onClick={(e) => { e.preventDefault(); reset(); }} style={{ marginLeft: "auto", fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase", color: DG_MUTE, textDecoration: "none", borderBottom: "1px solid rgba(242,237,228,0.25)" }}>Reset layout</a>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { DashGrid });
