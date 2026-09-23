// Library filters — the faceted bar both coach libraries share (Programs and Meal
// plans). WHAT each filter reads is derived in the pure cores (DashBuilder.programFacts,
// DashMeals.mealPlanFacts); this file is the counting rule and the controls.
//
// The rule, in the owner's board's words: every option says how many items it would
// leave; an option that would leave none is dimmed, not hidden; two options inside one
// filter WIDEN it (Home or Barbell) and two filters NARROW each other (Home and Lower);
// and the count beside Clear is always the result.
//
// Load order: pageShell → … → this file → dashBuilder.jsx / dashMealBuilder.jsx. The
// libraries read these as globals at RENDER, so a host only has to load this before
// it mounts a library page.

// ── The counting rule (pure) ────────────────────────────────────────────────
// An item is { search: 'lower-case text', keys: { [facetKey]: [optionKey, …] } }.
// A facet is { key, options: [{ key, … }] }. The state is { q, sel: { [facetKey]: [optionKey, …] } }.
const DFB_EMPTY = Object.freeze({ q: "", sel: Object.freeze({}) });
function dfbNorm(s) { return String(s == null ? "" : s).replace(/\s+/g, " ").trim().toLowerCase(); }
// ⚠ A SELECTION IS READ THROUGH THE FACET'S CURRENT OPTIONS. A coach can select a tag and
// then take it off the last program that carried it; the tag leaves the row, and a
// selection nobody can see would narrow the library to nothing with no chip to undo.
function dfbSelected(facet, state) {
  const picked = (state && state.sel && Array.isArray(state.sel[facet.key])) ? state.sel[facet.key] : [];
  const live = new Set(facet.options.map((o) => o.key));
  return [...new Set(picked)].filter((k) => live.has(k));
}
function dfbRun(items, facets, state) {
  const q = dfbNorm(state && state.q);
  const sels = {};
  facets.forEach((f) => { sels[f.key] = dfbSelected(f, state); });
  const keysOf = (item, key) => (item && item.keys && Array.isArray(item.keys[key])) ? item.keys[key] : [];
  const passes = (item, skip) =>
    (!q || String(item && item.search || "").indexOf(q) >= 0) &&
    facets.every((f) => f.key === skip || !sels[f.key].length || keysOf(item, f.key).some((k) => sels[f.key].includes(k)));
  const shown = (items || []).filter((it) => passes(it, null));
  const counts = {}, pool = {};
  facets.forEach((f) => {
    // Everything EXCEPT this facet, so each option says what choosing it alone would leave.
    const base = (items || []).filter((it) => passes(it, f.key));
    pool[f.key] = base.length;
    counts[f.key] = {};
    f.options.forEach((o) => { counts[f.key][o.key] = base.filter((it) => keysOf(it, f.key).includes(o.key)).length; });
  });
  return { shown, counts, pool, sels, q, total: (items || []).length, active: !!q || facets.some((f) => sels[f.key].length > 0) };
}
function dfbToggle(state, facetKey, optionKey) {
  const cur = (state.sel && Array.isArray(state.sel[facetKey])) ? state.sel[facetKey] : [];
  const next = cur.includes(optionKey) ? cur.filter((k) => k !== optionKey) : [...cur, optionKey];
  return { ...state, sel: { ...state.sel, [facetKey]: next } };
}
function dfbClearFacet(state, facetKey) {
  const sel = { ...state.sel };
  delete sel[facetKey];
  return { ...state, sel };
}
function dfbCountLabel(run, one, many) {
  const noun = (n) => (n === 1 ? one : many);
  return run.active ? run.shown.length + " of " + run.total + " " + noun(run.total) : run.total + " " + noun(run.total);
}

// ── Where a panel opens ─────────────────────────────────────────────────────
// Under its chip, slid only as far as it must to sit inside the viewport's gutter —
// either way. ⚠ "OPEN LEFTWARD WHEN THE RIGHT IS FULL" WAS THE FIRST RULE, and on a
// phone neither side has room for a 300px panel under a chip in the middle of the row:
// at 390px the In use panel ended at 513px and was cut off, options and all.
function dfbPopShift(left, width, viewport, gutter) {
  const g = gutter == null ? 16 : gutter;
  const maxLeft = Math.max(g, viewport - g - width);
  return left - Math.min(Math.max(left, g), maxLeft);
}
function useDfbPopShift(open, anchor, panel) {
  const [shift, setShift] = React.useState(0);
  React.useLayoutEffect(() => {
    if (!open) { setShift(0); return undefined; }
    const place = () => {
      if (!anchor.current || !panel.current) return;
      const w = panel.current.getBoundingClientRect().width;
      const vw = document.documentElement.clientWidth || window.innerWidth || 0;
      if (w && vw) setShift(dfbPopShift(anchor.current.getBoundingClientRect().left, w, vw));
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);
  return shift;
}

// ── One filter: a chamfered chip that opens its options ─────────────────────
// ⚠ THE PANEL IS NOT INSIDE THE CHIP. The chip is cut with `clip-path`, and a clip
// clips every descendant, so a panel nested in it would be cut off at the chip's edge.
function DashFacetMenu({ facet, counts, selected, onToggle, onClear, note }) {
  const [open, setOpen] = React.useState(false);
  const wrap = React.useRef(null), main = React.useRef(null), panel = React.useRef(null);
  const shift = useDfbPopShift(open, wrap, panel);
  const id = React.useId();
  React.useEffect(() => {
    if (!open) return undefined;
    const down = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === "Escape") { setOpen(false); if (main.current) main.current.focus(); } };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open]);
  // Keyboard users land on the first option they can use rather than back at the page.
  React.useEffect(() => {
    if (!open || !panel.current) return;
    const first = panel.current.querySelector("input:not([aria-disabled='true']), button");
    if (first) first.focus();
  }, [open]);
  const set = selected.length > 0;
  const label = (k) => { const o = facet.options.find((x) => x.key === k); return o ? o.label : k; };
  const leave = (e) => { if (open && wrap.current && e.relatedTarget && !wrap.current.contains(e.relatedTarget)) setOpen(false); };
  return (
    <span ref={wrap} className="dash-facet" onBlur={leave}>
      <span className={"dash-chip dash-chip--menu" + (set ? " is-set" : "")} style={facet.c ? { "--c": facet.c } : undefined}>
        <button ref={main} type="button" className="dash-chip-main" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen((o) => !o)}>
          {facet.label}
          {set && <>{" · "}<span className="dash-chip-v">{label(selected[0])}{selected.length > 1 ? " +" + (selected.length - 1) : ""}</span></>}
          <span aria-hidden="true" className="dash-chip-caret">▾</span>
        </button>
        {set && <button type="button" className="dash-chip-x" aria-label={"Clear the " + facet.label + " filter"} onClick={onClear}>×</button>}
      </span>
      {open && (
        <div ref={panel} id={id} className="dash-facet-pop" style={shift ? { left: -shift } : undefined} role="group" aria-label={facet.label}>
          <div className="dash-facet-h">{facet.label}</div>
          {facet.help && <p className="dash-facet-help">{facet.help}</p>}
          {note ? <div className="dash-facet-note">{note}</div> : facet.options.map((o) => {
            const on = selected.includes(o.key);
            const n = counts[o.key] || 0;
            // ⚠ A ZERO OPTION IS DIMMED, NOT HIDDEN — and it stays in the tab order, so a
            // screen reader hears what is missing too. It cannot be switched ON (it would
            // leave nothing); a selected one can always be switched off.
            const dead = n === 0 && !on;
            return (
              <label key={o.key} className={"dash-facet-opt" + (dead ? " is-zero" : "")}>
                <input type="checkbox" checked={on} aria-disabled={dead ? "true" : undefined} onChange={() => { if (!dead) onToggle(o.key); }} />
                <span className="dash-facet-l">{o.label}</span>
                <span className="dash-facet-n">{n}</span>
              </label>
            );
          })}
        </div>
      )}
    </span>
  );
}

// ── The row of chips a library files its items under ────────────────────────
// Programs file under tags (Shape's goals and the coach's own); meal plans under phase.
function DashTagChips({ facet, run, onToggle, onClear, allLabel }) {
  const selected = run.sels[facet.key] || [];
  const counts = run.counts[facet.key] || {};
  return (
    <div className="dash-chiprow" role="group" aria-label={facet.label}>
      <button type="button" className={"dash-chip" + (selected.length ? "" : " is-on")} aria-pressed={!selected.length}
        style={{ "--c": "var(--sh-accent, #2ee0c4)" }} onClick={onClear}>
        {allLabel || "All"}<span className="dash-chip-n">{run.pool[facet.key]}</span>
      </button>
      {facet.options.map((o) => {
        const on = selected.includes(o.key);
        const n = counts[o.key] || 0;
        const dead = n === 0 && !on;
        return (
          <button key={o.key} type="button" className={"dash-chip" + (on ? " is-on" : "") + (dead ? " is-zero" : "")}
            aria-pressed={on} aria-disabled={dead ? "true" : undefined} style={o.c ? { "--c": o.c } : undefined}
            onClick={() => { if (!dead) onToggle(o.key); }}>
            {o.label}<span className="dash-chip-n">{n}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── The bar: search, every filter, and the result ───────────────────────────
function DashFilterBar({ facets, run, state, setState, one, many, placeholder, notes, primaryFacetKeys }) {
  const [moreOpen, setMoreOpen] = React.useState(false);
  const moreId = React.useId();
  const primary = primaryFacetKeys ? facets.filter((f) => primaryFacetKeys.includes(f.key)) : facets;
  const additional = primaryFacetKeys ? facets.filter((f) => !primaryFacetKeys.includes(f.key)) : [];
  // Count the effective selections, not stale keys a refreshed facet no longer offers.
  const additionalActive = additional.filter((f) => (run.sels[f.key] || []).length > 0).length;
  const renderFacet = (f) => (
    <DashFacetMenu key={f.key} facet={f} counts={run.counts[f.key] || {}} selected={run.sels[f.key] || []}
      note={notes && notes[f.key]}
      onToggle={(k) => setState((s) => dfbToggle(s, f.key, k))}
      onClear={() => setState((s) => dfbClearFacet(s, f.key))} />
  );
  return (
    <div className="dash-filterbar" role="search" aria-label={"Filter " + many}>
      <label className="dash-filter-search">
        <span aria-hidden="true">⌕</span>
        <input type="search" value={state.q} placeholder={placeholder} aria-label={"Find " + one + " by name"}
          onChange={(e) => { const q = e.target.value; setState((s) => ({ ...s, q })); }} />
      </label>
      {primary.map(renderFacet)}
      {!!additional.length && <button type="button" className="dash-filter-more" aria-expanded={moreOpen}
        aria-controls={moreOpen ? moreId : undefined} onClick={() => setMoreOpen((o) => !o)}>
        More filters{additionalActive > 0 && <span> · {additionalActive} active</span>}
        <span aria-hidden="true">{moreOpen ? "▴" : "▾"}</span>
      </button>}
      {/* The result and its Clear are one unit, so a full row cannot strand Clear on a
          line of its own, away from the count it resets. */}
      <span className="dash-filter-result">
        <span className="dash-filter-count" role="status">{dfbCountLabel(run, one, many)}</span>
        {run.active && <button type="button" className="dash-filter-clear" onClick={() => setState(DFB_EMPTY)}>Clear</button>}
      </span>
      {moreOpen && !!additional.length && <div id={moreId} className="dash-filter-additional" role="group" aria-label={"Additional " + one + " filters"}>
        {additional.map(renderFacet)}
      </div>}
    </div>
  );
}

Object.assign(window, { DashFilterBar, DashFacetMenu, DashTagChips, DFB_EMPTY, dfbRun, dfbToggle, dfbClearFacet, dfbSelected, dfbCountLabel, dfbPopShift, useDfbPopShift });
