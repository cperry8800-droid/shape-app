// iosAppBroadsheetMarketplace.jsx — Coach marketplace in the Broadsheet visual language.
// "The Personals" / classifieds-meets-features. Browse trainers + nutritionists.
//
// Provides:
//   • BSMarketplaceScreen — full screen with hero, tab toggle, featured coach,
//     filter strip, coach grid, "rate card" listings, and a "writers wanted" CTA.
//   • BSCoachDetail        — opened when a coach card is tapped (sheet-style).

const { useState: useStateBSM2, useMemo: useMemoBSM2 } = React;
const { BSPage, BSPageHeader, BSAvatar, BSEyebrow, BSSection, BSSlab, BSCell, BSTag, BSRow, BSFooter, BSHalftone, useBS } = window;

// ═══════════════════════════════════════════════════════════
// Data
// ═══════════════════════════════════════════════════════════
const BSM_COACHES = {
  Trainer: [
    { id: 't1', name: 'Jordan Chen',   loc: 'Brooklyn, NY',   cred: 'NASM-CPT · 9 yrs',  spec: ['Strength', 'Hypertrophy', 'Block periodization'], rate: 180, sessions: '50-min · 1:1', match: 96, rating: 4.9, clients: 28, init: 'J', bio: 'Block-style strength coach. Tempo-driven progressions, weekly RPE check-ins, no fluff.', tag: 'YOUR COACH' },
    { id: 't2', name: 'Maya Okafor',   loc: 'Brooklyn, NY',   cred: 'NASM-CPT · 9 yrs',  spec: ['Hypertrophy', 'Women 30+', 'Posture'],            rate: 165, sessions: '45-min · 1:1', match: 92, rating: 4.9, clients: 32, init: 'M', bio: 'Hypertrophy-first coach focused on women 30+. Big on posture and joint care.' },
    { id: 't3', name: 'Diego Morales', loc: 'Austin, TX',     cred: 'CSCS · 7 yrs',      spec: ['Powerlifting', 'Conjugate', 'Masters'],           rate: 195, sessions: '60-min · 1:1', match: 88, rating: 4.8, clients: 21, init: 'D', bio: 'Conjugate-style powerlifting coach. Comfortable with masters lifters and rehab return.' },
    { id: 't4', name: 'Sana Bhatt',    loc: 'Remote',         cred: 'NSCA-CPT · 5 yrs',  spec: ['Postpartum', 'At-home', 'Kettlebell'],            rate: 130, sessions: '30-min · 1:1', match: 85, rating: 4.9, clients: 28, init: 'S', bio: 'Remote-only. Postpartum return-to-strength. Equipment-light, kettlebell-leaning.' },
    { id: 't5', name: 'Lena Park',     loc: 'Los Angeles',    cred: 'ACSM-CPT · 6 yrs',  spec: ['Endurance', 'Z2 base', 'Marathon'],               rate: 150, sessions: '45-min · 1:1', match: 78, rating: 4.7, clients: 19, init: 'L', bio: 'Endurance + general strength. Polarized training. Z2 evangelist.' },
    { id: 't6', name: 'Tariq Osei',    loc: 'Chicago, IL',    cred: 'CSCS · 11 yrs',     spec: ['Olympic lift', 'Mobility', 'Rehab'],              rate: 210, sessions: '60-min · 1:1', match: 73, rating: 4.9, clients: 14, init: 'T', bio: 'Olympic-lift coach. Mobility-first. Works with PTs on shared rehab cases.' },
  ],
  Nutritionist: [
    { id: 'n1', name: 'Dr. Maya Patel',  loc: 'Remote',        cred: 'RD, CSSD · 12 yrs',  spec: ['Sports', 'Body comp', 'Cuts/builds'],          rate: 140, sessions: '30-min · 1:1', match: 94, rating: 5.0, clients: 41, init: 'M', bio: 'Sports-focused RD. Body-composition phases, refeeds, fueling around training.', tag: 'YOUR NUTRITIONIST' },
    { id: 'n2', name: 'Owen Halverson',  loc: 'Portland, OR',  cred: 'RDN · 8 yrs',        spec: ['Endurance', 'Plant-based'],                    rate: 110, sessions: '30-min · 1:1', match: 86, rating: 4.8, clients: 24, init: 'O', bio: 'Plant-based endurance fueling. Long-form training. Race-day plans.' },
    { id: 'n3', name: 'Priya Iyer',      loc: 'Remote',        cred: 'CNS · 6 yrs',        spec: ['GI / IBS', 'Anti-inflam.', 'Cuts'],            rate: 125, sessions: '45-min · 1:1', match: 81, rating: 4.9, clients: 18, init: 'P', bio: 'GI-sensitive eaters. Anti-inflammatory protocols, low-FODMAP cuts.' },
    { id: 'n4', name: 'Jules Bonner',    loc: 'Brooklyn, NY',  cred: 'RDN, CDCES · 7 yrs', spec: ['Diabetes', 'Insulin sens.', 'Family meals'],   rate: 130, sessions: '45-min · 1:1', match: 76, rating: 4.7, clients: 22, init: 'J', bio: 'Type-2 diabetes & insulin-sensitivity work. Family-meal planning that scales.' },
  ],
};

const BSM_FILTERS = ['All', 'Strength', 'Hypertrophy', 'Endurance', 'Postpartum', 'Olympic', 'Powerlifting'];
const BSN_FILTERS = ['All', 'Sports', 'Endurance', 'GI / IBS', 'Plant-based', 'Diabetes'];

// ═══════════════════════════════════════════════════════════
// Marketplace screen
// ═══════════════════════════════════════════════════════════
function BSMarketplaceScreen({ onBack, onProfile }) {
  const t = useBS();
  const [tab, setTab]       = useStateBSM2('Trainer');
  const [filter, setFilter] = useStateBSM2('All');
  const [query, setQuery]   = useStateBSM2('');
  const [open, setOpen]     = useStateBSM2(null);

  const filters = tab === 'Trainer' ? BSM_FILTERS : BSN_FILTERS;
  const all = BSM_COACHES[tab];
  const list = useMemoBSM2(() => {
    let out = all;
    if (filter !== 'All') {
      out = out.filter(c => c.spec.some(s => s.toLowerCase().includes(filter.toLowerCase())));
    }
    const q = query.trim().toLowerCase();
    if (q) {
      out = out.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.loc  || '').toLowerCase().includes(q) ||
        (c.cred || '').toLowerCase().includes(q) ||
        c.spec.some(s => s.toLowerCase().includes(q))
      );
    }
    return out;
  }, [tab, filter, query, all]);

  const featured = list[0];
  const rest = list.slice(1);

  if (open) return <BSCoachDetail coach={open} onBack={() => setOpen(null)} />;

  return (
    <BSPage>
      <BSPageHeader
        kicker="Section · Personals"
        title={<>The<br/><span style={{ fontStyle: 'italic' }}>Marketplace.</span></>}
        trailing={
          <button onClick={onBack} style={{ borderRadius: t.RADIUS_SM,
            padding: '6px 12px', background: 'transparent', color: t.INK, border: `1px solid ${t.INK}`, cursor: 'pointer',
            fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700,
          }}>← Back</button>
        }
      />

      {/* Lede */}
      <div style={{ padding: `4px ${t.padX}px 18px`, borderBottom: `1px solid ${t.RULE}` }}>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 15, lineHeight: 1.5, color: t.INK70, letterSpacing: '-0.005em' }}>
          <span style={{ fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.ACCENT, fontWeight: 700 }}>3,142 listings.</span>{' '}
          Browse certified trainers and nutritionists. Direct booking. No agency in the middle.
        </div>
      </div>

      {/* Tabs — Trainer / Nutritionist */}
      <div style={{ padding: `12px ${t.padX}px 0`, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, borderBottom: `2px solid ${t.INK}` }}>
        {['Trainer', 'Nutritionist'].map(k => {
          const on = tab === k;
          return (
            <button key={k} onClick={() => { setTab(k); setFilter('All'); }} style={{ borderRadius: t.RADIUS_SM,
              padding: '12px 0', cursor: 'pointer', textAlign: 'center',
              background: on ? t.INK : 'transparent',
              color: on ? t.PAPER : t.INK,
              border: 0,
              fontFamily: t.MONO, fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700,
            }}>{k}s · {BSM_COACHES[k].length}</button>
          );
        })}
      </div>

      {/* Search bar */}
      <div style={{ padding: `12px ${t.padX}px 0`, borderBottom: `1px solid ${t.RULE}` }}>
        <div style={{ borderRadius: t.RADIUS_SM,
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 12px', border: `1px solid ${t.INK}`, background: t.PAPER2,
          marginBottom: 12,
        }}>
          <span style={{ fontFamily: t.MONO, fontSize: 12, color: t.INK70, fontWeight: 700 }}>⌕</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${tab === 'Trainer' ? 'coaches' : 'nutritionists'} · name, city, specialty…`}
            style={{ borderRadius: t.RADIUS_SM,
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              color: t.INK, fontFamily: t.MONO, fontSize: 11, letterSpacing: '0.06em',
              padding: 0,
            }}
          />
          {query && (
            <button onClick={() => setQuery('')} style={{ borderRadius: t.RADIUS_SM,
              border: `1px solid ${t.INK}`, background: t.PAPER, color: t.INK,
              fontFamily: t.MONO, fontSize: 10, padding: '2px 6px', cursor: 'pointer', fontWeight: 700,
            }}>CLEAR</button>
          )}
        </div>
      </div>

      {/* Filter strip — wraps so all options are visible at once */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 6,
        padding: `12px ${t.padX}px`,
        borderBottom: `1px solid ${t.RULE}`,
      }}>
        {filters.map(f => {
          const on = filter === f;
          return (
            <button key={f} onClick={() => setFilter(f)} style={{ borderRadius: t.RADIUS_SM,
              padding: '6px 10px', flexShrink: 0, cursor: 'pointer',
              background: on ? t.INK : 'transparent',
              color: on ? t.PAPER : t.INK,
              border: `1px solid ${on ? t.INK : t.RULE}`,
              fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700,
              whiteSpace: 'nowrap',
            }}>{f}</button>
          );
        })}
      </div>

      {/* Empty state */}
      {!featured && (
        <div style={{ padding: `40px ${t.padX}px`, textAlign: 'center', borderBottom: `2px solid ${t.INK}` }}>
          <div style={{ fontFamily: t.DISPLAY, fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', color: t.INK }}>
            No matches.
          </div>
          <div style={{ marginTop: 8, fontFamily: t.MONO, fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK70 }}>
            Try a different name, city, or specialty
          </div>
          {(query || filter !== 'All') && (
            <button onClick={() => { setQuery(''); setFilter('All'); }} style={{ borderRadius: t.RADIUS_SM,
              marginTop: 18, padding: '10px 16px', background: t.INK, color: t.PAPER, border: 0, cursor: 'pointer',
              fontFamily: t.MONO, fontSize: 10.5, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 700,
            }}>Reset filters</button>
          )}
        </div>
      )}

      {/* FEATURED — front-page lede */}
      {featured && (
        <div onClick={() => setOpen(featured)} style={{ cursor: 'pointer', padding: `20px ${t.padX}px 22px`, borderBottom: `2px solid ${t.INK}` }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
            <BSTag color={t.ACCENT} dark={!t.isLight}>FEATURED</BSTag>
            <BSEyebrow color={t.INK50}>{featured.tag || `${featured.match}% match`}</BSEyebrow>
            <span style={{ flex: 1 }} />
            <BSEyebrow>★ {featured.rating}</BSEyebrow>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: 14, alignItems: 'start' }}>
            <BSHeadshot init={featured.init} size={90} />
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontFamily: t.DISPLAY, fontSize: 30, fontWeight: 700, letterSpacing: '-0.03em',
                lineHeight: 0.95, color: t.INK,
              }}>{featured.name}</div>
              <div style={{ marginTop: 6, fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK70, fontWeight: 600 }}>
                {featured.cred} · {featured.loc}
              </div>
              <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {featured.spec.map(s => (
                  <span key={s} style={{ borderRadius: t.RADIUS_SM,
                    fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase',
                    padding: '3px 6px', border: `1px solid ${t.RULE}`, color: t.INK70, fontWeight: 600,
                  }}>{s}</span>
                ))}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 14, fontFamily: t.DISPLAY, fontSize: 15, lineHeight: 1.45, color: t.INK, letterSpacing: '-0.005em' }}>
            "{featured.bio}"
          </div>

          <div style={{
            marginTop: 14, paddingTop: 12, borderTop: `1px solid ${t.RULE}`,
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
          }}>
            {[
              ['RATE', `$${featured.rate}`],
              ['SESSION', featured.sessions.split(' · ')[0]],
              ['CLIENTS', featured.clients],
              ['MATCH', `${featured.match}%`],
            ].map(([l, v], i) => (
              <div key={l} style={{ borderLeft: i > 0 ? `1px solid ${t.RULE}` : 0, paddingLeft: i > 0 ? 10 : 0 }}>
                <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.18em', color: t.INK50, textTransform: 'uppercase' }}>{l}</div>
                <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 18, color: t.INK, marginTop: 3, letterSpacing: '-0.02em' }}>{v}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
            <button onClick={(e) => { e.stopPropagation(); setOpen(featured); }} style={{ borderRadius: t.RADIUS_SM,
              flex: 1, padding: '12px', background: t.INK, color: t.PAPER, border: 0, cursor: 'pointer',
              fontFamily: t.MONO, fontSize: 10.5, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 700,
            }}>Book intro · 15 min</button>
            <button onClick={(e) => e.stopPropagation()} style={{ borderRadius: t.RADIUS_SM,
              padding: '12px 14px', background: 'transparent', color: t.INK, border: `1px solid ${t.INK}`, cursor: 'pointer',
              fontFamily: t.MONO, fontSize: 10.5, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 700,
            }}>Save</button>
          </div>
        </div>
      )}

      {/* GRID — two-column "personal listings" */}
      <BSSection title="Listings" meta={`${rest.length} more · ${tab === 'Trainer' ? 'Coaches' : 'Nutritionists'}`} />
      <div style={{ padding: `0 ${t.padX}px` }}>
        <div style={{ borderTop: `2px solid ${t.INK}` }} />
        {rest.map((c, i) => (
          <ListingRow key={c.id} c={c} onOpen={() => setOpen(c)} last={i === rest.length - 1} />
        ))}
      </div>

      {/* RATE CARD — like newspaper rate listings */}
      <BSSection title="Rate card" meta="At a glance" />
      <div style={{ padding: `0 ${t.padX}px 16px` }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '24px 1fr 60px 64px',
          padding: '6px 0', borderTop: `2px solid ${t.INK}`, borderBottom: `1px solid ${t.RULE}`,
          fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.INK50, fontWeight: 700,
        }}>
          <span>#</span><span>Coach · Specialty</span><span style={{ textAlign: 'right' }}>Rate</span><span style={{ textAlign: 'right' }}>Match</span>
        </div>
        {all.map((c, i) => (
          <button key={c.id} onClick={() => setOpen(c)} style={{
            display: 'grid', gridTemplateColumns: '24px 1fr 60px 64px', alignItems: 'center',
            padding: '12px 0', borderBottom: i === all.length - 1 ? 0 : `1px solid ${t.HAIR}`,
            background: 'transparent', border: 0, borderRadius: 0, width: '100%', cursor: 'pointer', textAlign: 'left', color: t.INK,
          }}>
            <span style={{ fontFamily: t.MONO, fontSize: 10, color: t.INK50, fontWeight: 700 }}>{String(i + 1).padStart(2, '0')}</span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontFamily: t.DISPLAY, fontWeight: 700, fontSize: 15, letterSpacing: '-0.015em', color: t.INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
              <span style={{ display: 'block', fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.spec.join(' · ')}</span>
            </span>
            <span style={{ textAlign: 'right', fontFamily: t.DISPLAY, fontWeight: 700, fontSize: 16, color: t.INK, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>${c.rate}</span>
            <span style={{ textAlign: 'right', fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.12em', color: c.match >= 90 ? t.ACCENT : t.INK70, fontWeight: 700 }}>{c.match}%</span>
          </button>
        ))}
      </div>

      {/* "PERSONAL ADS" — fun classifieds-styled mini cards */}
      <BSSection title="The Personals" kicker="Open calls" meta="Looking for…" />
      <div style={{ padding: `0 ${t.padX}px`, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {[
          { eye: 'WANTED · M', title: 'Hypertrophy partner', body: '4×/wk · UES split · NW Brooklyn', accent: t.AMBER },
          { eye: 'OPEN CALL', title: 'Marathon block', body: '16-wk plan · Brooklyn HM target', accent: t.ACCENT },
          { eye: 'GROUP · WED', title: 'Tempo run, 6PM', body: '5-7k · 5:00/km pace · Prospect Pk', accent: t.GREEN },
          { eye: 'EXCHANGE', title: 'Kitchen swap', body: '4 plant-based meals for 1 protocol read', accent: t.RUST },
        ].map((p, i) => (
          <BSCell key={i} accent={p.accent}>
            <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.22em', textTransform: 'uppercase', color: p.accent, fontWeight: 700 }}>{p.eye}</div>
            <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 16, color: t.INK, marginTop: 8, letterSpacing: '-0.02em', lineHeight: 1.05 }}>{p.title}</div>
            <div style={{ fontFamily: t.MONO, fontSize: 9, color: t.INK70, letterSpacing: '0.1em', marginTop: 6, fontWeight: 600 }}>{p.body}</div>
          </BSCell>
        ))}
      </div>

      {/* CTA */}
      <div style={{ margin: `22px ${t.padX}px 0`, padding: 20, background: t.INK, color: t.PAPER }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.24em', textTransform: 'uppercase', color: t.AMBER, marginBottom: 12, fontWeight: 700 }}>
          ▍ Help wanted
        </div>
        <div style={{ fontFamily: t.DISPLAY, fontWeight: 500, fontSize: 22, lineHeight: 1.2, letterSpacing: '-0.02em' }}>
          Are you a coach? <span style={{ fontStyle: 'italic' }}>Apply.</span><br/>
          Real demand, transparent rates.
        </div>
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid rgba(245,240,230,0.18)`, display: 'flex', justifyContent: 'space-between', fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
          <span>3,142 listings · 2-3 day review</span>
          <span style={{ color: t.AMBER }}>Apply →</span>
        </div>
      </div>

      <BSFooter right="Personals · Pg 1 of 12" />
    </BSPage>
  );
}

// ═══════════════════════════════════════════════════════════
// Listing row
// ═══════════════════════════════════════════════════════════
function ListingRow({ c, onOpen, last }) {
  const t = useBS();
  return (
    <button onClick={onOpen} style={{
      width: '100%', display: 'grid', gridTemplateColumns: '64px 1fr auto', gap: 12, alignItems: 'flex-start',
      padding: '14px 0', borderBottom: last ? 0 : `1px solid ${t.RULE}`,
      background: 'transparent', border: 0, borderRadius: 0, cursor: 'pointer', textAlign: 'left', color: t.INK,
    }}>
      <BSHeadshot init={c.init} size={64} />
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontFamily: t.DISPLAY, fontWeight: 700, fontSize: 18, letterSpacing: '-0.02em', color: t.INK, lineHeight: 1.05 }}>{c.name}</span>
          {c.tag && <span style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.ACCENT, fontWeight: 700 }}>· {c.tag}</span>}
        </div>
        <div style={{ marginTop: 3, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>{c.cred} · {c.loc}</div>
        <div style={{ marginTop: 6, fontFamily: t.DISPLAY, fontSize: 13, color: t.INK70, lineHeight: 1.35, letterSpacing: '-0.005em', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{c.bio}</div>
        <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {c.spec.slice(0, 3).map(s => (
            <span key={s} style={{ borderRadius: t.RADIUS_SM,
              fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.14em', textTransform: 'uppercase',
              padding: '2px 5px', border: `1px solid ${t.HAIR}`, color: t.INK70, fontWeight: 600,
            }}>{s}</span>
          ))}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontFamily: t.DISPLAY, fontWeight: 700, fontSize: 22, color: t.INK, letterSpacing: '-0.025em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>${c.rate}</div>
        <div style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50, marginTop: 3, fontWeight: 600 }}>per session</div>
        <div style={{ marginTop: 8, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: c.match >= 90 ? t.ACCENT : t.INK70, fontWeight: 700 }}>{c.match}% MATCH</div>
        <div style={{ marginTop: 4, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', color: t.INK70, fontWeight: 600 }}>★ {c.rating}</div>
      </div>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════
// Headshot — newspaper halftone-style portrait stand-in
// ═══════════════════════════════════════════════════════════
function BSHeadshot({ init, size = 72 }) {
  const t = useBS();
  return (
    <div style={{
      position: 'relative', width: size, height: size, flexShrink: 0,
      background: t.PAPER2,
      border: `1px solid ${t.INK}`,
      overflow: 'hidden',
    }}>
      {/* Halftone dot field */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0,
        backgroundImage: `radial-gradient(${t.INK} 0.9px, transparent 1.4px)`,
        backgroundSize: '4px 4px',
        opacity: 0.45,
        maskImage: 'radial-gradient(circle at 50% 38%, black 0%, black 35%, transparent 78%)',
        WebkitMaskImage: 'radial-gradient(circle at 50% 38%, black 0%, black 35%, transparent 78%)',
      }} />
      {/* Subtle vertical stripe to mimic newsprint */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0,
        background: `linear-gradient(180deg, transparent 65%, ${t.INK} 200%)`,
        opacity: 0.18,
      }} />
      {/* Initial */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: t.DISPLAY, fontWeight: 700, fontSize: size * 0.5,
        color: t.INK, letterSpacing: '-0.04em',
      }}>{init}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Coach detail screen (sheet-style)
// ═══════════════════════════════════════════════════════════
function BSCoachDetail({ coach, onBack }) {
  const t = useBS();
  const [tab, setTab] = useStateBSM2('about');
  return (
    <BSPage>
      <BSPageHeader
        kicker={`Profile · ${coach.cred.split(' · ')[0]}`}
        title={<>{coach.name.split(' ')[0]}<br/><span style={{ fontStyle: 'italic' }}>{coach.name.split(' ').slice(1).join(' ') || '—'}</span></>}
        trailing={
          <button onClick={onBack} style={{ borderRadius: t.RADIUS_SM,
            padding: '6px 12px', background: 'transparent', color: t.INK, border: `1px solid ${t.INK}`, cursor: 'pointer',
            fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700,
          }}>← Back</button>
        }
      />

      {/* Hero */}
      <div style={{ padding: `8px ${t.padX}px 18px`, borderBottom: `2px solid ${t.INK}` }}>
        <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 14, alignItems: 'flex-start' }}>
          <BSHeadshot init={coach.init} size={110} />
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <BSTag color={t.ACCENT} dark={!t.isLight}>{coach.match}% MATCH</BSTag>
              <BSEyebrow color={t.INK50}>★ {coach.rating} · {coach.clients} clients</BSEyebrow>
            </div>
            <div style={{ marginTop: 8, fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK70, fontWeight: 600 }}>
              {coach.cred} · {coach.loc}
            </div>
            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {coach.spec.map(s => (
                <span key={s} style={{ borderRadius: t.RADIUS_SM,
                  fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase',
                  padding: '3px 6px', border: `1px solid ${t.RULE}`, color: t.INK70, fontWeight: 600,
                }}>{s}</span>
              ))}
            </div>
          </div>
        </div>

        <div style={{ borderRadius: t.RADIUS_SM,
          marginTop: 14, padding: 14, background: t.PAPER2, border: `1px solid ${t.RULE}`,
          fontFamily: t.DISPLAY, fontSize: 15, lineHeight: 1.45, color: t.INK, letterSpacing: '-0.005em',
        }}>"{coach.bio}"</div>

        <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
          <button style={{ borderRadius: t.RADIUS_SM,
            flex: 1, padding: '14px', background: t.INK, color: t.PAPER, border: 0, cursor: 'pointer',
            fontFamily: t.MONO, fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 700,
          }}>Book — ${coach.rate}</button>
          <button style={{ borderRadius: t.RADIUS_SM,
            padding: '14px 16px', background: 'transparent', color: t.INK, border: `1px solid ${t.INK}`, cursor: 'pointer',
            fontFamily: t.MONO, fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 700,
          }}>Message</button>
        </div>
      </div>

      {/* Tab strip */}
      <div style={{ padding: `0 ${t.padX}px`, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderBottom: `1px solid ${t.RULE}` }}>
        {['about', 'sessions', 'reviews'].map(k => {
          const on = tab === k;
          return (
            <button key={k} onClick={() => setTab(k)} style={{ borderRadius: t.RADIUS_SM,
              padding: '12px 0', cursor: 'pointer', background: 'transparent', border: 0,
              borderBottom: `2px solid ${on ? t.INK : 'transparent'}`,
              color: on ? t.INK : t.INK50,
              fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 700,
            }}>{k}</button>
          );
        })}
      </div>

      {/* Tab content */}
      {tab === 'about' && (
        <>
          <BSSection title="Method" meta="How they work" />
          <div style={{ padding: `0 ${t.padX}px 14px` }}>
            <div style={{ borderTop: `2px solid ${t.INK}` }} />
            {[
              { k: '01', t: 'Intake', d: 'Movement screen + 3-yr training history. Free 15-min call.' },
              { k: '02', t: 'Block design', d: '4-6 wk blocks. RPE-driven. Tempo on every primary lift.' },
              { k: '03', t: 'Weekly check-in', d: 'Async on Sunday. Live 30-min on Wed.' },
              { k: '04', t: 'Re-test', d: 'Movement + load tests every 8 weeks. Adjustable.' },
            ].map((r, i, arr) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '32px 1fr', alignItems: 'flex-start', padding: '14px 0',
                borderBottom: i === arr.length - 1 ? 0 : `1px solid ${t.HAIR}`,
              }}>
                <span style={{ fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.18em', color: t.INK50, fontWeight: 700 }}>{r.k}</span>
                <div>
                  <div style={{ fontFamily: t.DISPLAY, fontWeight: 700, fontSize: 17, color: t.INK, letterSpacing: '-0.02em' }}>{r.t}</div>
                  <div style={{ marginTop: 4, fontFamily: t.DISPLAY, fontSize: 13, color: t.INK70, lineHeight: 1.4 }}>{r.d}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'sessions' && (
        <>
          <BSSection title="Sessions" meta="Pick a format" />
          <div style={{ padding: `0 ${t.padX}px 14px` }}>
            <div style={{ borderTop: `2px solid ${t.INK}` }} />
            {[
              { name: 'Free intro call', dur: '15 min · video', price: 'FREE',  next: 'Today 4 PM' },
              { name: 'Strategy session', dur: '45 min · video', price: '$120', next: 'Wed 9 AM' },
              { name: '1:1 coaching session', dur: `${coach.sessions}`, price: `$${coach.rate}`, next: 'Thu 6 PM' },
              { name: '4-week block', dur: 'Plan + 4 sessions', price: `$${coach.rate * 4 - 80}`, next: 'Starts Mon' },
            ].map((s, i, arr) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center', padding: '14px 0',
                borderBottom: i === arr.length - 1 ? 0 : `1px solid ${t.HAIR}`,
              }}>
                <div>
                  <div style={{ fontFamily: t.DISPLAY, fontWeight: 700, fontSize: 16, color: t.INK, letterSpacing: '-0.02em' }}>{s.name}</div>
                  <div style={{ marginTop: 4, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>{s.dur} · NEXT {s.next}</div>
                </div>
                <button style={{ borderRadius: t.RADIUS_SM,
                  padding: '10px 12px', background: t.INK, color: t.PAPER, border: 0, cursor: 'pointer',
                  fontFamily: t.MONO, fontSize: 10.5, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 700,
                }}>{s.price}</button>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'reviews' && (
        <>
          <BSSection title="Reviews" meta={`${coach.clients} clients · ★ ${coach.rating}`} />
          <div style={{ padding: `0 ${t.padX}px 14px` }}>
            <div style={{ borderTop: `2px solid ${t.INK}` }} />
            {[
              { who: 'Aria K.',     dur: '14 mo client', q: 'The tempo focus is the difference. I added 22 lb to my front squat in a block I thought I was going to deload through.' },
              { who: 'Devon M.',    dur: '8 mo client',  q: 'No fluff, no gimmicks. Programming is genuinely thoughtful and the weekly check-ins are short but always actionable.' },
              { who: 'Renata S.',   dur: '6 mo client',  q: 'I came in postpartum, scared to lift heavy. Six months later I deadlifted 2× bodyweight. Patient, kind, smart.' },
            ].map((r, i, arr) => (
              <div key={i} style={{ padding: '14px 0', borderBottom: i === arr.length - 1 ? 0 : `1px solid ${t.HAIR}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50, fontWeight: 700 }}>
                  <span>★★★★★ · {r.who}</span><span>{r.dur}</span>
                </div>
                <div style={{ marginTop: 8, fontFamily: t.DISPLAY, fontSize: 15, color: t.INK, lineHeight: 1.45, letterSpacing: '-0.005em' }}>"{r.q}"</div>
              </div>
            ))}
          </div>
        </>
      )}

      <BSFooter right={`Profile · ${coach.id.toUpperCase()}`} />
    </BSPage>
  );
}

// Expose
Object.assign(window, { BSMarketplaceScreen, BSCoachDetail, BSHeadshot });
