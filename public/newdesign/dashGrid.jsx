// DashGrid — freely draggable + RESIZABLE dashboard widgets, powered by GridStack
// (window.GridStack, vendored at /vendor/gridstack/). GridStack owns the layout
// (drag / resize / x,y,w,h); React owns each card's CONTENT, portaled into the
// GridStack-managed item node so live data keeps rendering. Layout persists per
// role + tab to user_goals('dashboard_layout'). Pure helpers are inlined here as a
// mirror of public/newdesign/dashboardLayout.mjs — keep identical. Website only.
const DG_MUTE = "rgba(242,237,228,0.5)";

function dgWidgetW(size) { return size === "full" ? 12 : 6; }

// ⚠ A WIDGET DECLARES EMPTINESS; IT DOES NOT DISAPPEAR FROM THE LIST. Call sites
// used to write `flag ? { key, … } : null`, and that shape is unusable here for a
// reason nothing on the page could see: the boot effect below is keyed on
// `[role, tab]`, so the array it resolves a layout from is the one captured on the
// FIRST render — where every "is it loaded / is it live" flag is still false. A
// conditionally-omitted widget was therefore absent when the portal hosts were
// created, no host was ever made for it, and the card NEVER MOUNTED AT ALL.
// Measured: six cards across dashProgress and dashTrain were invisible to every
// signed-in member, silently, for as long as they had been written that way.
//
// So the contract is `empty: true` on a widget that has nothing to show. The entry
// stays in the array, this filter skips it, and the sync effect adds or removes its
// item as the flag flips. That also answers the second half of the problem — an item
// whose card rendered nothing still occupied a row (measured at 18px: h=1 ×
// cellHeight 2 + 16px of item-content inset) — because a widget with nothing to show
// now has no item at all rather than an empty one.
function dgVisibleWidgets(widgets) { return (widgets || []).filter((w) => w && !w.empty); }

// ⚠ THE TWO FILTERS BELOW ARE DELIBERATELY DIFFERENT SETS. `hidden` is a member
// preference about a widget in this tab's catalogue, so it is filtered against every
// DECLARED key — an empty spell must not silently forget that they hid the card.
// Placement is filtered against the VISIBLE keys, because only a widget with
// something to show gets an item.
function dgResolveGridLayout(saved, allWidgets) {
  const widgets = dgVisibleWidgets(allWidgets);
  const bySize = {}; widgets.forEach((w) => { bySize[w.key] = w.size; });
  const declared = new Set((allWidgets || []).filter(Boolean).map((w) => w.key));
  const existing = new Set(widgets.map((w) => w.key));
  // hidden: keep only declared keys, deduped (first occurrence wins).
  const hiddenSet = new Set(); const hidden = [];
  if (saved && Array.isArray(saved.hidden)) for (const k of saved.hidden) if (declared.has(k) && !hiddenSet.has(k)) { hidden.push(k); hiddenSet.add(k); }
  // saved items: keep only existing ids, deduped (first occurrence wins).
  const placed = new Set(); const savedItems = [];
  if (saved && Array.isArray(saved.items)) for (const i of saved.items) if (i && existing.has(i.id) && !placed.has(i.id)) { savedItems.push(i); placed.add(i.id); }
  const visible = [];
  for (const i of savedItems) { if (hiddenSet.has(i.id)) continue; visible.push({ key: i.id, x: i.x, y: i.y, w: i.w || dgWidgetW(bySize[i.id]), h: i.h }); }
  for (const w of widgets) { if (placed.has(w.key) || hiddenSet.has(w.key)) continue; visible.push({ key: w.key, w: dgWidgetW(w.size), autoPosition: true }); }
  return { visible, hidden };
}

// What the grid must ADD and REMOVE to be in step with the current widget array.
// ⚠ THE DECISION IS PURE SO IT CAN BE DRIVEN. The effect that applies it talks to
// GridStack and React portals, which no unit test can stand up; if the choice of what
// to add, what to drop and WHERE a returning card lands lived inside it, none of that
// would be checkable except by eye.
function dgPlanGridSync({ currentKeys, widgets, hidden, saved, lastPos }) {
  const hiddenSet = new Set(hidden || []);
  const want = dgVisibleWidgets(widgets).filter((w) => !hiddenSet.has(w.key));
  const wantKeys = new Set(want.map((w) => w.key));
  const have = new Set(currentKeys || []);
  const gone = [...have].filter((k) => !wantKeys.has(k));
  const savedById = {};
  for (const i of ((saved && saved.items) || [])) if (i && i.id) savedById[i.id] = i;
  const fresh = [];
  for (const w of want) {
    if (have.has(w.key)) continue;
    // ⚠ LAST POSITION FIRST, SAVED SECOND. A card that empties and comes back inside
    // one session has a remembered position before anything is persisted; preferring
    // the saved document would drop it back to where it was at page load, undoing a
    // move the member made in between.
    const si = (lastPos && lastPos[w.key]) || savedById[w.key];
    fresh.push({
      key: w.key,
      spec: si
        ? { key: w.key, x: si.x, y: si.y, w: si.w || dgWidgetW(w.size), h: si.h }
        : { key: w.key, w: dgWidgetW(w.size), autoPosition: true },
    });
  }
  return { gone, fresh };
}

// ⚠ A SAVED ARRANGEMENT IS PER DECLARED WIDGET, NOT PER RENDERED ITEM. `grid.save()`
// only reports items that exist right now, so writing it verbatim DELETES the
// member's placement for every card that happens to be empty at that moment — and
// the card then comes back auto-positioned at the bottom instead of where they left
// it. Entries for declared-but-absent keys are carried forward; entries for keys the
// tab no longer declares are dropped, so the document stays bounded by the catalogue.
function dgMergeLayoutItems(live, saved, declaredKeys) {
  const declared = new Set(declaredKeys || []);
  const out = []; const seen = new Set();
  for (const i of (live || [])) { if (!i || i.id == null || seen.has(i.id)) continue; seen.add(i.id); out.push(i); }
  for (const i of ((saved && saved.items) || [])) { if (!i || i.id == null || seen.has(i.id) || !declared.has(i.id)) continue; seen.add(i.id); out.push(i); }
  return out;
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
  const byKey = {}; widgets.forEach((w) => { if (w && w.key != null) byKey[w.key] = w; });
  const elRef = React.useRef(null);
  const gridRef = React.useRef(null);
  const docRef = React.useRef({});
  const itemRef = React.useRef({});   // key -> grid-item DOM element (for removeWidget)
  const hadSavedRef = React.useRef(false);  // was there a saved layout at boot (before change events)?
  const [hosts, setHosts] = React.useState({}); // key -> .grid-stack-item-content (portal target)
  // Mirrors of render-scope values that the grid's own callbacks need. `persistFromGrid`
  // is wired into GridStack's event handlers at boot, so it closes over render 1
  // forever — it must read the CURRENT widget catalogue through a ref or it would carry
  // forward against a stale one. Same reasoning for `hosts` in the sync effect below,
  // which must read the current set without taking a dependency on it and re-running.
  const hostsRef = React.useRef({});
  hostsRef.current = hosts;
  const declaredKeysRef = React.useRef([]);
  declaredKeysRef.current = widgets.map((w) => w && w.key).filter((k) => k != null);
  // Where each item last sat, so a card that empties and comes back lands where the
  // member left it even before anything has been persisted.
  const lastPosRef = React.useRef({});
  // ⚠ AND `hidden` HAS THE SAME PROBLEM, WITH TEETH. `persistFromGrid` is wired into
  // GridStack's change/dragstop handlers at boot, so it held render 1's `hidden` — an
  // empty array — for the life of the page: hide a card, then drag ANY card, and the
  // write that followed said `hidden: []`. The member's hide was silently discarded on
  // their next interaction. Read through a ref so the handler sees the current list.
  const hiddenRef = React.useRef([]);
  const [hidden, setHidden] = React.useState([]);
  hiddenRef.current = hidden;
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
    // ⚠ NEVER PERSIST THE RESPONSIVE PROJECTION OF A LAYOUT. The grid is inited
    // with `breakpoints: [{ w: 768, c: 1 }]`, so below 768px GridStack calls
    // column(1) and clamps every widget to x:0/w:1 — then fires `change`, which
    // lands here and would upsert that as the account's saved arrangement. The
    // breakpoint was unreachable in production while the shells declared no
    // viewport meta (a phone reported 980px); adding the meta made every phone
    // visit overwrite the member's desktop dashboard, restored one-column on
    // every device. A collapsed grid is a VIEW of the layout, not the layout.
    try { if (typeof grid.getColumn === "function" && grid.getColumn() !== 12) return; } catch (e) { return; }
    let live = [];
    try { live = (grid.save(false) || []).map((n) => ({ id: n.id, x: n.x, y: n.y, w: n.w, h: n.h })); } catch (e) {}
    persist({ items: dgMergeLayoutItems(live, savedFor(), declaredKeysRef.current), hidden: hiddenRef.current });
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

  // ── keep the grid in step with the widget list AFTER boot ────────────────
  // ⚠ THIS IS THE OTHER HALF OF THE `empty` CONTRACT, AND THE SUBSTANCE OF THE FIX.
  // `boot()` resolves its layout from the widget array captured when its effect ran,
  // which is render 1 — before any fetch has resolved. A widget that becomes
  // non-empty later needs a host created for it; one that becomes empty needs its
  // item torn down. Both have to happen WITHOUT disturbing where the member has
  // placed everything else.
  //
  // Keyed on the visible key set, not on `widgets` — whose identity changes on every
  // render. This must run when the SET changes, not when the page re-renders.
  const visibleSig = dgVisibleWidgets(widgets).map((w) => w.key + ":" + w.size).join("|");
  React.useEffect(() => {
    if (!ready) return undefined;
    const grid = gridRef.current; if (!grid) return undefined;
    const { gone, fresh } = dgPlanGridSync({
      currentKeys: Object.keys(itemRef.current), widgets, hidden,
      saved: savedFor(), lastPos: lastPosRef.current,
    });
    if (gone.length === 0 && fresh.length === 0) return undefined;
    const nextHosts = { ...hostsRef.current };

    // ⚠ ONE BATCH FOR BOTH HALVES. GridStack fires change/added/removed synchronously
    // out of commit(), so removing outside the batch would persist a half-applied
    // arrangement — the member's dashboard as it looked between two of our own writes.
    grid.batchUpdate();
    for (const key of gone) {
      const el = itemRef.current[key];
      // Remember where it sat before it goes, so it can come back to the same place.
      // ⚠ ONLY FROM THE 12-COLUMN GRID. Below the 768px breakpoint GridStack clamps
      // every node to x:0/w:1, and remembering THAT brings the card back one twelfth
      // of a row wide once the window widens again — and `dgPlanGridSync` prefers this
      // over the saved 12-column placement, so it would win. `persistFromGrid` refuses
      // to write the collapsed layout for the same reason: a collapsed grid is a VIEW
      // of the layout, not the layout.
      try {
        const n = el && el.gridstackNode;
        const cols = (typeof grid.getColumn === "function") ? grid.getColumn() : 12;
        if (n && cols === 12) lastPosRef.current[key] = { id: key, x: n.x, y: n.y, w: n.w, h: n.h };
      } catch (e) {}
      // ⚠ `removeWidget(el, true)` REMOVES THE DOM NODE, which is the portal's
      // container. React must stop portaling into it in the SAME commit, so the host
      // is dropped here rather than left pointing at a detached node.
      try { if (el) grid.removeWidget(el, true); } catch (e) { /* already gone */ }
      delete itemRef.current[key];
      delete nextHosts[key];
    }
    for (const f of fresh) { const host = addOne(f.spec); if (host) nextHosts[f.key] = host; }
    grid.commit();

    setHosts(nextHosts);
    return undefined;
    // eslint-disable-next-line
  }, [visibleSig, ready, hidden.join("|")]);

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
    const nextHidden = hidden.includes(key) ? hidden : [...hidden, key];
    // ⚠ BEFORE THE GRID MUTATION, NOT AFTER IT. `removeWidget` fires `change`
    // SYNCHRONOUSLY when not batching, and that lands in `persistFromGrid` — which
    // reads this ref. Assigning it afterwards meant the first of two back-to-back
    // upserts carried the OLD hidden list, and the document was only correct if the
    // network happened to preserve the order of two independent writes.
    hiddenRef.current = nextHidden;
    if (grid && el) { try { grid.removeWidget(el, true); } catch (e) {} }
    delete itemRef.current[key];
    setHosts((h) => { const n = { ...h }; delete n[key]; return n; });
    setHidden(nextHidden);
    setTimeout(() => { let live = []; try { live = (grid.save(false) || []).map((n) => ({ id: n.id, x: n.x, y: n.y, w: n.w, h: n.h })); } catch (e) {} persist({ items: dgMergeLayoutItems(live, savedFor(), declaredKeysRef.current), hidden: nextHidden }); }, 0);
  };
  const restore = (key) => {
    const w = byKey[key];
    // An empty widget has no chip to click (see the hidden bar), but restoring one
    // would re-create exactly the empty 18px item this change exists to remove.
    if (!w || w.empty) return;
    const nextHidden = hidden.filter((x) => x !== key);
    hiddenRef.current = nextHidden;   // before addOne: it fires added/change synchronously
    // ⚠ THE SAME PLACEMENT RULE AS THE SYNC EFFECT, through the same function. This
    // used to always auto-position, so a card the member had dragged to the top came
    // back at the bottom — while `dgMergeLayoutItems` was busy preserving the exact
    // x/y it ignored. Two paths deciding where a returning card goes is one too many.
    const plan = dgPlanGridSync({ currentKeys: Object.keys(itemRef.current), widgets, hidden: nextHidden, saved: savedFor(), lastPos: lastPosRef.current });
    const spec = (plan.fresh.find((f) => f.key === key) || {}).spec;
    const host = addOne(spec || { key, w: dgWidgetW(w.size), autoPosition: true });
    setHosts((h) => ({ ...h, [key]: host }));
    setHidden(nextHidden);
    setTimeout(() => { persistFromGrid(); }, 60);
  };
  const reset = () => {
    const grid = gridRef.current; if (!grid) return;
    lastPosRef.current = {};
    hiddenRef.current = [];   // before removeAll/commit, both of which fire `change`
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

  // ⚠ A HIDDEN KEY MAY BE EMPTY RIGHT NOW, AND THAT IS THE POINT OF KEEPING IT. The
  // preference survives an empty spell (see dgResolveGridLayout), but it gets no chip
  // while there is nothing behind it — offering "+ The cycle" to restore a card that
  // would render as an empty 18px slot is the bug, wearing a button. Named ONCE
  // because the bar's visibility and its contents must never disagree: a guard that
  // matched the expression found the copy the regression had not touched.
  const hiddenChips = hidden.filter((k) => byKey[k] && !byKey[k].empty);

  const chrome = (key) => {
    // ⚠ `w.empty` IS CHECKED HERE, NOT ONLY IN THE EFFECT, AND WITHOUT IT THE `empty`
    // CONTRACT IS A CRASH. The item is torn down by the sync effect, which runs AFTER
    // the commit — so on the frame where a widget flips to empty its host still
    // exists and this portal still renders. Under the old `cond ? {…} : null` shape
    // `byKey[key]` was undefined and the `!w` guard caught it; an `empty` entry is
    // still in `byKey`, so `render()` would be called on exactly the state it was
    // declared empty for. Measured against real bodies: clientScore's momentum card
    // reads `momentum.value` and dashTrain's reads `tonight.day.workout`, both null
    // in that frame — a TypeError thrown during render, with no error boundary
    // anywhere in public/newdesign, blanks the whole page.
    const w = byKey[key]; if (!w || w.empty) return null;
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
      {/* ⚠ THE BAR IS KEYED ON `hidden`, THE CHIPS ON `hiddenChips`, AND THE DIFFERENCE
          IS THE RESET LINK. Gating the whole bar on the chips took `Reset layout` away
          with them — so a member whose only hidden card happened to be empty (a failed
          fetch is enough) had a dashboard they could not reset and nothing on screen
          explaining why. */}
      {hidden.length > 0 && (
        <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {hiddenChips.length > 0 && (
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: DG_MUTE }}>Hidden ·</span>
          )}
          {hiddenChips.map((key) => (
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
