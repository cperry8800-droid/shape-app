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
  // hidden: keep only existing keys, deduped (first occurrence wins).
  const hiddenSet = new Set(); const hidden = [];
  if (saved && Array.isArray(saved.hidden)) for (const k of saved.hidden) if (existing.has(k) && !hiddenSet.has(k)) { hidden.push(k); hiddenSet.add(k); }
  // saved items: keep only existing ids, deduped (first occurrence wins).
  const placed = new Set(); const savedItems = [];
  if (saved && Array.isArray(saved.items)) for (const i of saved.items) if (i && existing.has(i.id) && !placed.has(i.id)) { savedItems.push(i); placed.add(i.id); }
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
.dash-gridstack .grid-stack-item-content{overflow:hidden!important}
.dash-gridstack .dash-plate--bracket::after{display:none!important}
.dash-gridstack .grid-stack-placeholder>.placeholder-content{border:1.5px dashed rgba(46,224,196,0.75);background:rgba(46,224,196,0.07);border-radius:8px}
.dash-gridstack .ui-resizable-se{background:transparent!important;background-image:none!important;box-sizing:border-box!important;min-width:0!important;min-height:0!important;width:28px!important;height:28px!important;right:0!important;bottom:0!important;z-index:20;border:0!important;clip-path:none!important;border-radius:0!important;cursor:se-resize;opacity:1!important}
.dash-rs{position:absolute;right:7px;bottom:7px;width:12px;height:12px;background:rgba(46,224,196,0.5);clip-path:polygon(100% 0,0 100%,100% 100%);border-bottom-right-radius:2px;pointer-events:none;transition:background .12s;z-index:4}
.dash-gridstack .grid-stack-item:hover .dash-rs{background:rgba(46,224,196,0.95)}
.dash-wchrome{opacity:0;transition:opacity .12s}
.dash-gridstack .grid-stack-item:hover .dash-wchrome,.dash-gridstack .grid-stack-item:focus-within .dash-wchrome{opacity:1}
@media (hover:none){.dash-wchrome{opacity:1}}
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
  const hadSavedRef = React.useRef(false);  // was there a saved layout at boot (before change events)?
  const [hosts, setHosts] = React.useState({}); // key -> .grid-stack-item-content (portal target)
  const [hidden, setHidden] = React.useState([]);
  const [ready, setReady] = React.useState(false);

  // saved layout for THIS role+tab from the merged doc.
  const savedFor = () => { try { return ((docRef.current[role] || {})[tab]) || null; } catch (e) { return null; } };
  const persist = (next) => {
    try {
      const r = { ...(docRef.current[role] || {}), [tab]: next };
      docRef.current = { ...docRef.current, [role]: r };
      if (window.shapeDb && window.shapeDb.saveUserGoals) Promise.resolve(window.shapeDb.saveUserGoals("dashboard_layout", docRef.current)).catch(() => {});
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
        cellHeight: 2, margin: 8, float: true,
        handle: ".dash-drag-handle", resizable: { handles: "se" }, alwaysShowResizeHandle: true,
        // sizeToContent stays OFF: its auto-cascade overrode our explicit ordered layout,
        // and its observer can't see React-portaled content anyway. We fit heights via
        // manual grid.resizeToContent() calls (see the fit effect) instead.
        sizeToContent: false, animate: true,
      }, elRef.current);
      gridRef.current = grid;
      const savedAtBoot = savedFor();
      hadSavedRef.current = !!savedAtBoot;   // capture BEFORE change events repopulate docRef
      const layout = dgResolveGridLayout(savedAtBoot, widgets);
      const nextHosts = {};
      grid.batchUpdate();
      for (const spec of layout.visible) { const host = addOne(spec); if (host) nextHosts[spec.key] = host; }
      grid.commit();
      setHidden(layout.hidden);
      setHosts(nextHosts);
      setReady(true);
      grid.on("change", persistFromGrid);
      grid.on("dragstop", persistFromGrid);
      // On a width resize, snap the item's height back to its content (height auto-fits).
      grid.on("resizestop", (ev, el) => { try { grid.resizeToContent(el); } catch (e) {} persistFromGrid(); });
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

  // GridStack's sizeToContent observer can't catch React-portaled content: item-content
  // is height-constrained, so growing its child never changes item-content's own size and
  // the observer never re-fires. So fit each item to its card ourselves once the portals
  // render (and on window resize, when cards reflow). resizeToContent reads scrollHeight,
  // which only reports the true content height because item-content is overflow:hidden.
  React.useEffect(() => {
    if (!ready) return undefined;
    const grid = gridRef.current; if (!grid) return undefined;
    const fitAll = () => {
      Object.keys(itemRef.current).forEach((key) => {
        const item = itemRef.current[key];
        if (item) { try { grid.resizeToContent(item); } catch (e) {} }
      });
    };
    // The fine cellHeight makes new items bunch at the top, so the auto-position grow
    // cascade resolves their order ambiguously. Re-lay-them-out in widget order (full-width
    // stacked, half-width paired) from the fitted heights — a deterministic masonry pack with
    // no vertical gaps. Runs only on a fresh layout (no saved), so a user's custom placement
    // is never reordered.
    const relayoutInOrder = () => {
      // Build the whole masonry layout and apply it ATOMICALLY via grid.load — incremental
      // grid.update calls get re-cascaded by the collision/animation engine, but load sets the
      // complete layout in one pass (addRemove=false keeps the React portal nodes intact).
      // Heights are computed DIRECTLY from each card's measured content height (not from
      // GridStack's resizeToContent, which doesn't refit reliably when the column count changes
      // at the mobile breakpoint) — h*cellHeight just clears the card, so the box hugs the card
      // (slop ~0) at every width. Column-aware: a card wider-or-equal to the current column count
      // (full-width cards, or everything in the 1-column mobile layout) stacks; narrower cards pair.
      const cols = grid.getColumn() || 12;
      const cell = grid.getCellHeight() || 2;
      let y = 0, xCursor = 0, rowH = 0;
      const layout = [];
      widgets.forEach((w) => {
        const item = itemRef.current[w.key]; if (!item) return;
        const node = item.gridstackNode || {};
        const id = node.id || w.key;
        const content = item.querySelector(".grid-stack-item-content");
        const card = content && content.firstElementChild;
        const cardH = card ? card.getBoundingClientRect().height : 0;
        // item-content is inset 8px top+bottom (16px) inside the item, so the item must be
        // cardH + 16 tall for the card to fit without clipping; +2 keeps a hair of slop.
        const h = Math.max(1, Math.ceil((cardH + 18) / cell));
        let wW = dgWidgetW(w.size);
        if (wW > cols) wW = cols;                                // narrow: clamp to available columns
        if (wW >= cols) {                                        // full-width (or single-column) → stack
          if (xCursor !== 0) { y += rowH; xCursor = 0; rowH = 0; }
          layout.push({ id, x: 0, y, w: wW, h }); y += h;
        } else if (xCursor === 0) {
          layout.push({ id, x: 0, y, w: wW, h }); xCursor = wW; rowH = h;
        } else {
          layout.push({ id, x: xCursor, y, w: wW, h }); y += Math.max(rowH, h); xCursor = 0; rowH = 0;
        }
      });
      try { grid.load(layout, false); } catch (e) {}
    };
    // Fit heights, then (on a fresh/demo layout) re-apply the ordered pack. This must run on
    // EVERY fit — including window resize — because a bare resizeToContent re-cascades with
    // float:true and would undo the ordered grid.load. relayoutInOrder is idempotent (grid.load
    // of the same computed layout), so re-running it just re-asserts the tidy layout. On a saved
    // layout we only fit heights and leave the user's placement alone.
    const run = () => { fitAll(); if (!hadSavedRef.current) relayoutInOrder(); };
    // Debounced re-run for content that loads/changes AFTER the initial fit (async card data,
    // text reflow, the user resizing a card). We observe each card (the item-content's first
    // child) — its height only changes on real content changes, NOT when GridStack resizes the
    // item (the card is content-sized, not height:100%), so this never loops on grid animation.
    let debounce = null;
    const refit = () => { if (debounce) return; debounce = setTimeout(() => { debounce = null; run(); }, 130); };
    let ro = null;
    const observeCards = () => {
      if (typeof ResizeObserver === "undefined") return;
      if (!ro) ro = new ResizeObserver(refit);
      else ro.disconnect();
      Object.keys(itemRef.current).forEach((key) => {
        const item = itemRef.current[key];
        const content = item && item.querySelector(".grid-stack-item-content");
        const card = content && content.firstElementChild;
        if (card) ro.observe(card);
      });
    };
    const t1 = setTimeout(run, 0);
    const t2 = setTimeout(() => { run(); observeCards(); }, 200);
    window.addEventListener("resize", run);
    return () => {
      clearTimeout(t1); clearTimeout(t2); if (debounce) clearTimeout(debounce);
      if (ro) { try { ro.disconnect(); } catch (e) {} }
      window.removeEventListener("resize", run);
    };
  }, [hosts, ready]);

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
          <button type="button" title="Hide" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); hide(key); }} style={{ width: 18, height: 18, borderRadius: 5, border: 0, background: "transparent", color: DG_MUTE, fontSize: 12, fontWeight: 800, cursor: "pointer", lineHeight: 1, padding: 0 }}>×</button>
        </div>
        {content}
        <div className="dash-rs" aria-hidden="true" />
      </div>
    );
  };

  return (
    <div>
      {/* min-height reserves space so the page doesn't collapse to 0 then jump down
          when GridStack measures + positions the cards in JS after mount (CLS guard) */}
      <div ref={elRef} className="grid-stack dash-gridstack" style={{ minHeight: "60vh" }}></div>
      {Object.keys(hosts).map((key) => (hosts[key] ? ReactDOM.createPortal(chrome(key), hosts[key]) : null))}
      {hidden.length > 0 && (
        <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: DG_MUTE }}>Hidden ·</span>
          {hidden.map((key) => (
            <button type="button" key={key} onClick={() => restore(key)} title="Restore" style={{ padding: "5px 11px", borderRadius: 999, border: "1px solid rgba(242,237,228,0.2)", background: "transparent", color: DG_MUTE, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, cursor: "pointer" }}>
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
