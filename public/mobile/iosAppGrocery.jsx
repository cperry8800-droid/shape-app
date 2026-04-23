// Grocery list — editorial, interactive
// Auto-generated from the weekly plan + personal library of saved lists.

const { useState: useStateGL, useEffect: useEffectGL, useMemo: useMemoGL } = React;

// ---------- Seed data ----------

const DEFAULT_LIST = {
  id: 'plan-week-6',
  name: 'This week · Plan',
  kind: 'plan', // plan | custom | template
  eyebrow: 'Week 6 · Auto-built from plan',
  author: 'Dr. Maya Patel',
  note: '"Swap salmon for cod if the price jumps — keep portions the same."',
  aisles: [
    { aisle: 'Produce',        items: [
      { n: 'Baby spinach',       q: '2 bags',        meals: 'Salmon bowl · snacks' },
      { n: 'Blueberries',        q: '2 pints',       meals: 'Breakfast oats' },
      { n: 'Lemons',             q: '4',             meals: 'Salmon · water' },
      { n: 'Avocado',            q: '3',             meals: 'Lunch bowls' },
      { n: 'Bell peppers',       q: '4',             meals: 'Stir-fry night' },
      { n: 'Broccoli',           q: '2 heads',       meals: 'Salmon plate' },
    ]},
    { aisle: 'Protein',        items: [
      { n: 'Chicken breast',     q: '2.5 lb',        meals: 'Lunch bowls x4' },
      { n: 'Wild salmon',        q: '1.2 lb',        meals: 'Tue / Fri dinner' },
      { n: 'Eggs',               q: '18 ct',         meals: 'Breakfasts' },
      { n: 'Greek yogurt, 0%',   q: '32 oz',         meals: '4pm snack' },
      { n: 'Whey isolate',       q: '— have',        meals: '—', have: true },
    ]},
    { aisle: 'Pantry',         items: [
      { n: 'Jasmine rice',       q: '2 lb',          meals: 'Lunch bowls' },
      { n: 'Quinoa',             q: '1 lb',          meals: 'Salmon plate' },
      { n: 'Rolled oats',        q: '— have',        meals: 'Breakfast', have: true },
      { n: 'Raw almonds',        q: '12 oz',         meals: '4pm snack' },
      { n: 'Olive oil',          q: '— have',        meals: '—', have: true },
    ]},
    { aisle: 'Dairy & cold',   items: [
      { n: 'Unsweetened almond milk', q: '1/2 gal',  meals: 'Oats · coffee' },
      { n: 'Feta',                    q: '6 oz',     meals: 'Salmon plate' },
    ]},
  ],
};

// Built-in library seeds — a mix of user-saved customs and curated templates.
const LIBRARY_SEED = [
  {
    id: 'sunday-staples',
    name: 'Sunday staples',
    kind: 'custom',
    eyebrow: 'Saved · Mar 12',
    author: 'You',
    note: '"My no-think weekly basics. Top up, done."',
    usedCount: 14,
    aisles: [
      { aisle: 'Produce', items: [
        { n: 'Bananas',        q: '6' },
        { n: 'Baby spinach',   q: '1 bag' },
        { n: 'Lemons',         q: '3' },
      ]},
      { aisle: 'Protein', items: [
        { n: 'Eggs',           q: '18 ct' },
        { n: 'Chicken breast', q: '2 lb' },
      ]},
      { aisle: 'Pantry', items: [
        { n: 'Rolled oats',    q: '1 bag' },
        { n: 'Olive oil',      q: '—' },
        { n: 'Coffee',         q: '12 oz' },
      ]},
    ],
  },
  {
    id: 'travel-week',
    name: 'Travel week',
    kind: 'custom',
    eyebrow: 'Saved · Feb 28',
    author: 'You',
    note: '"Minimal, shelf-stable, airport-friendly."',
    usedCount: 4,
    aisles: [
      { aisle: 'Pantry', items: [
        { n: 'Protein bars',   q: '1 box' },
        { n: 'Jerky',          q: '2 bags' },
        { n: 'Nut butter cups',q: '1 pack' },
        { n: 'Electrolytes',   q: '10 pkts' },
      ]},
      { aisle: 'Produce', items: [
        { n: 'Apples',         q: '4' },
      ]},
    ],
  },
  {
    id: 'meal-prep-sunday',
    name: 'Meal-prep Sunday',
    kind: 'custom',
    eyebrow: 'Saved · Jan 19',
    author: 'You',
    note: '"5 lunches, 5 dinners. Chicken + rice + greens base."',
    usedCount: 22,
    aisles: [
      { aisle: 'Protein', items: [
        { n: 'Chicken thighs', q: '4 lb' },
        { n: 'Ground turkey',  q: '2 lb' },
      ]},
      { aisle: 'Pantry', items: [
        { n: 'Jasmine rice',   q: '4 lb' },
        { n: 'Black beans',    q: '3 cans' },
      ]},
      { aisle: 'Produce', items: [
        { n: 'Broccoli',       q: '3 heads' },
        { n: 'Bell peppers',   q: '6' },
        { n: 'Sweet potato',   q: '4' },
      ]},
    ],
  },
  {
    id: 'tmpl-cutting',
    name: 'Cutting — Dr. Patel',
    kind: 'template',
    eyebrow: 'Template · Nutritionist',
    author: 'Dr. Maya Patel',
    note: '"Starter basics for a 2,100-kcal cut. Personalize in the editor."',
    usedCount: 188,
    aisles: [
      { aisle: 'Produce', items: [
        { n: 'Baby spinach',   q: '2 bags' },
        { n: 'Berries',        q: '2 pints' },
      ]},
      { aisle: 'Protein', items: [
        { n: 'Lean protein',   q: '3 lb' },
        { n: 'Egg whites',     q: '32 oz' },
      ]},
    ],
  },
  {
    id: 'tmpl-bulking',
    name: 'Bulking — base cart',
    kind: 'template',
    eyebrow: 'Template · Community',
    author: 'Shape',
    note: '"Calorie-dense staples for 3,200+ kcal weeks."',
    usedCount: 412,
    aisles: [
      { aisle: 'Pantry', items: [
        { n: 'Oats',           q: '3 lb' },
        { n: 'Rice',           q: '5 lb' },
        { n: 'Peanut butter',  q: '40 oz' },
      ]},
      { aisle: 'Protein', items: [
        { n: 'Whole milk',     q: '1 gal' },
        { n: 'Ground beef',    q: '3 lb' },
      ]},
    ],
  },
];

// ---------- Main GroceryList ----------

function GroceryList({ onBack }) {
  // view: 'list' | 'library' | 'save'
  const [view, setView] = useStateGL('list');
  const [library, setLibrary] = useStateGL(() => {
    try {
      const raw = localStorage.getItem('shape.grocery.lib');
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return LIBRARY_SEED;
  });
  const [activeList, setActiveList] = useStateGL(DEFAULT_LIST);
  const [checked, setChecked] = useStateGL(() => initChecked(DEFAULT_LIST));
  // confirmation toast after save/load
  const [toast, setToast] = useStateGL(null);

  // persist library
  useEffectGL(() => {
    try { localStorage.setItem('shape.grocery.lib', JSON.stringify(library)); } catch(e){}
  }, [library]);

  // reset checkboxes when switching the active list
  useEffectGL(() => {
    setChecked(initChecked(activeList));
  }, [activeList.id]);

  function loadFromLibrary(listId) {
    const found = library.find(l => l.id === listId);
    if (!found) return;
    setActiveList({ ...found });
    setView('list');
    showToast(`Loaded · ${found.name}`);
  }

  function saveCurrentAs(name) {
    const aisles = activeList.aisles.map(a => ({
      aisle: a.aisle,
      items: a.items.map(({ n, q }) => ({ n, q })),
    }));
    const now = new Date();
    const eyebrow = `Saved · ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    const newList = {
      id: `custom-${Date.now()}`,
      name: name || 'Untitled list',
      kind: 'custom',
      eyebrow,
      author: 'You',
      note: '',
      usedCount: 0,
      aisles,
    };
    setLibrary(prev => [newList, ...prev]);
    setView('library');
    showToast(`Saved · ${newList.name}`);
  }

  function deleteFromLibrary(id) {
    setLibrary(prev => prev.filter(l => l.id !== id));
    showToast('Removed from library');
  }

  function renameInLibrary(id, name) {
    setLibrary(prev => prev.map(l => l.id === id ? { ...l, name } : l));
  }

  function duplicateInLibrary(id) {
    const src = library.find(l => l.id === id);
    if (!src) return;
    const copy = { ...src, id: `custom-${Date.now()}`, name: `${src.name} copy`, kind: 'custom', author: 'You', usedCount: 0 };
    setLibrary(prev => [copy, ...prev]);
    showToast('Duplicated');
  }

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  }

  // ---- render ----
  return (
    <div style={{ position: 'absolute', inset: 0, background: PAPER, color: INK, overflow: 'hidden' }}>
      {view === 'list' && (
        <ListView
          list={activeList}
          checked={checked}
          setChecked={setChecked}
          onBack={onBack}
          onOpenLibrary={() => setView('library')}
          onSave={() => setView('save')}
        />
      )}
      {view === 'library' && (
        <LibraryView
          library={library}
          activeId={activeList.id}
          onBack={() => setView('list')}
          onLoad={loadFromLibrary}
          onDelete={deleteFromLibrary}
          onRename={renameInLibrary}
          onDuplicate={duplicateInLibrary}
          onSaveCurrent={() => setView('save')}
        />
      )}
      {view === 'save' && (
        <SaveSheet
          suggestedName={defaultSaveName(activeList)}
          onCancel={() => setView('list')}
          onConfirm={saveCurrentAs}
        />
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'absolute', left: '50%', bottom: 32, transform: 'translateX(-50%)',
          background: INK, color: PAPER, padding: '10px 16px', borderRadius: 999,
          fontFamily: MONO, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase',
          boxShadow: '0 8px 24px rgba(0,0,0,0.2)', zIndex: 50, whiteSpace: 'nowrap',
        }}>{toast}</div>
      )}
    </div>
  );
}

function initChecked(list) {
  const s = new Set();
  list.aisles.forEach((a, ai) => a.items.forEach((it, ii) => { if (it.have) s.add(`${ai}-${ii}`); }));
  return s;
}

function defaultSaveName(list) {
  if (list.kind === 'plan') {
    const d = new Date();
    return `Week of ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }
  return list.name;
}

// ---------- List view (existing layout, with library/save affordances) ----------

function ListView({ list, checked, setChecked, onBack, onOpenLibrary, onSave }) {
  const allIds = [];
  list.aisles.forEach((a, ai) => a.items.forEach((_, ii) => allIds.push(`${ai}-${ii}`)));

  const toggle = (id) => {
    setChecked(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const total = allIds.length;
  const done = checked.size;
  const pct = total ? done / total : 0;
  const estCost = Math.max(0, Math.round(88 - done * 4.2));

  const isCustom = list.kind !== 'plan';

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'auto', paddingBottom: 120 }}>
      {/* Header */}
      <div style={{ padding: '58px 24px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <button onClick={onBack} style={btnGhost}>← Back</button>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onOpenLibrary} style={btnGhost}>Library</button>
            <MLabel color={CORAL}>{isCustom ? list.eyebrow.split(' · ')[0] : 'Refreshed Sun'}</MLabel>
          </div>
        </div>

        <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.18em', color: CORAL, textTransform: 'uppercase', marginBottom: 12 }}>
          {list.eyebrow}
        </div>
        <h1 style={{
          fontFamily: SERIF, fontSize: 40, lineHeight: 0.98, letterSpacing: '-0.035em',
          fontWeight: 400, margin: 0, color: INK,
        }}>
          {isCustom ? (
            <>{list.name.split(' ').slice(0, -1).join(' ') || list.name}<br/>
              <em style={{ fontStyle: 'italic', color: CORAL, fontWeight: 500 }}>
                {list.name.split(' ').slice(-1)[0]}.
              </em>
            </>
          ) : (
            <>Shop<br/><em style={{ fontStyle: 'italic', color: CORAL, fontWeight: 500 }}>list.</em></>
          )}
        </h1>
      </div>

      {/* Progress chip */}
      <div style={{ padding: '22px 24px 0' }}>
        <EdCard pad={18} tint="linear-gradient(145deg, rgba(227,122,90,0.12), rgba(227,122,90,0.02))" style={{ border: `1px solid rgba(227,122,90,0.22)` }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div>
              <MLabel color={CORAL}>Progress</MLabel>
              <div style={{ fontFamily: SERIF, fontSize: 44, lineHeight: 0.9, letterSpacing: '-0.03em', color: INK, marginTop: 6 }}>
                {done}<span style={{ fontSize: 18, color: INK_45 }}> / {total}</span>
              </div>
              <div style={{ marginTop: 8 }}>
                <MStats items={[`~$${estCost} to go`, `${list.aisles.length} aisles`, 'est. 22 min']} color={CORAL} />
              </div>
            </div>
            <div style={{
              width: 62, height: 62, borderRadius: 31,
              background: `conic-gradient(${CORAL} 0deg ${pct * 360}deg, ${HAIR} ${pct * 360}deg)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{
                width: 52, height: 52, borderRadius: 26, background: PAPER,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: MONO, fontSize: 11, color: CORAL, letterSpacing: '0.04em',
              }}>{Math.round(pct * 100)}%</div>
            </div>
          </div>
          <div style={{ height: 3, background: HAIR, marginTop: 16, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: `${pct * 100}%`, height: '100%', background: CORAL, transition: 'width 0.3s ease' }} />
          </div>
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${HAIR_S}`, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Pill color={CORAL} solid>Send to Instacart →</Pill>
            <Pill color={CORAL} onClick={onSave}>＋ Save to library</Pill>
            <Pill color={CORAL}>Share</Pill>
          </div>
        </EdCard>
      </div>

      {/* Attribution / note */}
      {list.note && (
        <div style={{ padding: '22px 24px 0' }}>
          <EdCard pad={16}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Attribution init={list.author?.[0] || 'S'} color={list.kind === 'plan' ? GOLD : CORAL} name={list.author} role={list.kind === 'plan' ? 'Your plan' : (list.kind === 'template' ? 'Template' : 'Saved list')} />
              <MLabel>{list.kind === 'plan' ? 'Cutting · 2,100' : `Used ${list.usedCount || 0}×`}</MLabel>
            </div>
            <div style={{
              marginTop: 10, fontFamily: SERIF, fontStyle: 'italic', fontSize: 15, lineHeight: 1.35,
              letterSpacing: '-0.005em', color: INK_60,
            }}>
              {list.note}
            </div>
          </EdCard>
        </div>
      )}

      {/* Aisle sections */}
      {list.aisles.map((aisle, ai) => {
        const aisleDone = aisle.items.filter((_, ii) => checked.has(`${ai}-${ii}`)).length;
        return (
          <div key={aisle.aisle}>
            <SectionHeader eyebrow={`Aisle · ${aisleDone}/${aisle.items.length}`} title={aisle.aisle} />
            <div style={{ padding: '0 24px' }}>
              {aisle.items.map((it, ii) => {
                const id = `${ai}-${ii}`;
                const on = checked.has(id);
                const isLast = ii === aisle.items.length - 1;
                return (
                  <div key={id} onClick={() => toggle(id)} style={{
                    display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0',
                    borderBottom: isLast ? 0 : `1px solid ${HAIR_S}`,
                    cursor: 'pointer', opacity: on ? 0.45 : 1,
                    transition: 'opacity 0.15s',
                  }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: 6,
                      border: `1.5px solid ${on ? CORAL : INK_30}`,
                      background: on ? CORAL : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, transition: 'all 0.15s',
                    }}>
                      {on && <span style={{ color: PAPER, fontSize: 12, fontWeight: 700 }}>✓</span>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontFamily: SANS, fontSize: 15, fontWeight: 500, color: INK, letterSpacing: -0.1,
                        textDecoration: on ? 'line-through' : 'none', textDecorationColor: INK_45,
                      }}>{it.n}</div>
                      {it.meals && (
                        <div style={{
                          fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.06em',
                          color: INK_60, marginTop: 3,
                        }}>{it.meals}</div>
                      )}
                    </div>
                    <div style={{
                      fontFamily: MONO, fontSize: 11, letterSpacing: '0.08em',
                      color: on ? INK_45 : CORAL, textAlign: 'right', minWidth: 54,
                    }}>{it.q}</div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Footer */}
      <div style={{ padding: '28px 24px 0' }}>
        <div style={{
          fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', color: INK_30,
          textTransform: 'uppercase', textAlign: 'center',
        }}>
          {list.kind === 'plan' ? 'Regenerates every Sunday · Based on your active plan' : 'From your library · Edit anytime'}
        </div>
      </div>

      <div style={{ height: 24 }} />
    </div>
  );
}

// ---------- Library view ----------

function LibraryView({ library, activeId, onBack, onLoad, onDelete, onRename, onDuplicate, onSaveCurrent }) {
  const [filter, setFilter] = useStateGL('all'); // all | custom | template
  const [query, setQuery] = useStateGL('');
  const [menuFor, setMenuFor] = useStateGL(null);

  const filtered = useMemoGL(() => {
    return library.filter(l => {
      if (filter === 'custom' && l.kind !== 'custom') return false;
      if (filter === 'template' && l.kind !== 'template') return false;
      if (query && !l.name.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [library, filter, query]);

  const customs = library.filter(l => l.kind === 'custom').length;
  const tmpls = library.filter(l => l.kind === 'template').length;

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'auto', paddingBottom: 120 }}>
      {/* Header */}
      <div style={{ padding: '58px 24px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <button onClick={onBack} style={btnGhost}>← List</button>
          <MLabel color={CORAL}>{library.length} saved</MLabel>
        </div>

        <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.18em', color: CORAL, textTransform: 'uppercase', marginBottom: 12 }}>
          Your library
        </div>
        <h1 style={{
          fontFamily: SERIF, fontSize: 40, lineHeight: 0.98, letterSpacing: '-0.035em',
          fontWeight: 400, margin: 0, color: INK,
        }}>Saved<br/><em style={{ fontStyle: 'italic', color: CORAL, fontWeight: 500 }}>lists.</em></h1>

        <div style={{ marginTop: 10, fontFamily: SERIF, fontStyle: 'italic', fontSize: 15, color: INK_60, lineHeight: 1.4 }}>
          Reusable carts for how you actually shop — staples, prep days, travel weeks.
        </div>
      </div>

      {/* Save-current CTA */}
      <div style={{ padding: '22px 24px 0' }}>
        <div onClick={onSaveCurrent} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 18px', borderRadius: 14, cursor: 'pointer',
          background: 'linear-gradient(145deg, rgba(227,122,90,0.14), rgba(227,122,90,0.04))',
          border: '1px dashed rgba(227,122,90,0.45)',
        }}>
          <div>
            <MLabel color={CORAL}>＋ Save current</MLabel>
            <div style={{ fontFamily: SERIF, fontSize: 18, letterSpacing: '-0.01em', color: INK, marginTop: 4 }}>
              Add this week's list to your library
            </div>
          </div>
          <div style={{ fontFamily: MONO, fontSize: 11, color: CORAL, letterSpacing: '0.1em' }}>→</div>
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: '18px 24px 0' }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your lists..."
          style={{
            width: '100%', boxSizing: 'border-box',
            background: 'transparent', border: 0, borderBottom: `1px solid ${HAIR}`,
            padding: '10px 0', fontFamily: SANS, fontSize: 16, color: INK, outline: 'none',
          }}
        />
      </div>

      {/* Filter chips */}
      <div style={{ padding: '16px 24px 0', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Chip on={filter === 'all'} onClick={() => setFilter('all')}>All · {library.length}</Chip>
        <Chip on={filter === 'custom'} onClick={() => setFilter('custom')}>Mine · {customs}</Chip>
        <Chip on={filter === 'template'} onClick={() => setFilter('template')}>Templates · {tmpls}</Chip>
      </div>

      {/* List cards */}
      <div style={{ padding: '18px 24px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filtered.length === 0 && (
          <div style={{
            padding: '40px 20px', textAlign: 'center',
            fontFamily: SERIF, fontStyle: 'italic', fontSize: 16, color: INK_45,
          }}>
            No lists match. Try a different filter.
          </div>
        )}
        {filtered.map(l => {
          const count = l.aisles.reduce((s, a) => s + a.items.length, 0);
          const isActive = l.id === activeId;
          const preview = l.aisles.flatMap(a => a.items).slice(0, 3).map(i => i.n).join(' · ');
          const color = l.kind === 'template' ? GOLD : CORAL;
          return (
            <div key={l.id} style={{
              position: 'relative',
              padding: 16, borderRadius: 14,
              background: isActive ? 'rgba(227,122,90,0.06)' : PAPER,
              border: `1px solid ${isActive ? 'rgba(227,122,90,0.35)' : HAIR}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }} onClick={() => onLoad(l.id)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <div style={{
                      fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em',
                      textTransform: 'uppercase', color,
                    }}>{l.kind === 'template' ? 'Template' : 'Mine'}</div>
                    {isActive && <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', color: INK_45 }}>· ACTIVE</div>}
                  </div>
                  <div style={{
                    fontFamily: SERIF, fontSize: 22, letterSpacing: '-0.02em', color: INK,
                    lineHeight: 1.1, cursor: 'pointer',
                  }}>{l.name}</div>
                  <div style={{ marginTop: 6, fontFamily: SANS, fontSize: 13, color: INK_60, lineHeight: 1.4 }}>
                    {preview}{count > 3 ? ` · +${count - 3} more` : ''}
                  </div>
                  <div style={{ marginTop: 10, display: 'flex', gap: 12, fontFamily: MONO, fontSize: 10, letterSpacing: '0.08em', color: INK_45, textTransform: 'uppercase' }}>
                    <span>{count} items</span>
                    <span>·</span>
                    <span>{l.eyebrow.replace(/^[^·]+· /, '') || l.eyebrow}</span>
                    {l.usedCount > 0 && (<><span>·</span><span>Used {l.usedCount}×</span></>)}
                  </div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === l.id ? null : l.id); }}
                  style={{ ...btnGhost, fontSize: 20, padding: '0 6px', color: INK_60 }}>⋯</button>
              </div>

              <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${HAIR_S}`, display: 'flex', gap: 8 }}>
                <Pill color={color} solid onClick={() => onLoad(l.id)}>Load list →</Pill>
                <Pill color={color} onClick={() => onDuplicate(l.id)}>Duplicate</Pill>
              </div>

              {/* Context menu */}
              {menuFor === l.id && (
                <div style={{
                  position: 'absolute', top: 48, right: 12, zIndex: 10,
                  background: PAPER, border: `1px solid ${HAIR}`, borderRadius: 10,
                  boxShadow: '0 10px 24px rgba(0,0,0,0.12)', minWidth: 180, overflow: 'hidden',
                }}>
                  <MenuItem onClick={() => { onLoad(l.id); setMenuFor(null); }}>Load into shop list</MenuItem>
                  <MenuItem onClick={() => { onDuplicate(l.id); setMenuFor(null); }}>Duplicate</MenuItem>
                  {l.kind === 'custom' && (
                    <MenuItem onClick={() => {
                      const name = prompt('Rename list', l.name);
                      if (name) onRename(l.id, name);
                      setMenuFor(null);
                    }}>Rename</MenuItem>
                  )}
                  <MenuItem>Share</MenuItem>
                  {l.kind === 'custom' && (
                    <MenuItem danger onClick={() => {
                      if (confirm(`Remove "${l.name}" from library?`)) onDelete(l.id);
                      setMenuFor(null);
                    }}>Delete</MenuItem>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ height: 32 }} />
    </div>
  );
}

// ---------- Save sheet ----------

function SaveSheet({ suggestedName, onCancel, onConfirm }) {
  const [name, setName] = useStateGL(suggestedName);

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(20,20,20,0.35)', display: 'flex', alignItems: 'flex-end' }}>
      <div style={{
        width: '100%', background: PAPER, borderTopLeftRadius: 24, borderTopRightRadius: 24,
        padding: '28px 24px 32px', boxShadow: '0 -12px 40px rgba(0,0,0,0.2)',
      }}>
        <div style={{
          width: 40, height: 4, background: HAIR, borderRadius: 2,
          margin: '-14px auto 20px',
        }} />
        <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.18em', color: CORAL, textTransform: 'uppercase' }}>
          Save to library
        </div>
        <h2 style={{
          fontFamily: SERIF, fontSize: 28, letterSpacing: '-0.025em', fontWeight: 400,
          color: INK, margin: '8px 0 4px', lineHeight: 1.05,
        }}>Name this <em style={{ color: CORAL }}>list.</em></h2>
        <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 14, color: INK_60, marginBottom: 20 }}>
          Saves the current items (without checkboxes) so you can reload them anytime.
        </div>

        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{
            width: '100%', boxSizing: 'border-box',
            background: 'transparent', border: 0, borderBottom: `1.5px solid ${CORAL}`,
            padding: '10px 0', fontFamily: SERIF, fontSize: 20, color: INK, outline: 'none',
          }}
        />

        <div style={{ marginTop: 16 }}>
          <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: INK_45, marginBottom: 8 }}>
            Quick names
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {['Sunday staples', 'Travel week', 'Meal prep', 'Lean week', 'Backup cart'].map(s => (
              <Chip key={s} onClick={() => setName(s)}>{s}</Chip>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: '14px', borderRadius: 10, border: `1px solid ${HAIR}`,
            background: 'transparent', color: INK, fontFamily: MONO, fontSize: 11,
            letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={() => onConfirm(name.trim() || suggestedName)} style={{
            flex: 2, padding: '14px', borderRadius: 10, border: 0,
            background: CORAL, color: PAPER, fontFamily: MONO, fontSize: 11,
            letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer', fontWeight: 600,
          }}>Save to library</button>
        </div>
      </div>
    </div>
  );
}

// ---------- Bits ----------

const btnGhost = {
  background: 'transparent', border: 0, color: INK, cursor: 'pointer',
  fontFamily: MONO, fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase',
  display: 'flex', alignItems: 'center', gap: 8, padding: 0,
};

function Chip({ children, on, onClick }) {
  return (
    <button onClick={onClick} style={{
      background: on ? INK : 'transparent',
      color: on ? PAPER : INK,
      border: `1px solid ${on ? INK : HAIR}`,
      padding: '6px 12px', borderRadius: 999, cursor: 'pointer',
      fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
    }}>{children}</button>
  );
}

function MenuItem({ children, onClick, danger }) {
  return (
    <div onClick={onClick} style={{
      padding: '11px 14px', fontFamily: SANS, fontSize: 14,
      color: danger ? '#C94A3A' : INK, cursor: 'pointer',
      borderBottom: `1px solid ${HAIR_S}`,
    }}>{children}</div>
  );
}

Object.assign(window, { GroceryList });
