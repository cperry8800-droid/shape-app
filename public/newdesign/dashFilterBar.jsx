// Library filters — the faceted bar both coach libraries share (Programs and Meal
// plans). WHAT each filter reads is derived in the pure cores (DashBuilder.programFacts,
// DashMeals.mealPlanFacts); this file is the counting rule and the controls, and since step 6a
// of the owner's coach review the pieces both libraries draw with (the sort, the card and its ⋯,
// the top line and its drawer; "The libraries' shared pieces" below).
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
// `extra` sits in the row after the primary filters: the libraries' sort (DashLibSort), so
// search, type and sort are one row (the owner's coach review, step 6a).
function DashFilterBar({ facets, run, state, setState, one, many, placeholder, notes, primaryFacetKeys, extra, searchLabel }) {
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
        <input type="search" value={state.q} placeholder={placeholder} aria-label={searchLabel || ("Find " + one + " by name")}
          onChange={(e) => { const q = e.target.value; setState((s) => ({ ...s, q })); }} />
      </label>
      {primary.map(renderFacet)}
      {extra}
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

// ── The libraries' shared pieces (the owner's coach review, step 6a: "the calmer library") ──
// Programs and Meal plans are TOOL PAGES, a fixed layout and never a widget board. One block per
// question: the week's job in one line at Lift 2 (the highest thing on the page), then the
// library's cards at Lift 1, every card the same size, each with ONE primary and a ⋯ for the
// rest. A status is a labelled chip, never a bare colour.

// The sort: the platform's own select, so the keyboard and a screen reader get a real control.
function DashLibSort({ value, options, onChange }) {
  const id = React.useId();
  return (
    <label className="dash-lib-sort" htmlFor={id}>
      <span>Sort</span>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.key} value={o.key} disabled={!!o.disabled}>{o.label}</option>)}
      </select>
    </label>
  );
}

// A status in words, with a mark for the eye. `tone` is "ready", "need" or "quiet".
function DashLibStatus({ tone, children, title }) {
  const mark = tone === "ready" ? "✓ " : tone === "need" ? "! " : "";
  return <span className="dash-lib-status" data-tone={tone || "quiet"} title={title}>{mark}{children}</span>;
}

// A card's ⋯: the actions that are not its one primary. A menu button (aria-haspopup), the
// keyboard lands on the first item, ↑ ↓ move, Escape closes and hands focus back, a click
// elsewhere closes it. Each item is { key, label, onSelect, danger }.
function DashLibMenu({ label, items }) {
  const [open, setOpen] = React.useState(false);
  const wrap = React.useRef(null), btn = React.useRef(null), panel = React.useRef(null);
  const id = React.useId();
  const list = (items || []).filter(Boolean);
  React.useEffect(() => {
    if (!open) return undefined;
    const down = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", down);
    return () => document.removeEventListener("mousedown", down);
  }, [open]);
  React.useEffect(() => {
    if (!open || !panel.current) return;
    const first = panel.current.querySelector("[role='menuitem']");
    if (first) first.focus();
  }, [open]);
  const onKey = (e) => {
    const els = panel.current ? [...panel.current.querySelectorAll("[role='menuitem']")] : [];
    const i = els.indexOf(document.activeElement);
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); if (btn.current) btn.current.focus(); }
    else if (e.key === "ArrowDown" && els.length) { e.preventDefault(); els[(i + 1) % els.length].focus(); }
    else if (e.key === "ArrowUp" && els.length) { e.preventDefault(); els[(i - 1 + els.length) % els.length].focus(); }
    else if (e.key === "Tab") setOpen(false);
  };
  if (!list.length) return null;
  return (
    <span ref={wrap} className="dash-lib-more">
      <button ref={btn} type="button" className="dash-lib-more-btn" aria-label={label} aria-haspopup="menu" aria-expanded={open}
        aria-controls={open ? id : undefined} onClick={() => setOpen((o) => !o)}>⋯</button>
      {open && (
        <div ref={panel} id={id} role="menu" aria-label={label} className="dash-lib-menu" onKeyDown={onKey}>
          {list.map((it) => (
            <button key={it.key} type="button" role="menuitem" tabIndex={-1} className={"dash-lib-menu-item" + (it.danger ? " is-danger" : "")}
              onClick={() => { setOpen(false); it.onSelect(); }}>{it.label}</button>
          ))}
        </div>
      )}
    </span>
  );
}

// The week's job, in one line: the page's highest block (Lift 2). `figure` is the count ("—"
// when it could not be read), `line` the rest of the sentence, `chips` the statuses, `note` what
// is missing or why, `actions` its buttons.
function DashLibTopLine({ label, figure, line, chips, note, actions }) {
  return (
    <section className="dash-lib-top" aria-label={label}>
      <div className="dash-lib-top-main">
        <div className="dash-lib-top-eyebrow">{label}</div>
        <p className="dash-lib-top-line"><span className="dash-lib-top-figure">{figure}</span>{line ? <> {line}</> : null}</p>
        {chips && <div className="dash-lib-top-chips">{chips}</div>}
        {note && <p className="dash-lib-top-note" role="status">{note}</p>}
      </div>
      {actions && <div className="dash-lib-top-actions">{actions}</div>}
    </section>
  );
}

// The details behind a top line: a panel from the right, over the page. Escape or the scrim
// closes it, and focus goes back to what opened it. ⚠ A MODAL HOLDS FOCUS: it says aria-modal, so
// Tab and Shift-Tab cycle inside it and never reach the page behind (as the client panel's sheet).
function DashLibDrawer({ title, sub, onClose, children }) {
  const id = React.useId();
  const panel = React.useRef(null);
  const closeRef = React.useRef(onClose);
  closeRef.current = onClose;
  React.useEffect(() => {
    const opener = document.activeElement;
    const focusable = () => (panel.current ? [...panel.current.querySelectorAll("a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex='0']")] : []);
    const key = (e) => {
      if (e.key === "Escape") { e.preventDefault(); closeRef.current(); return; }
      if (e.key !== "Tab" || !panel.current) return;
      const items = focusable();
      const first = items[0], last = items[items.length - 1];
      const inside = panel.current.contains(document.activeElement);
      if (!first) { e.preventDefault(); return; }
      if (e.shiftKey && (!inside || document.activeElement === first || document.activeElement === panel.current.querySelector("h2"))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (!inside || document.activeElement === last)) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", key);
    const h = panel.current && panel.current.querySelector("h2");
    if (h) h.focus();
    return () => {
      document.removeEventListener("keydown", key);
      if (opener && typeof opener.focus === "function" && document.contains(opener)) opener.focus();
    };
  }, []);
  return ReactDOM.createPortal(
    <div className="dash-lib-drawer-wrap">
      <div className="dash-lib-drawer-scrim" aria-hidden="true" onClick={() => closeRef.current()} />
      <aside ref={panel} className="dash-lib-drawer" role="dialog" aria-modal="true" aria-labelledby={id}>
        <div className="dash-lib-drawer-head">
          <h2 id={id} tabIndex={-1}>{title}</h2>
          <button type="button" className="dash-lib-drawer-x" onClick={() => closeRef.current()}>Close</button>
        </div>
        {sub && <p className="dash-lib-drawer-sub">{sub}</p>}
        <div className="dash-lib-drawer-body">{children}</div>
      </aside>
    </div>,
    document.body
  );
}

// People as marks and names: each client's Shape Score tier on a gem beside the name (#2630; an
// unknown tier is hollow), never on the name. `extra` counts people not named (not on the roster).
function DashLibPeople({ people, max = 3, extra = 0 }) {
  const shown = (people || []).slice(0, max);
  const more = (people || []).length - shown.length + (extra > 0 ? extra : 0);
  return (
    <span className="dash-lib-people">
      {shown.map((p, i) => (
        <span key={p.id != null ? p.id : i} className="dash-lib-person">
          {typeof DashClientGem === "function" && <DashClientGem points={p.rankPoints} title={p.name} />}
          <span>{p.name}</span>
        </span>
      ))}
      {more > 0 && <span className="dash-lib-person-more">{"+" + more + " more"}</span>}
    </span>
  );
}

// One library card, the same size as every other: a cover in its kind's colour with the kind in
// words, the name, its facts, then ONE primary and the ⋯. A click on the card opens it (the
// builder); the name is the keyboard's way in, a button of its own inside the heading. ⚠ THE
// CARD IS NOT A BUTTON: it holds buttons, and a button never holds another (#2628).
// `cover.tone` ({ light, dark }) is a plan type's colour for each paper tone (dashLibKind), which
// dash.css picks by the paper; `cover.color` is one colour for every paper.
function DashLibCard({ name, cover, meta, children, primary, menu, onOpen, openTitle }) {
  const click = (e) => {
    if (!onOpen || e.defaultPrevented) return;
    const t = e.target;
    if (t && typeof t.closest === "function" && t.closest("button, a, input, select, textarea, label, [role='menu']")) return;
    onOpen();
  };
  const tone = cover.tone || null;
  return (
    <article className="dash-plate dash-lib-card" data-lib-card="" onClick={click}>
      <div className="dash-lib-cover" data-kind-tone={tone ? "" : undefined}
        style={tone ? { "--lib-cl": tone.light, "--lib-cd": tone.dark } : { "--lib-c": cover.color }}>
        <span className="dash-lib-kind">{cover.kind}</span>
        {cover.badges && <span className="dash-lib-badges">{cover.badges}</span>}
      </div>
      <div className="dash-lib-body">
        <h2 className="dash-lib-name">{onOpen ? <button type="button" title={openTitle} onClick={onOpen}>{name}</button> : name}</h2>
        {meta && <p className="dash-lib-meta">{meta}</p>}
        {children}
      </div>
      <div className="dash-lib-actions">{primary}{menu}</div>
    </article>
  );
}

// A plan type's own colour (clientColors.mjs PROGRAM_TYPES: Cut tangerine, Maintain mint, Build
// violet, Race azure, Intake slate), as { light, dark }, or null for a type it does not name.
// Read at call time: the module script may land after this file.
function dashLibKind(type) {
  try {
    const CC = typeof window !== "undefined" ? window.ShapeClientColors : null;
    const t = CC && CC.PROGRAM_TYPES ? CC.PROGRAM_TYPES[String(type || "").trim().toLowerCase()] : null;
    return t ? { light: t.light, dark: t.dark } : null;
  } catch (e) { return null; }
}

// The sentence for a roster the page needed and could not read (useDashboard's `unread`).
const DASH_LIB_ROSTER_UNREAD = "Your roster couldn’t be read just now · reload to try again";
// The roster as the libraries read it: "live", "demo" (the signed-out preview, under the band),
// "unread" (a signed-in coach whose roster read failed) or "loading". ⚠ A SIGNED-IN LIBRARY IS
// NEVER THE PREVIEW: when the library's own read says who is signed in (`signedIn`), a roster
// that came back as the demo is a failed read, not sample people to show them.
function dashLibRosterState(source, signedIn) {
  if (source === "live") return "live";
  if (source === "unread" || (source === "demo" && signedIn)) return "unread";
  if (source === "demo") return "demo";
  return "loading";
}
// The day an instant falls on, "YYYY-MM-DD", on the account's clock (ShapeZone); this browser's
// without it. '' when it can't be read.
function dashLibDayKey(at) {
  const t = typeof at === "number" ? at : Date.parse(String(at || ""));
  if (!Number.isFinite(t)) return "";
  try {
    const Z = typeof window !== "undefined" ? window.ShapeZone : null;
    if (Z && typeof Z.dayKey === "function" && typeof Z.viewerZone === "function") { const k = Z.dayKey(t, Z.viewerZone()); if (k) return k; }
  } catch (e) { /* the browser's day below */ }
  const x = new Date(t);
  return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0");
}
// The Monday the coach's week opens on, "YYYY-MM-DD", on the account's clock.
function dashLibWeekStartKey(now) {
  const t = now == null ? Date.now() : +now;
  const key = dashLibDayKey(t);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return "";
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
// The coach's week ends on Sunday, on the account's clock (ShapeZone); this browser's without it.
// "Sun · Nov 15".
function dashLibWeekEnd(now) {
  const t = now == null ? Date.now() : +now;
  try {
    const Z = typeof window !== "undefined" ? window.ShapeZone : null;
    let y, mo, d, wd;
    if (Z && typeof Z.partsInZone === "function" && typeof Z.viewerZone === "function") {
      const p = Z.partsInZone(t, Z.viewerZone());
      if (p) { y = p.y; mo = p.mo; d = p.d; wd = p.wd; }
    }
    if (y == null) { const x = new Date(t); y = x.getFullYear(); mo = x.getMonth() + 1; d = x.getDate(); wd = x.getDay(); }
    const sun = new Date(Date.UTC(y, mo - 1, d + ((7 - wd) % 7)));
    return "Sun · " + sun.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  } catch (e) { return "Sunday"; }
}

Object.assign(window, { DashFilterBar, DashFacetMenu, DashTagChips, DFB_EMPTY, dfbRun, dfbToggle, dfbClearFacet, dfbSelected, dfbCountLabel, dfbPopShift, useDfbPopShift,
  DashLibSort, DashLibStatus, DashLibMenu, DashLibTopLine, DashLibDrawer, DashLibPeople, DashLibCard, DASH_LIB_ROSTER_UNREAD, dashLibRosterState, dashLibWeekEnd, dashLibKind, dashLibDayKey, dashLibWeekStartKey });
