// DashGrid — freely draggable + RESIZABLE dashboard widgets, powered by GridStack
// (window.GridStack, vendored at /vendor/gridstack/). GridStack owns the layout
// (drag / resize / x,y,w,h); React owns each card's CONTENT, portaled into the
// GridStack-managed item node so live data keeps rendering. Layout persists per
// role + tab to user_goals('dashboard_layout'). Pure helpers are inlined here as a
// mirror of public/newdesign/dashboardLayout.mjs — keep identical. Website only.
const DG_MUTE = "var(--sh-ink2, #a09b94)";

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

// The setting groups a widget actually offers. Named once — the gear's visibility and
// the panel's contents read the SAME list, so a card can never show a ⚙ that opens
// nothing. A group with fewer than two options is dropped: a picker with one choice is
// a label wearing a control.
function dgSettingGroups(w) {
  const gs = (w && w.settings) || [];
  if (!Array.isArray(gs)) return [];
  return gs.filter((g) => g && g.key && Array.isArray(g.options) && g.options.length > 1 && typeof g.onPick === "function");
}

// The keys of the widgets a tab OFFERS but does not show by default — `optional: true`
// on the declaration. In declaration order, because that is the order the catalogue
// lists them and the order an all-off set is written into `hidden`.
//
// ⚠ AN OPTIONAL WIDGET IS OFF THE BOARD UNTIL THE MEMBER ADDS IT, AND THAT IS STORED
// AS A POSITIVE CHOICE. The default board is the one every coach has had; a widget
// added to the catalogue must not appear on anyone's dashboard unasked, and a stored
// `hidden` list cannot express "off unless chosen" — a member who never touched the
// board has no document at all. So an optional widget's ON state lives in `added`,
// while a default widget's OFF state lives in `hidden`, and the two never mix: the
// engine's own state is ONE effective hidden list (see dgResolveGridLayout), and
// `dgSplitHidden` is what turns it back into the two lists the document holds.
function dgOptionalKeys(widgets) {
  return (widgets || []).filter((w) => w && w.optional && w.key != null).map((w) => w.key);
}

// ⚠ THE TWO FILTERS BELOW ARE DELIBERATELY DIFFERENT SETS. `hidden` is a member
// preference about a widget in this tab's catalogue, so it is filtered against every
// DECLARED key — an empty spell must not silently forget that they hid the card.
// Placement is filtered against the VISIBLE keys, because only a widget with
// something to show gets an item. The `hidden` it returns is the EFFECTIVE list: the
// default widgets the member hid, then every optional widget they have not added.
function dgResolveGridLayout(saved, allWidgets) {
  const widgets = dgVisibleWidgets(allWidgets);
  const bySize = {}; widgets.forEach((w) => { bySize[w.key] = w.size; });
  const declared = new Set((allWidgets || []).filter(Boolean).map((w) => w.key));
  const optional = dgOptionalKeys(allWidgets);
  const optionalSet = new Set(optional);
  const existing = new Set(widgets.map((w) => w.key));
  // hidden: a DEFAULT widget the member hid — declared keys only, deduped (first
  // occurrence wins). An optional key in here is ignored: its state is `added`'s.
  const hiddenSet = new Set(); const hidden = [];
  if (saved && Array.isArray(saved.hidden)) for (const k of saved.hidden) if (declared.has(k) && !optionalSet.has(k) && !hiddenSet.has(k)) { hidden.push(k); hiddenSet.add(k); }
  // added: an OPTIONAL widget the member put on the board — optional keys only. A key this
  // build does not declare renders nothing, so it goes on no board here — but it is CARRIED
  // THROUGH the write (see splitHidden), so the build that does declare it still finds it.
  const addedSet = new Set();
  if (saved && Array.isArray(saved.added)) for (const k of saved.added) if (optionalSet.has(k)) addedSet.add(k);
  // …and every optional widget NOT added is hidden, after the member's own hides.
  for (const k of optional) if (!addedSet.has(k) && !hiddenSet.has(k)) { hidden.push(k); hiddenSet.add(k); }
  // saved items: keep only existing ids, deduped (first occurrence wins).
  const placed = new Set(); const savedItems = [];
  if (saved && Array.isArray(saved.items)) for (const i of saved.items) if (i && existing.has(i.id) && !placed.has(i.id)) { savedItems.push(i); placed.add(i.id); }
  const visible = [];
  for (const i of savedItems) { if (hiddenSet.has(i.id)) continue; visible.push({ key: i.id, x: i.x, y: i.y, w: i.w || dgWidgetW(bySize[i.id]), h: i.h }); }
  for (const w of widgets) { if (placed.has(w.key) || hiddenSet.has(w.key)) continue; visible.push({ key: w.key, w: dgWidgetW(w.size), autoPosition: true }); }
  return { visible, hidden };
}

// The inverse of the merge above: what the document's `hidden` and `added` lists must
// say for the engine's ONE effective hidden list. `hidden` on disk holds only default
// widgets (declared, deduped); `added` holds the optional widgets NOT in the effective
// list. Written from here and nowhere else, so the two lists cannot disagree about a key.
function dgSplitHidden(hidden, allWidgets, prevAdded) {
  const declared = new Set((allWidgets || []).filter(Boolean).map((w) => w.key));
  const optional = dgOptionalKeys(allWidgets);
  const optionalSet = new Set(optional);
  const hiddenSet = new Set(hidden || []);
  const out = [];
  for (const k of (hidden || [])) if (declared.has(k) && !optionalSet.has(k) && out.indexOf(k) < 0) out.push(k);
  const added = optional.filter((k) => !hiddenSet.has(k));
  // ⚠ AN `added` KEY THIS BUILD DOES NOT DECLARE IS CARRIED FORWARD, NEVER REBUILT AWAY.
  // `added` is derived from the CURRENT catalogue, so a page running an older build — a
  // dashboard left open across a deploy, a cached shell — would otherwise drop a widget the
  // member turned on somewhere newer on its next whole-document save, with nothing on screen
  // saying so. Only a key this build does not declare AT ALL is kept: one it declares as a
  // default belongs in `hidden`, and one it declares as optional is already decided above.
  const keep = new Set(added);
  for (const k of (prevAdded || [])) if (typeof k === "string" && k && !declared.has(k) && !keep.has(k)) { added.push(k); keep.add(k); }
  return { hidden: out, added };
}

// One row per declared widget for the catalogue, in declaration order.
//   on:     it has a grid item right now (not hidden, not empty)
//   canAdd: it is hidden and would render something if added
//   why:    for an EMPTY widget, the reason nothing can be added or shown yet
// ⚠ AN EMPTY WIDGET CAN NEITHER BE ADDED NOR REMOVED FROM HERE. Adding one would
// re-create exactly the empty 18px item the `empty` contract exists to remove
// (restore() refuses it for the same reason); removing one flips a preference about a
// card nobody can see. It is listed, with its reason, so the catalogue is honest about
// what exists — never as a control that does nothing.
function dgCatalogRows(widgets, hidden) {
  const hiddenSet = new Set(hidden || []);
  return (widgets || []).filter((w) => w && w.key != null).map((w) => {
    const empty = !!w.empty;
    const off = hiddenSet.has(w.key);
    return {
      key: w.key,
      title: w.title || String(w.key),
      blurb: typeof w.blurb === "string" && w.blurb ? w.blurb : null,
      optional: !!w.optional,
      empty,
      off,
      on: !off && !empty,
      canAdd: off && !empty,
      why: empty ? (typeof w.emptyWhy === "string" && w.emptyWhy ? w.emptyWhy : "nothing to show yet") : null,
    };
  });
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
.dash-gridstack .grid-stack-placeholder>.placeholder-content{border:1.5px dashed rgba(var(--sh-accent-rgb, 46,224,196),0.75);background:rgba(var(--sh-accent-rgb, 46,224,196),0.07);border-radius:8px}
.dash-gridstack .grid-stack-item:hover .dash-rs{background:rgba(var(--sh-accent-rgb, 46,224,196),0.95)}
/* ⚠ FADED, NOT INVISIBLE. At opacity 0 the drag handle, the ⚙ and the × existed only
   for a member who happened to hover the card — measured on the coach Today: seven
   cards, seven chromes at opacity 0, and nothing else on the page saying the board
   could be rearranged (review 2026-09-21). A control that is discoverable only by
   accident is, to most people, one that does not exist. */
.dash-wchrome{opacity:.4;transition:opacity .12s}
.dash-gridstack .grid-stack-item:hover .dash-wchrome,.dash-gridstack .grid-stack-item:focus-within .dash-wchrome{opacity:1}
@media (hover:none){.dash-wchrome{opacity:1}}
.dash-drag-handle{cursor:grab;touch-action:none}
.dg-edit-header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:4px 8px 4px 14px;font-size:12px;border:1px solid var(--sh-line2, #413d38);border-radius:10px 10px 0 0;background:var(--sh-ground, #1a1612)}
.dg-customizing .grid-stack-item-content{border:1px solid var(--sh-line2, #413d38);border-radius:10px;container-type:inline-size}
.dash-gridstack .grid-stack-item-content{container-type:inline-size}
.dg-customizing .ui-draggable-dragging{cursor:grabbing;filter:drop-shadow(0 12px 14px rgba(0,0,0,.18))}
.dash-gridstack .ui-resizable-e{width:44px!important;right:0!important;top:40%!important;height:44px!important;cursor:ew-resize!important;z-index:20}
.dash-rs{position:absolute;right:5px;top:calc(40% + 10px);bottom:auto;width:24px;height:24px;clip-path:none;background:var(--sh-card, #25211d);color:var(--sh-ink2, #a09b94);text-align:center;line-height:24px;border:1px solid var(--sh-line2, #413d38);border-radius:5px}
.dg-boards{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-right:auto;flex:1 1 380px}
.dg-board-form{display:flex;flex-wrap:wrap;gap:8px;align-items:center;flex-basis:100%;padding:12px;border:1px solid var(--sh-line2, #413d38);border-radius:8px}
.dg-board-form label{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.dw-client-link,.dw-action{color:var(--sh-accent-ink, #2ee0c4);text-decoration:underline;text-underline-offset:3px;display:inline-flex;align-items:center;min-height:28px}
.dw-note{font-size:12px;color:var(--sh-ink2, #a09b94);line-height:1.5;margin:6px 0}
.dw-row{display:flex;align-items:center;justify-content:space-between;gap:12px;border-top:1px solid var(--sh-line, #302c27);padding:10px 0;font-size:13px}
.dw-row>div{min-width:0}.dw-row button{margin-left:6px}
.dw-extra{display:none}.dw-week{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}
.dw-day{display:flex;flex-direction:column;gap:6px;background:var(--sh-ground, #1a1612);border:1px solid var(--sh-line, #302c27);border-radius:8px;padding:10px 6px;color:var(--sh-ink, #f2ede4);text-decoration:none;min-width:0}
.dw-day-date,.dw-day-time{font-size:11px}.dw-day-count{font-size:22px}.dw-day-count small{font-size:11px;color:var(--sh-ink2, #a09b94)}
.dw-status{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.dw-status-cell{display:flex;flex-direction:column;gap:6px;border:1px solid var(--sh-line, #302c27);padding:10px;border-radius:8px;color:var(--sh-ink, #f2ede4);text-decoration:none;font-size:12px}.dw-status-cell small{color:var(--sh-ink2, #a09b94)}
.dw-movers{display:grid;gap:16px}.dw-movers .dw-row{flex-wrap:wrap}
@container (max-width:650px){.dw-week{grid-template-columns:1fr}.dw-day{display:grid;grid-template-columns:65px 75px 1fr;align-items:center;padding:8px 10px}.dw-day-count{font-size:18px}.dw-status{grid-template-columns:1fr 1fr}.dw-row{flex-wrap:wrap}}
@container (min-width:850px){.dw-movers{grid-template-columns:1fr 1fr}.dw-movers>p{grid-column:1/-1}.dw-extra:nth-child(-n+10){display:block}}
.dg-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.dg-viewing .ui-resizable-handle{display:none!important}
@media(max-width:767px){.dash-gridstack .ui-resizable-handle,.dash-rs{display:none!important}.dg-board-form input{font-size:16px;max-width:100%}}

/* ⚠ iOS SAFARI ZOOMS THE VIEWPORT ON FOCUS when a form control computes under 16px, and
   that is worse here than the usual nuisance: this panel is position:fixed and portaled to
   <body>, positioned from the gear's measured rect, so a zoom moves the viewport out from
   under a panel that has already been placed. The desktop keeps its 11px; the override is
   scoped to coarse pointers so it costs the mouse nothing. (CodeRabbit, #2046.)
   ⚠ THE NOTES TEXTAREA JOINS IT, AND ITS COST IS A GRID FIT RATHER THAN A PANEL. That
   control is a card inside a GridStack item whose height is measured by sizeToContent, so a
   focus zoom reflows the board under the hand that is typing in it. The rule is a LIST for
   the same reason it was scoped: one place that says what the coarse-pointer font floor
   applies to, rather than the next 13.5px control re-deriving it. (CodeRabbit, #2137.) */
@media (pointer:coarse){.dash-setpick-sel,.dash-notes-ta{font-size:16px!important}}
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

// ── PER-CARD SETTINGS (review 2026-09-09, R15) ─────────────────────────────
// A widget declares what it can be configured with; DashGrid renders the ⚙ and the
// popover. The widget keeps the state — it already has R16's per-account store, so a
// choice made here is remembered between devices with no second mechanism.
//
//   settings: [{ key, label, options: [{ v, label }], value, onPick }]
//
// ⚠ A CARD WITH NO SETTINGS GETS NO ⚙, and that is R18's rule again: a control that
// opens an empty panel costs more trust than an absent one. The chrome checks the array
// is non-empty, not merely present, so a widget whose options are computed away at
// runtime loses the gear rather than offering nothing.
// Above this many options a group renders as a <select> rather than as chips — see the
// note at the render below.
const DG_SELECT_AT = 6;

// The gutter the panel never crosses, its natural width, and how little room below the
// gear counts as "not enough" before it opens upward instead.
const DG_GUT = 12;
const DG_PANEL_W = 240;
const DG_PANEL_MIN_H = 160;

// Where the panel goes, from the gear's own viewport rect. A pure function so the
// clamping is DRIVEN in a test rather than eyeballed in one browser at one width.
//
// ⚠ AN INTERVAL, NOT TWO INDEPENDENT CLAMPS. The width is capped at both gutters
// first; the left edge then has to satisfy both edges at once, and that interval is
// non-empty exactly when the cap holds. A one-sided `Math.min` reads as "never move it
// right of where it is" and spills past the other gutter on a narrow screen — the
// notification panel shipped that sentence as a because-clause and its own guard
// refuted it the same hour.
// `pw` is the panel's natural width; the ⚙ popover takes the default and the widget
// catalogue asks for a wider one. Both are capped at the gutters the same way.
function dgPanelBox(gear, vw, vh, pw) {
  // ⚠ THE GUTTER CAP WINS OVER ANY PREFERRED MINIMUM WIDTH, and the first cut had that
  // backwards: `Math.max(120, …)` held a 120px floor, which makes the interval below
  // EMPTY — at vw 128 (a 640px phone at 500% zoom, i.e. an accessibility path rather
  // than a hypothetical) the panel's right edge landed 16px past the gutter and grew from
  // there. It is capped at both gutters unconditionally now.
  //
  // ⚠ AND THE HEIGHT BELOW IS CAPPED THE SAME WAY, after a because-clause of mine was
  // refuted here. It read: "the panel scrolls VERTICALLY, so 80px of it crossing the bottom
  // gutter still reaches every control." That holds only while the scroll BOX is inside the
  // viewport. Once the floor pushes the box past the bottom, max scroll aligns the content's
  // end with the box's own bottom edge — which is off screen — so the last controls can
  // never enter the viewport at all. Measured at vh 100: the box runs 64..144, only 36px of
  // it is visible, and the fourth selector is unreachable. A floor that outruns the viewport
  // recreates exactly the unreachability it was excused for. (Codex, #2046.)
  const w = Math.max(1, Math.min(pw > 0 ? pw : DG_PANEL_W, vw - DG_GUT * 2));
  const left = Math.max(DG_GUT, Math.min(gear.right - w, vw - DG_GUT - w));
  const below = vh - gear.bottom - 6 - DG_GUT;
  const above = gear.top - 6 - DG_GUT;
  // Flip up only when there is genuinely MORE room up there: a panel that flips with
  // 150px below and 140px above is just as short and now upside down.
  const up = below < DG_PANEL_MIN_H && above > below;
  // The room is what there is. A cramped scroll box that can reach every control beats a
  // taller one whose bottom is off screen — see the note above. The 1 is degeneracy only:
  // a gear below the viewport would otherwise yield a negative height.
  const offset = up ? Math.max(DG_GUT, vh - gear.top + 6) : Math.max(DG_GUT, gear.bottom + 6);
  // ⚠ THE HEIGHT IS DERIVED FROM THE OFFSET THAT WAS ACTUALLY USED, and that is ONE
  // expression rather than a cap plus a floor. The box hangs `offset` from one edge, so
  // `offset + height` has to clear the other gutter — which is the same arithmetic in both
  // orientations, and is exactly `above`/`below` whenever the gear is on screen.
  //
  // A separate `room = max(1, up ? above : below)` term used to sit in front of this and is
  // deleted rather than kept: it is redundant everywhere the gear is visible, and WRONG
  // where it is not. With the gear scrolled past the viewport (or on the frame before a
  // scroll reposition lands) `above`/`below` measure a span that is partly off screen while
  // the offset has already been floored at the gutter, so the box started above the
  // viewport top — measured at vh 100 with the gear at 120: box top −14. Deriving the
  // height from the offset makes that unrepresentable instead of guarded against.
  return { left: left, width: w, up: up, offset: offset, maxHeight: Math.max(1, vh - offset - DG_GUT) };
}

// Shared by the ⚙ popover and the widget catalogue: place a fixed panel from its
// button's viewport rect, follow scroll and resize while it is open, close it on an
// outside click or Escape. `boxRef` is the button's wrapper, `panelRef` the portaled
// panel; returns the box to render it at, or null until it has been measured.
//
// ⚠ THE PANEL IS PORTALED OUT OF THE CARD, AND THAT IS NOT A STYLE CALL — MEASURED.
// `.dash-gridstack .grid-stack-item-content` is `overflow:hidden!important` (it has to
// be: the card's own height measurement below only reports the true content height
// because of it), and an absolutely-positioned child does not grow the box it hangs
// in. On the KPI strip — a 110px card carrying a four-group panel — the slot pickers
// measured at y 59–86 / 112–139 / 165–192 / 218–245, so THREE OF FOUR fell outside the
// clip box: a coach could change the first slot and nothing else. The elements were
// all in the DOM the whole time, which is exactly why counting them passed and only
// reading their geometry against the card failed. (Codex, #2046.)
function useDgPanel(open, setOpen, boxRef, panelRef, width) {
  const [box, setBox] = React.useState(null);
  const place = React.useCallback(() => {
    const el = boxRef.current;
    if (!el || !el.getBoundingClientRect) return;
    const d = document.documentElement;
    setBox(dgPanelBox(el.getBoundingClientRect(), d.clientWidth, d.clientHeight, width));
    // eslint-disable-next-line
  }, [width]);
  React.useLayoutEffect(() => { if (open) place(); }, [open, place]);
  React.useEffect(() => {
    if (!open) return undefined;
    // `capture` because the dashboard scrolls in its own containers as well as the
    // window, and a fixed panel that does not follow its button points at nothing.
    const on = () => place();
    window.addEventListener("scroll", on, true);
    window.addEventListener("resize", on);
    return () => { window.removeEventListener("scroll", on, true); window.removeEventListener("resize", on); };
  }, [open, place]);
  React.useEffect(() => {
    if (!open) return undefined;
    // ⚠ THE PORTAL BREAKS `contains`, so the away test asks BOTH nodes. With only the
    // button's wrapper tested, the first click inside the panel reads as a click outside
    // it and closes the thing you are using.
    const away = (e) => {
      const inBox = boxRef.current && boxRef.current.contains(e.target);
      const inPanel = panelRef.current && panelRef.current.contains(e.target);
      if (!inBox && !inPanel) setOpen(false);
    };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
    // eslint-disable-next-line
  }, [open]);
  return box;
}

// ⚠ FIXED AND RIGHT-ALIGNED ON ITS BUTTON, clamped into both gutters by `dgPanelBox`.
// The ⚙ sits at the card's top right, so a left-anchored panel would hang off the page
// on the rightmost column of a two-up grid; and a panel is taller than most cards, so
// it scrolls rather than running off the bottom of the screen.
function dgPanelStyle(box) {
  return Object.assign({ position: "fixed", left: box.left, width: box.width, zIndex: 3000,
    maxHeight: box.maxHeight, overflowY: "auto", background: "var(--sh-card, #25211d)",
    border: "1px solid var(--sh-line2, #413d38)", borderRadius: 10, boxShadow: "0 12px 32px rgba(0,0,0,0.18)", padding: "8px 6px", textAlign: "left", fontFamily: "var(--sh-font-body, 'Space Grotesk', 'Space Grotesk Fallback', sans-serif)", color: "var(--sh-ink, #f2ede4)" },
    box.up ? { bottom: box.offset } : { top: box.offset });
}

function DgCardSettings({ groups }) {
  const [open, setOpen] = React.useState(false);
  const boxRef = React.useRef(null);
  const panelRef = React.useRef(null);
  const box = useDgPanel(open, setOpen, boxRef, panelRef, DG_PANEL_W);
  // ⚠ AN OPEN PANEL MUST NOT FADE OUT FROM UNDER THE POINTER. The whole chrome is
  // `.dash-wchrome { opacity: .4 }` until the grid item is `:hover` or `:focus-within`,
  // and this popover lives INSIDE it — so a member who opens the gear and then moves
  // toward the panel (which hangs below the gear, often past the item's own box) leaves
  // the hover area, and the panel they are reaching for disappears. `:focus-within`
  // happens to cover it in Chrome and Firefox, where clicking a <button> focuses it;
  // Safari does not focus a button on click, so relying on that is relying on a browser
  // quirk to keep a control on screen. While the panel is open, the chrome is pinned.
  React.useEffect(() => {
    if (!open) return undefined;
    const el = boxRef.current && boxRef.current.closest ? boxRef.current.closest(".dash-wchrome") : null;
    if (!el) return undefined;
    const prev = el.style.opacity;
    el.style.opacity = "1";
    return () => { el.style.opacity = prev; };
  }, [open]);

  // ⚠ 24×24, NOT 18×18: the glyph stays 11px, the hit area grows to this repo's documented
  // floor (WCAG 2.5.8 AA is 24px). Measured on the shipped chrome before the widget
  // catalogue: ⚙ 18×18, × 18×18, the ⠿ span 13×12 — every control on every card under it.
  const btn = { width: 24, height: 24, borderRadius: 5, border: 0, background: "transparent", color: DG_MUTE, fontSize: 11, cursor: "pointer", lineHeight: 1, padding: 0 };
  return (
    <span ref={boxRef} style={{ position: "relative", display: "inline-flex" }}>
      <button type="button" title="Card settings" aria-label="Card settings" aria-expanded={open}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        style={{ ...btn, color: open ? "var(--sh-accent, #2ee0c4)" : DG_MUTE }}>⚙</button>
      {open && box && ReactDOM.createPortal(
        <div ref={panelRef} onMouseDown={(e) => e.stopPropagation()} style={dgPanelStyle(box)}>
          {groups.map((g) => (
            <div key={g.key} style={{ padding: "2px 6px 6px" }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--sh-ink3, #75706a)", padding: "2px 4px 6px" }}>{g.label}</div>
              {/* ⚠ CHIPS UNTIL THE LIST IS LONG, THEN A SELECT — and the threshold is the
                  panel, not a preference. This popover is 176–240px wide, so a group of
                  eleven options wraps to five rows of chips and four such groups fill the
                  screen; a native select holds any length in one line, is keyboard- and
                  screen-reader-native, and on a phone opens the platform picker. Short
                  groups keep the chips, which read the current value at a glance. */}
              {g.options.length > DG_SELECT_AT ? (
                <select
                  className="dash-setpick-sel"
                  value={String(g.value)}
                  aria-label={g.label}
                  onMouseDown={(e) => e.stopPropagation()}
                  // ⚠ THE ORIGINAL VALUE IS HANDED BACK, NOT THE DOM STRING. A select's
                  // value is always a string, so passing it through would silently change
                  // a numeric or boolean option's type on its way to the widget — the
                  // chips above hand back `o.v` untouched and this has to match them.
                  onChange={(e) => {
                    e.stopPropagation();
                    const picked = g.options.filter((o) => String(o.v) === e.target.value)[0];
                    if (picked) g.onPick(picked.v);
                  }}
                  style={{ width: "100%", padding: "6px 22px 6px 8px", borderRadius: 6, cursor: "pointer",
                           border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.16)",
                           // ⚠ `appearance: none` TAKES THE NATIVE ARROW WITH IT, so the chevron
                           // is drawn back — otherwise the control reads as a plain box and
                           // nothing on it says it opens. The colour is a background LAYER, so
                           // it must be the FINAL one: a colour in any earlier layer voids the
                           // whole declaration, which is how two page textures once made every
                           // background transparent.
                           backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='9' height='6' viewBox='0 0 9 6'><path d='M1 1l3.5 3.5L8 1' fill='none' stroke='%23f2ede4' stroke-opacity='.55' stroke-width='1.4'/></svg>\")",
                           backgroundRepeat: "no-repeat",
                           backgroundPosition: "right 8px center",
                           backgroundColor: "rgba(var(--sh-ink-rgb, 242,237,228),0.06)",
                           color: "var(--sh-ink, #f2ede4)", fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                           letterSpacing: "0.04em", appearance: "none" }}>
                  {g.options.map((o) => (
                    // The option list is painted by the OS, which does not inherit the panel's
                    // ink — an explicit dark color keeps it readable on a light platform menu.
                    <option key={String(o.v)} value={String(o.v)} style={{ color: "#000" }}>{o.label}</option>
                  ))}
                </select>
              ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {g.options.map((o) => {
                  const on = o.v === g.value;
                  return (
                    <button type="button" key={String(o.v)} onClick={(e) => { e.stopPropagation(); g.onPick(o.v); }}
                      style={{ padding: "5px 10px", borderRadius: 999, cursor: "pointer",
                               border: "1px solid " + (on ? "rgba(var(--sh-accent-rgb, 46,224,196),0.45)" : "rgba(var(--sh-ink-rgb, 242,237,228),0.14)"),
                               background: on ? "rgba(var(--sh-accent-rgb, 46,224,196),0.14)" : "transparent",
                               color: on ? "var(--sh-accent-ink, #2ee0c4)" : "rgba(var(--sh-ink-rgb, 242,237,228),0.7)",
                               fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.06em" }}>{o.label}</button>
                  );
                })}
              </div>
              )}
            </div>
          ))}
        </div>,
        document.body
      )}
    </span>
  );
}

// ── THE WIDGET CATALOGUE (review 2026-09-21) ─────────────────────────────────
// One always-visible control per grid tab that lists every widget the tab offers —
// the ones on the board (Remove) and the ones off it (Add) — and carries the reset.
// Before this the only way to learn that a card could be removed was to hover it
// (the chrome was invisible until then), and the only way to bring one back was a
// chip bar that exists only AFTER something has been hidden: a member who never
// hovered never learned the board was theirs to arrange. A dashboard that can be
// customized but does not say so is, to most of its users, one that cannot.
//
// ⚠ IT IS NOT INSIDE `.dash-wchrome`, and that is the whole point: the card chrome
// fades until hover, and a control that exists to make the board's arrangeability
// DISCOVERABLE cannot itself depend on being discovered. It is rendered by DashGrid
// above the grid, so every grid tab — Today, Goal, Score, the client tabs — gets it
// with no per-page wiring, and a page that declares no optional widgets still gets
// the list of what it has.
const DG_CATALOG_W = 320;
function DgCatalog({ rows, onAdd, onRemove, onReset, disabled = false }) {
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  const boxRef = React.useRef(null);
  const panelRef = React.useRef(null);
  const box = useDgPanel(open, setOpen, boxRef, panelRef, DG_CATALOG_W);
  // ⚠ FOCUS FOLLOWS THE DIALOG, OR A KEYBOARD USER NEVER REACHES IT. The panel is
  // portaled to the end of <body>, so Tab from the button lands on the first card's
  // chrome, not on the panel — measured. On open the first control in the panel takes
  // focus; on close focus returns to the button that opened it.
  const wasOpenRef = React.useRef(false);
  React.useEffect(() => {
    if (open && box && panelRef.current) {
      const first = panelRef.current.querySelector("button, a[href], select, input, textarea");
      if (first && typeof first.focus === "function") first.focus();
    } else if (!open && wasOpenRef.current && boxRef.current) {
      const b = boxRef.current.querySelector("button");
      if (b && typeof b.focus === "function") b.focus();
    }
    wasOpenRef.current = !!(open && box);
  }, [open, box]);
  // ⚠ AND FOCUS FOLLOWS THE ROW THAT WAS JUST ACTED ON, OR IT FALLS TO <body>. Add and
  // Remove move a row between the two lists, which are separate arrays in separate positions
  // — so the button that was clicked is UNMOUNTED and its replacement is a different element.
  // A keyboard user was left with focus on the document body while a role="dialog" was still
  // open, i.e. tabbing resumed at the top of the page, outside the panel. Closing the dialog
  // would also fix it (the effect above returns focus to the button) and costs the thing the
  // catalogue is for: adding three widgets would mean opening it three times. So focus moves
  // to the SAME widget's new control — same row, same place on screen, and the action is
  // immediately reversible. (CodeRabbit, #2137.)
  const actedRef = React.useRef(null);
  const act = (fn, key) => { actedRef.current = key; fn(key); };
  React.useEffect(() => {
    const key = actedRef.current;
    if (key == null) return;
    actedRef.current = null;
    const panel = panelRef.current;
    if (!open || !panel) return;
    let target = null;
    // Matched by reading the attribute rather than by building a selector: a widget key is a
    // source identifier, but a querySelector built from one is an escaping question nobody
    // needs to have.
    const rows = panel.querySelectorAll("[data-dg-row]");
    for (const el of rows) if (el.getAttribute("data-dg-row") === String(key)) { target = el.querySelector("button"); break; }
    // A row that has no control any more (a widget that went empty between the click and this
    // frame) leaves focus inside the dialog rather than on the body.
    if (!target) target = panel.querySelector("button, a[href], select, input, textarea");
    if (target && typeof target.focus === "function") target.focus();
  });
  const onBoard = rows.filter((r) => r.on);
  const addable = rows.filter((r) => r.canAdd);
  const waiting = rows.filter((r) => r.empty);
  // The button names the thing most members want from it. When every widget is on the
  // board there is nothing to add, and it says so by dropping the plus.
  const label = addable.length ? "＋ Add widget" : "Widgets";
  const mono = { fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.12em", textTransform: "uppercase" };
  const rowStyle = { display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 6px", borderTop: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.06)" };
  const pill = (teal) => ({ ...mono, fontSize: 9.5, padding: "5px 9px", borderRadius: 999, cursor: "pointer", flexShrink: 0,
    border: "1px solid " + (teal ? "rgba(var(--sh-accent-rgb, 46,224,196),0.45)" : "rgba(var(--sh-ink-rgb, 242,237,228),0.18)"),
    background: teal ? "rgba(var(--sh-accent-rgb, 46,224,196),0.12)" : "transparent", color: teal ? "var(--sh-accent-ink, #2ee0c4)" : "rgba(var(--sh-ink-rgb, 242,237,228),0.7)" });
  const head = (text) => <div style={{ ...mono, fontSize: 9, color: "var(--sh-ink3, #75706a)", padding: "10px 6px 2px" }}>{text}</div>;
  const item = (r, control) => (
    <div key={r.key} data-dg-row={r.key} style={rowStyle}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13, color: r.empty ? "var(--sh-ink2, #a09b94)" : "var(--sh-ink, #f2ede4)" }}>{r.title}</div>
        {(r.blurb || r.why) && <div style={{ fontSize: 11, color: "var(--sh-ink2, #a09b94)", marginTop: 2, lineHeight: 1.4 }}>{r.empty ? r.why : r.blurb}</div>}
      </div>
      {control}
    </div>
  );
  return (
    <span ref={boxRef} style={{ position: "relative", display: "inline-flex" }}>
      <button type="button" className="dash-catalog-btn" disabled={disabled} data-tour="dash-widgets" aria-haspopup="dialog" aria-expanded={open} aria-label="Add or remove widgets"
        onClick={() => setOpen((v) => !v)}
        style={{ ...mono, fontSize: 10.5, padding: "7px 12px", borderRadius: 999, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8,
                 border: "1px solid " + (open ? "rgba(var(--sh-accent-rgb, 46,224,196),0.45)" : "rgba(var(--sh-ink-rgb, 242,237,228),0.2)"),
                 background: open ? "rgba(var(--sh-accent-rgb, 46,224,196),0.12)" : "transparent", color: open ? "var(--sh-accent-ink, #2ee0c4)" : "rgba(var(--sh-ink-rgb, 242,237,228),0.75)" }}>
        <span>{label}</span>
        {addable.length > 0 && <span style={{ color: "var(--sh-accent, #2ee0c4)", fontVariantNumeric: "tabular-nums" }}>{addable.length}</span>}
      </button>
      {open && box && ReactDOM.createPortal(
        <div ref={panelRef} role="dialog" aria-label="Widgets" onMouseDown={(e) => e.stopPropagation()} style={dgPanelStyle(box)}>
          <div style={{ ...mono, fontSize: 9, color: "var(--sh-ink3, #75706a)", padding: "4px 6px 2px" }}>Widgets · {onBoard.length} on the board</div>
          {onBoard.map((r) => item(r, <button type="button" onClick={() => act(onRemove, r.key)} aria-label={"Remove " + r.title} style={pill(false)}>Remove</button>))}
          {addable.length > 0 && head("Available")}
          {addable.map((r) => item(r, <button type="button" onClick={() => act(onAdd, r.key)} aria-label={"Add " + r.title} style={pill(true)}>{"＋ Add"}</button>))}
          {waiting.length > 0 && head("Nothing to show yet")}
          {waiting.map((r) => item(r, null))}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 6px 4px", borderTop: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.08)", marginTop: 4 }}>
            <span style={{ fontSize: 10.5, color: "var(--sh-ink3, #75706a)" }}>Customize to move, resize or undo</span>
            <button type="button" onClick={() => { setOpen(false); onReset(); }} style={{ ...mono, background: "transparent", border: 0, minHeight: 36, cursor: "pointer", fontSize: 9.5, color: DG_MUTE, textDecoration: "none", borderBottom: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.25)", whiteSpace: "nowrap" }}>Reset layout</button>
          </div>
        </div>,
        document.body
      )}
    </span>
  );
}

// Named dashboards retain a complete set of tabs per role. The active tabs stay at
// doc[role] for older clients; inactive boards are snapshots, never client records.
function dgBoards(doc, role) {
  const saved = doc && doc.savedDashboards && doc.savedDashboards[role];
  if (saved && Array.isArray(saved.boards) && saved.boards.length) return saved;
  return { active: "default", boards: [{ id: "default", name: "My dashboard", tabs: (doc && doc[role]) || {} }] };
}
function dgBoardEdit(doc, role, action) {
  const library = dgBoards(doc, role);
  let active = library.active;
  let boards = library.boards.map((b) => ({ ...b, tabs: b.id === active ? (doc[role] || b.tabs) : b.tabs }));
  const current = boards.find((b) => b.id === active) || boards[0];
  if (action.type === "tab") {
    boards = boards.map((b) => b.id === action.board ? { ...b, tabs: { ...b.tabs, [action.tab]: action.layout } } : b);
  } else if (action.type === "create" || action.type === "rename") {
    const name = String(action.name || "").trim();
    if (!name || name.length > 60) throw new Error("Use a dashboard name of 1–60 characters.");
    if (boards.some((b) => b.id !== (action.type === "rename" ? (action.board || active) : action.id) && b.name.toLowerCase() === name.toLowerCase())) throw new Error("Choose a different dashboard name.");
    if (action.type === "rename") boards = boards.map((b) => b.id === (action.board || active) ? { ...b, name } : b);
    else if (boards.some((b) => b.id === action.id)) active = action.id;
    else {
      if (boards.length >= 20) throw new Error("You can save up to 20 dashboards.");
      boards.push({ id: action.id, name, tabs: JSON.parse(JSON.stringify(action.tabs || current.tabs)) });
      active = action.id;
    }
  } else if (action.type === "switch" && boards.some((b) => b.id === action.id)) active = action.id;
  const selected = boards.find((b) => b.id === active) || boards[0];
  return { ...doc, [role]: selected.tabs, savedDashboards: { ...doc.savedDashboards, [role]: { active: selected.id, boards } } };
}

// One lane per account survives React tab unmounts. Every flush merges operations
// into a fresh server document so tab A cannot overwrite tab B from a stale read.
// Failed operations stay queued and visible; a failed read never becomes {}.
function dgCreateLayoutStore(uid, db, timers = { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (id) => clearTimeout(id) }) {
  let doc = {}, loaded = !uid, status = uid ? "loading" : "preview", error = "";
  let pending = [], timer = null, flight = null, hydration = null, retries = 0;
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => fn());
  const identity = async () => {
    const user = await db.getUser();
    if (!user || user.id !== uid) throw new Error("Your account changed. Reload before saving.");
  };
  const schedule = (ms) => {
    if (timer) timers.clearTimeout(timer);
    timer = timers.setTimeout(() => { timer = null; flush(); }, ms);
  };
  const hydrate = () => {
    if (hydration) return hydration;
    hydration = (async () => {
    try {
      await identity();
      const fresh = await db.getUserGoals("dashboard_layout");
      await identity();
      if (!fresh || typeof fresh !== "object") throw new Error("Couldn't load your dashboards.");
      doc = fresh; loaded = true; status = "saved"; error = "";
    } catch (e) { status = "error"; error = e.message || "Couldn't load your dashboards."; }
    emit();
    })().finally(() => { hydration = null; });
    return hydration;
  };
  const flush = () => {
    if (timer) { timers.clearTimeout(timer); timer = null; }
    if (flight) return flight;
    if (!loaded) return hydrate();
    if (!uid || !pending.length) return Promise.resolve();
    const batch = pending.slice();
    status = "saving"; emit();
    flight = (async () => {
      try {
        await identity();
        const fresh = await db.getUserGoals("dashboard_layout");
        if (!fresh || typeof fresh !== "object") throw new Error("Couldn't read your saved dashboards.");
        const next = batch.reduce((value, op) => op(value), fresh);
        await identity();
        const res = await db.saveUserGoals("dashboard_layout", next, { expectedUserId: uid });
        if (!res || res.error) throw new Error("Couldn't save your dashboard.");
        await identity();
        pending.splice(0, batch.length);
        doc = pending.reduce((value, op) => op(value), next);
        retries = 0; error = ""; status = pending.length ? "saving" : "saved";
      } catch (e) {
        status = "error"; error = e.message || "Couldn't save your dashboard.";
        const delay = [1500, 6000][retries++];
        if (delay != null) schedule(delay);
      } finally {
        flight = null; emit();
        if (status !== "error" && pending.length) schedule(0);
      }
    })();
    return flight;
  };
  return {
    uid,
    read: () => ({ doc, loaded, status, error }),
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    load: () => loaded ? Promise.resolve() : hydrate(),
    change: (op) => {
      if (!loaded) return;
      const next = op(doc); // validation fails before any state or queue mutation
      if (JSON.stringify(next) === JSON.stringify(doc)) return;
      doc = next;
      if (uid) { pending.push(op); status = "saving"; retries = 0; schedule(400); }
      emit();
    },
    flush,
    retry: () => { retries = 0; return flush(); },
  };
}
const dgLayoutStores = new Map();
function useDgLayoutStore() {
  const [account, setAccount] = React.useState(undefined);
  const [accountError, setAccountError] = React.useState(false);
  const [attempt, retryAccount] = React.useReducer((n) => n + 1, 0);
  const [, redraw] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    let on = true, version = 0;
    const db = window.shapeDb;
    const read = async () => {
      const v = ++version;
      try {
        if (db && db.getSession) await db.getSession();
        const user = db && db.getUser ? await db.getUser() : null;
        if (on && v === version) { setAccount(user ? user.id : null); setAccountError(false); }
      } catch (e) { if (on && v === version) { setAccount(undefined); setAccountError(true); } }
    };
    read();
    const sub = db && db.client && db.client.auth && db.client.auth.onAuthStateChange((event, session) => {
      version += 1;
      if (on) setAccount(session && session.user ? session.user.id : null);
    });
    return () => { on = false; if (sub && sub.data && sub.data.subscription) sub.data.subscription.unsubscribe(); };
  }, [attempt]);
  const store = React.useMemo(() => {
    if (account === undefined) return null;
    if (!dgLayoutStores.has(account)) dgLayoutStores.set(account, dgCreateLayoutStore(account, window.shapeDb));
    return dgLayoutStores.get(account);
  }, [account]);
  React.useEffect(() => {
    if (!store) return undefined;
    const off = store.subscribe(redraw);
    store.load();
    const flush = () => store.flush();
    window.addEventListener("pagehide", flush);
    return () => { off(); window.removeEventListener("pagehide", flush); store.flush(); };
  }, [store]);
  return { store, accountError, retryAccount };
}

const DG_CONTROL = { font: "inherit", fontSize: 12, color: "var(--sh-ink, #f2ede4)", background: "var(--sh-card, #25211d)", border: "1px solid var(--sh-line2, #413d38)", borderRadius: 7, minHeight: 40, padding: "7px 12px", cursor: "pointer" };
function DgSavedDashboards({ store, role, beforeChange }) {
  const [mode, setMode] = React.useState(null);
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState("");
  const input = React.useRef(null), trigger = React.useRef(null);
  const state = store ? store.read() : { doc: {}, loaded: false, status: "loading" };
  const library = dgBoards(state.doc, role);
  const current = library.boards.find((b) => b.id === library.active) || library.boards[0];
  React.useEffect(() => { if (mode && input.current) { input.current.focus(); input.current.select(); } }, [mode]);
  const close = () => { setMode(null); setError(""); if (trigger.current) trigger.current.focus(); };
  const act = (action) => {
    beforeChange();
    store.change((doc) => dgBoardEdit(doc, role, action));
    store.flush();
  };
  return <div className="dg-boards">
    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>Dashboard
      <select aria-label="Saved dashboard" disabled={!state.loaded} value={library.active} style={{ ...DG_CONTROL, maxWidth: 210 }} onChange={(e) => act({ type: "switch", id: e.target.value })}>
        {library.boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
    </label>
    <button ref={trigger} type="button" style={DG_CONTROL} disabled={!state.loaded} onClick={() => { setName(current.name + " copy"); setMode("create"); }}>Save as…</button>
    <button type="button" style={DG_CONTROL} disabled={!state.loaded} onClick={() => { setName(current.name); setMode("rename"); }}>Rename</button>
    {["trainer", "nutritionist"].includes(role) && <button type="button" style={DG_CONTROL} disabled={!state.loaded} onClick={() => {
      setName("Coaching focus"); setMode("coaching");
    }}>Coaching preset</button>}
    {mode && <form aria-label={mode === "rename" ? "Rename dashboard" : "Save a dashboard"} className="dg-board-form" onSubmit={(e) => {
      e.preventDefault();
      try { act({ type: mode === "coaching" ? "create" : mode, name, board: current.id,
        ...(mode === "coaching" ? { tabs: { ...current.tabs, today: { items: [], order: ["pulse", "schedule", "checkins", "ending", "week", "wins"], hidden: ["queue", "practice", "kpis", "business", "roster"], added: ["checkins", "ending", "week"] } } } : mode === "create" ? { tabs: current.tabs } : {}), id: "board-" + (window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : Date.now() + "-" + Math.random().toString(36).slice(2)) }); close(); }
      catch (err) { setError(err.message); }
    }} onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); close(); } }}>
      <label style={{ fontSize: 12 }}>Dashboard name <input ref={input} style={DG_CONTROL} value={name} maxLength={60} required onChange={(e) => setName(e.target.value)} /></label>
      <button type="submit" style={DG_CONTROL}>{mode === "rename" ? "Rename" : "Save dashboard"}</button>
      <button type="button" style={DG_CONTROL} onClick={close}>Cancel</button>
      <span style={{ fontSize: 12, color: DG_MUTE }}>Includes every tab. Changes save automatically to the selected dashboard.</span>
      {error && <span role="alert">{error}</span>}
    </form>}
  </div>;
}

function dgWidths(widget) {
  return widget && widget.widths ? widget.widths : widget && ["practice", "kpis", "roster", "trajectory", "outcomes", "queue"].includes(widget.key) ? [12] : widget && widget.key === "notes" ? [4, 6, 12] : [6, 12];
}
function DgWidgetMenu({ widget, mobile, onMove, onSize, onHide }) {
  const [open, setOpen] = React.useState(false);
  const boxRef = React.useRef(null), panelRef = React.useRef(null);
  const box = useDgPanel(open, setOpen, boxRef, panelRef, 260);
  const wasOpen = React.useRef(false);
  React.useEffect(() => {
    if (open && box && !wasOpen.current && panelRef.current) panelRef.current.querySelector("button").focus();
    if (!open && wasOpen.current && boxRef.current) boxRef.current.querySelector("button").focus();
    wasOpen.current = !!(open && box);
  }, [open, box]);
  const title = widget.title || widget.key;
  const close = () => { setOpen(false); if (boxRef.current) boxRef.current.querySelector("button").focus(); };
  const pick = (fn) => { close(); fn(); };
  return <span ref={boxRef}>
    <button type="button" style={{ ...DG_CONTROL, minHeight: 44 }} aria-label={"Arrange " + title} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(!open)}>Arrange</button>
    {open && box && ReactDOM.createPortal(<div ref={panelRef} role="dialog" aria-label={"Arrange " + title} style={dgPanelStyle(box)}>
      <div style={{ padding: 8, fontSize: 13, fontWeight: 600 }}>{title}</div>
      {[[-1, "Move up"], [1, "Move down"], ["top", "Move to top"]].map(([dir, label]) => <button key={label} type="button" style={{ ...DG_CONTROL, width: "100%", minHeight: 44, marginBottom: 4 }} onClick={() => pick(() => onMove(dir))}>{label}</button>)}
      {!mobile && <fieldset style={{ border: 0, margin: "10px 0", padding: 0 }}><legend style={{ fontSize: 12 }}>Width · height fits content</legend>
        {dgWidths(widget).map((w) => <button key={w} type="button" style={{ ...DG_CONTROL, minHeight: 44, margin: 3 }} onClick={() => pick(() => onSize(w))}>{w === 4 ? "Compact" : w === 6 ? "Standard" : "Wide"}</button>)}
      </fieldset>}
      <button type="button" style={{ ...DG_CONTROL, width: "100%", minHeight: 44 }} onClick={() => pick(onHide)}>Hide {title}</button>
      <button type="button" style={{ ...DG_CONTROL, width: "100%", marginTop: 6 }} onClick={close}>Close</button>
    </div>, document.body)}
  </span>;
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
  // The current catalogue itself, for the split at write time: which of the effective
  // hidden keys are default widgets (→ `hidden`) and which are optional (→ `added`).
  const widgetsRef = React.useRef([]);
  widgetsRef.current = widgets;
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
  const { store, accountError, retryAccount } = useDgLayoutStore();
  const storeState = store ? store.read() : { doc: {}, loaded: false, status: accountError ? "error" : "loading", error: "Couldn't identify your account. Please retry." };
  const layoutUnavailable = !!store && !storeState.loaded && storeState.status === "error";
  docRef.current = storeState.doc;
  const activeBoard = dgBoards(storeState.doc, role).active;
  const [customizing, setCustomizing] = React.useState(false);
  const [mobile, setMobile] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");
  const [undo, setUndo] = React.useState([]);
  const [revision, setRevision] = React.useState(0);
  const initialPackRef = React.useRef(true);
  const lastColumnsRef = React.useRef(null);
  const flushSave = () => store && store.flush();
  const persist = (next) => {
    if (!store || !store.read().loaded) return;
    store.change((doc) => dgBoardEdit(doc, role, { type: "tab", board: activeBoard, tab, layout: next }));
    docRef.current = store.read().doc;
  };
  // GridStack's compact save format omits default coordinates and dimensions.
  // Read the live nodes for arithmetic; undefined widths otherwise become NaN.
  const liveItems = () => Object.keys(itemRef.current).map((id) => {
    const n = itemRef.current[id].gridstackNode || {};
    return { id, x: n.x || 0, y: n.y || 0, w: n.w || 1, h: n.h || 1 };
  });
  const checkpoint = () => {
    hadSavedRef.current = true;
    const grid = gridRef.current;
    if (!grid) return;
    const saved = savedFor() || {};
    const snapshot = { ...saved, ...dgSplitHidden(hiddenRef.current, widgetsRef.current, saved.added) };
    if (grid.getColumn() === 12) snapshot.items = dgMergeLayoutItems(liveItems(), saved, declaredKeysRef.current);
    else snapshot.mobileOrder = liveItems().sort((a,b) => a.y-b.y).map((n) => n.id);
    setUndo((history) => history.concat([JSON.parse(JSON.stringify(snapshot))]).slice(-20));
  };
  const undoLast = () => {
    const previous = undo[undo.length - 1];
    if (!previous) return;
    persist(previous); setUndo(undo.slice(0, -1)); setRevision((v) => v + 1);
    setAnnouncement("Last layout change undone.");
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
    try {
      if (grid.getColumn() !== 12) {
        const saved = savedFor() || {};
        const order = liveItems().sort((a,b) => a.y-b.y).map((n) => n.id);
        persist({ ...saved, mobileOrder: order.concat((saved.mobileOrder || []).filter((id) => !order.includes(id))) });
        return;
      }
    } catch (e) { return; }
    let live = [];
    try { live = liveItems(); } catch (e) {}
    const saved = savedFor();
    persist({ ...saved, items: dgMergeLayoutItems(live, saved, declaredKeysRef.current), ...dgSplitHidden(hiddenRef.current, widgetsRef.current, saved && saved.added) });
  };
  // Persist a VISIBILITY change (hide / restore). The items half is read from the live
  // grid only while it is in its 12-column layout; collapsed to one column (a phone) the
  // grid holds a projection that must never be written (see persistFromGrid), so the
  // saved items are carried forward untouched and only the hidden/added split moves.
  // ⚠ WITHOUT THIS, BOTH DOORS WERE WRONG ON A PHONE, IN OPPOSITE DIRECTIONS. `hide`
  // wrote `grid.save()` unguarded, so hiding a card from a phone upserted the one-column
  // projection over the member's desktop arrangement — the exact write persistFromGrid
  // exists to refuse. `restore` went THROUGH persistFromGrid, which refused the collapsed
  // items and took the `added` write down with it — so a widget added from a phone
  // rendered, and was gone on the next load, with nothing saying so. A visibility change
  // is a fact about WHICH cards, and is written whatever the column count.
  const persistVisibility = (nextHidden) => {
    const grid = gridRef.current; if (!grid) return;
    let wide = true;
    try { wide = typeof grid.getColumn !== "function" || grid.getColumn() === 12; } catch (e) { wide = false; }
    let live = null;
    if (wide) { try { live = liveItems(); } catch (e) { live = null; } }
    const saved = savedFor();
    const items = live ? dgMergeLayoutItems(live, saved, declaredKeysRef.current) : ((saved && Array.isArray(saved.items)) ? saved.items : []);
    persist({ ...saved, items, ...dgSplitHidden(nextHidden, widgetsRef.current, saved && saved.added) });
  };

  // Add one widget to the grid; return its content host element for the portal.
  const addOne = (spec) => {
    const grid = gridRef.current; if (!grid) return null;
    const widths = dgWidths(widgetsRef.current.find((w) => w.key === spec.key));
    const minW = widths[0];
    const opts = { id: spec.key, minW, w: Math.max(minW, spec.w || minW), h: spec.h };
    if (spec.autoPosition) opts.autoPosition = true; else { opts.x = spec.x; opts.y = spec.y; }
    const el = grid.addWidget(opts);
    itemRef.current[spec.key] = el;
    // Portal the card directly into the GridStack-managed item-content; sizeToContent
    // (wired up by addWidget, guarded by dgPatchGridStack) fits the item to it.
    return el.querySelector(".grid-stack-item-content");
  };

  // ── init GridStack once per role/tab; load saved → add widgets → set portal hosts.
  React.useEffect(() => {
    if (!store || (!storeState.loaded && !layoutUnavailable) || typeof window === "undefined" || !window.GridStack || !elRef.current) return undefined;
    dgInjectStyle();
    dgPatchGridStack();
    let destroyed = false;
    // The cleanup sets this on a tab change too, so it is re-armed here rather than left
    // true — otherwise the first tab switch disables every retry for the life of the page.
    initialPackRef.current = true; lastColumnsRef.current = null; setReady(false);
    const boot = () => {
      if (destroyed || !elRef.current) return;
      const grid = window.GridStack.init({
        column: 12, columnOpts: { breakpointForWindow: true, breakpoints: [{ w: 768, c: 1 }] },
        cellHeight: 2, margin: 8, float: true,
        handle: ".dash-drag-handle", draggable: { cancel: "button, input, textarea, select, a" }, resizable: { handles: "e" }, alwaysShowResizeHandle: true, disableDrag: !customizing || !storeState.loaded, disableResize: !customizing || !storeState.loaded,
        // sizeToContent stays OFF: its auto-cascade overrode our explicit ordered layout,
        // and its observer can't see React-portaled content anyway. We fit heights via
        // manual grid.resizeToContent() calls (see the fit effect) instead.
        sizeToContent: false, animate: true,
      }, elRef.current);
      gridRef.current = grid;
      const savedAtBoot = savedFor();
      hadSavedRef.current = !!(savedAtBoot && savedAtBoot.items && savedAtBoot.items.length);   // capture BEFORE change events repopulate docRef
      const layout = dgResolveGridLayout(savedAtBoot, widgets);
      if (savedAtBoot && savedAtBoot.order) layout.visible.sort((a,b) => { const order = savedAtBoot.order; const rank = (key) => order.includes(key) ? order.indexOf(key) : 999; return rank(a.key)-rank(b.key); });
      const nextHosts = {};
      grid.batchUpdate();
      for (const spec of layout.visible) { const host = addOne(spec); if (host) nextHosts[spec.key] = host; }
      grid.commit();
      setHidden(layout.hidden);
      setHosts(nextHosts);
      setReady(true);
      grid.on("dragstart resizestart", checkpoint);
      grid.on("dragstop", () => { persistFromGrid(); setAnnouncement("Widget moved. Layout saved automatically."); });
      grid.on("resizestop", (ev, el) => {
        const widths = dgWidths(widgetsRef.current.find((w) => w.key === el.gridstackNode.id));
        const nearest = widths.reduce((a,b) => Math.abs(b-el.gridstackNode.w) < Math.abs(a-el.gridstackNode.w) ? b : a);
        grid.update(el, { w: nearest });
        try { grid.resizeToContent(el); } catch (e) {}
        persistFromGrid(); setAnnouncement("Widget width changed. Height fits content.");
      });
    };
    boot();
    return () => {
      destroyed = true;
      flushSave();
      try { if (gridRef.current) gridRef.current.destroy(false); } catch (e) {}
      gridRef.current = null; itemRef.current = {}; lastPosRef.current = {};
    };
    // eslint-disable-next-line
  }, [role, tab, store, storeState.loaded, layoutUnavailable, activeBoard, revision]);

  React.useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    grid.enableMove(customizing && storeState.loaded);
    grid.enableResize(customizing && storeState.loaded && !mobile);
  }, [customizing, storeState.loaded, mobile, ready, activeBoard, revision]);
  React.useEffect(() => { setUndo([]); }, [role, tab, activeBoard, store]);

  const arrange = (key, direction, width) => {
    const grid = gridRef.current; if (!grid) return;
    checkpoint();
    let nodes = liveItems().sort((a,b) => a.y-b.y || a.x-b.x);
    const index = nodes.findIndex((n) => n.id === key);
    if (index < 0) return;
    if (width) nodes[index].w = width;
    else {
      const target = direction === "top" ? 0 : Math.max(0, Math.min(nodes.length - 1, index + direction));
      nodes.splice(target, 0, nodes.splice(index, 1)[0]);
    }
    let y = 0, x = 0, rowH = 0;
    const cols = grid.getColumn();
    nodes = nodes.map((node) => {
      const w = Math.min(cols, node.w);
      if (x + w > cols) { y += rowH; x = 0; rowH = 0; }
      const next = { ...node, x, y, w }; x += w; rowH = Math.max(rowH, node.h);
      return next;
    });
    grid.load(nodes, false); persistFromGrid();
    setAnnouncement((byKey[key].title || key) + (width ? " width changed." : " moved."));
  };

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
      const saved = savedFor() || {};
      const order = cols === 1 ? (saved.mobileOrder || (saved.items || []).slice().sort((a,b) => a.y-b.y || a.x-b.x).map((n) => n.id)) : (saved.order || []);
      const arranged = order.map((id) => widgetsRef.current.find((w) => w.key === id)).filter(Boolean);
      widgetsRef.current.forEach((w) => { if (!arranged.includes(w)) arranged.push(w); });
      arranged.forEach((w) => {
        const item = itemRef.current[w.key]; if (!item) return;
        const node = item.gridstackNode || {};
        const id = node.id || w.key;
        const content = item.querySelector(".grid-stack-item-content");
        const card = content && content.firstElementChild;
        const cardH = card ? card.getBoundingClientRect().height : 0;
        // item-content is inset 8px top+bottom (16px) inside the item, so the item must be
        // cardH + 16 tall for the card to fit without clipping; +2 keeps a hair of slop.
        const h = Math.max(1, Math.ceil((cardH + 18) / cell));
        let wW = hadSavedRef.current ? (node.w || dgWidgetW(w.size)) : dgWidgetW(w.size);
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
    const run = () => {
      const cols = grid.getColumn();
      const changed = lastColumnsRef.current !== cols;
      setMobile(cols === 1);
      if (changed) {
        for (const key of Object.keys(itemRef.current)) grid.update(itemRef.current[key], { minW: cols === 1 ? 1 : dgWidths(widgetsRef.current.find((w) => w.key === key))[0] });
        if (cols === 12 && lastColumnsRef.current === 1) {
          const saved = savedFor();
          if (saved && saved.items) grid.load(saved.items.filter((n) => itemRef.current[n.id]), false);
        }
        lastColumnsRef.current = cols;
      }
      fitAll();
      if (cols === 1 || (initialPackRef.current && !hadSavedRef.current)) relayoutInOrder();
      initialPackRef.current = false;
    };
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

  // ⚠ A VISIBILITY CHANGE IS STAGED IN THE SAME TICK IT IS MADE, NEVER ON A TIMER.
  // All three of these used to defer (`setTimeout` 0 / 60 / 0), and `persistVisibility`
  // opens with `if (!gridRef.current) return` — which the cleanup sets to null on unmount
  // and on a role/tab change. So a card added and then a tab switched inside 60ms lost the
  // add outright, with nothing on screen saying so; on a phone that timer is the ONLY write,
  // because persistFromGrid refuses a collapsed grid. `persist` only ARMS the 400ms debounce,
  // so staging immediately costs nothing and still lets sizeToContent's own `change` land the
  // settled geometry before the write goes out — and the cleanup's flush now has a document
  // that includes the change. (CodeRabbit, #2137.)
  const hide = (key) => {
    if (!storeState.loaded) return;
    checkpoint();
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
    persistVisibility(nextHidden);
  };
  const restore = (key) => {
    if (!storeState.loaded) return;
    const w = byKey[key];
    // An empty widget has no chip to click (see the hidden bar), but restoring one
    // would re-create exactly the empty 18px item this change exists to remove.
    if (!w || w.empty) return;
    checkpoint();
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
    persistVisibility(nextHidden);
  };
  const reset = () => {
    if (!storeState.loaded) return;
    const grid = gridRef.current; if (!grid) return;
    checkpoint();
    hadSavedRef.current = false; initialPackRef.current = true;
    lastPosRef.current = {};
    // ⚠ THE DEFAULT BOARD IS NOT AN EMPTY HIDDEN LIST. Every optional widget is off it,
    // so the effective list after a reset is the optional set — which is exactly what
    // resolving a null document yields, and what `dgSplitHidden` then writes back as
    // `hidden: [], added: []`. Assigning `[]` here would put every optional widget ON
    // the board for one render before the sync effect took it off again.
    const layout = dgResolveGridLayout(null, widgets);
    hiddenRef.current = layout.hidden;   // before removeAll/commit, both of which fire `change`
    try { grid.removeAll(true); } catch (e) {}
    itemRef.current = {};
    const nextHosts = {};
    grid.batchUpdate();
    for (const spec of layout.visible) { const host = addOne(spec); if (host) nextHosts[spec.key] = host; }
    grid.commit();
    setHosts(nextHosts); setHidden(layout.hidden);
    persist({ items: [], hidden: [], added: [] });
  };

  // ⚠ A HIDDEN KEY MAY BE EMPTY RIGHT NOW, AND THAT IS THE POINT OF KEEPING IT. The
  // preference survives an empty spell (see dgResolveGridLayout), but it gets no chip
  // while there is nothing behind it — offering "+ The cycle" to restore a card that
  // would render as an empty 18px slot is the bug, wearing a button. Named ONCE
  // because the bar's visibility and its contents must never disagree: a guard that
  // matched the expression found the copy the regression had not touched.
  // ⚠ AND THE CHIPS ARE FOR DEFAULT CARDS ONLY. An optional widget that is off the
  // board is where the catalogue says it is — "Available", one tap from ＋ Add — not
  // "hidden": a bar reading "Hidden · + Week ahead · + Top movers" on a dashboard nobody
  // has touched would be announcing a preference the member never expressed.
  const hiddenChips = hidden.filter((k) => byKey[k] && !byKey[k].empty && !byKey[k].optional);
  // The bar itself is keyed on the default cards the member hid, empty ones included —
  // see the note at the render for why that is not the chip list.
  const hiddenDefaults = hidden.filter((k) => byKey[k] && !byKey[k].optional);

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
        {customizing && <div className="dash-drag-handle dg-edit-header">
          <span style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44, minWidth: 0 }}><span aria-hidden="true">⠿</span><span>{w.title || key}</span></span>
          <DgWidgetMenu widget={w} mobile={mobile} onMove={(dir) => arrange(key, dir)} onSize={(width) => arrange(key, null, width)} onHide={() => { const button = elRef.current && elRef.current.parentElement.querySelector("[data-dg-customize]"); if (button) button.focus(); hide(key); }} />
        </div>}
        {dgSettingGroups(w).length > 0 && <div className="dash-wchrome" style={{ position: "absolute", top: customizing ? 58 : 6, right: 8, zIndex: 5 }}><DgCardSettings groups={dgSettingGroups(w)} /></div>}
        {content}
        {customizing && !mobile && <div className="dash-rs" aria-hidden="true">↔</div>}
      </div>
    );
  };

  return (
    <div className={customizing ? "dg-customizing" : "dg-viewing"}>
      {/* The catalogue: always visible, above the grid, on every tab — see DgCatalog. */}
      <div className="dash-gridbar" style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <DgSavedDashboards store={store} role={role} beforeChange={() => { if (ready) persistVisibility(hiddenRef.current); }} />
        <button type="button" data-dg-customize style={DG_CONTROL} disabled={!ready || !storeState.loaded} aria-pressed={customizing} onClick={() => setCustomizing(!customizing)}>{customizing ? "Done" : "Customize dashboard"}</button>
        <button type="button" style={DG_CONTROL} disabled={!storeState.loaded || !undo.length} onClick={undoLast}>Undo</button>
        <DgCatalog disabled={!storeState.loaded} rows={dgCatalogRows(widgets, hidden)} onAdd={restore} onRemove={hide} onReset={reset} />
      </div>
      <div role="status" style={{ color: DG_MUTE, fontSize: 12, marginBottom: 12 }}>
        {storeState.status === "loading" ? "Loading dashboards…" : storeState.status === "saving" ? "Saving…" : storeState.status === "error" ? storeState.error : storeState.status === "preview" ? "Preview · sign in to save dashboards" : "Saved · all tabs"}
        {storeState.status === "error" && <button type="button" style={{ ...DG_CONTROL, marginLeft: 8 }} onClick={() => store ? store.retry() : retryAccount()}>Retry</button>}
        {customizing && <span> · {mobile ? "Move cards with Arrange or drag. Phone order is saved separately." : "Drag a header or use Arrange. Resize width from the right edge; height fits content."}</span>}
      </div>
      <span className="dg-sr-only" aria-live="polite">{announcement}</span>
      {/* min-height reserves space so the page doesn't collapse to 0 then jump down
          when GridStack measures + positions the cards in JS after mount (CLS guard) */}
      <div key={role + ":" + tab + ":" + activeBoard + ":" + revision + ":" + (store ? store.uid : "loading") + ":" + storeState.loaded + ":" + layoutUnavailable} ref={elRef} className="grid-stack dash-gridstack" style={{ minHeight: "60vh" }}></div>
      {Object.keys(hosts).map((key) => (hosts[key] ? ReactDOM.createPortal(chrome(key), hosts[key]) : null))}
      {/* ⚠ THE BAR IS KEYED ON `hiddenDefaults`, THE CHIPS ON `hiddenChips`, AND THE
          DIFFERENCE IS THE RESET LINK. Gating the whole bar on the chips took `Reset
          layout` away with them — so a member whose only hidden card happened to be
          empty (a failed fetch is enough) had a dashboard they could not reset and
          nothing on screen explaining why. (The catalogue carries a second reset now,
          so the bar is the quick way back for a card just hidden, not the only one.) */}
      {storeState.loaded && hiddenDefaults.length > 0 && (
        <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {hiddenChips.length > 0 && (
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: DG_MUTE }}>Hidden ·</span>
          )}
          {hiddenChips.map((key) => (
            <button type="button" key={key} onClick={() => restore(key)} title="Restore" style={{ padding: "5px 11px", borderRadius: 999, border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.2)", background: "transparent", color: DG_MUTE, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, cursor: "pointer" }}>
              + {byKey[key] ? (byKey[key].title || key) : key}
            </button>
          ))}
          <button type="button" onClick={reset} style={{ background: "transparent", border: 0, minHeight: 36, cursor: "pointer", marginLeft: "auto", fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase", color: DG_MUTE, textDecoration: "none", borderBottom: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.25)" }}>Reset layout</button>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { DashGrid });
