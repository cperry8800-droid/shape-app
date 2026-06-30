'use client';

// War Room dashboard UI. Self-contained dark control-panel styling (inline so
// it doesn't depend on global classes). Live layers:
//   • polls /api/warroom every 30s for fresh config + Supabase/Stripe pings
//   • browsable list of EVERY API route, grouped + collapsible, with method
//     chips and click-to-probe on any safe GET endpoint (real status + latency)
//   • tick the manual go-live items (localStorage) → rolls open items into a
//     "Next steps to go live" list.

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { WarRoomSnapshot, ServiceStatus, ApiRouteInfo } from '@/lib/warroom';

const TICKS_KEY = 'shape.warroom.ticks';

type ProbeResult = { status: 'ok' | 'alive' | 'down' | 'loading'; code: number | null; ms: number | null };

const C = {
  bg: '#0b0f17',
  panel: '#121823',
  panel2: '#0e141d',
  border: '#1e2937',
  text: '#e6edf6',
  dim: '#8a97a8',
  ok: '#2ee0a7',
  warn: '#f7c948',
  bad: '#ff6b6b',
  accent: '#5aa9ff',
};

const METHOD_COLOR: Record<string, string> = {
  GET: C.ok, POST: C.accent, PUT: C.warn, PATCH: C.warn, DELETE: C.bad, OPTIONS: C.dim, HEAD: C.dim,
};

function dot(color: string, size = 9) {
  return <span style={{ display: 'inline-block', width: size, height: size, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}` }} />;
}

function statusColor(s: ServiceStatus | ProbeResult['status']): string {
  if (s === 'ok') return C.ok;
  if (s === 'degraded' || s === 'alive') return C.warn;
  if (s === 'down') return C.bad;
  if (s === 'missing' || s === 'loading') return C.dim;
  return C.dim;
}

// Why a GET-less / special route can't be auto-probed (shown as a muted tag).
function nonProbeReason(r: ApiRouteInfo): string {
  if (!r.methods.includes('GET')) return 'write-only';
  if (r.path.includes('[')) return 'needs id';
  if (r.path.startsWith('/api/integrations/')) return 'oauth/sync';
  return 'protected';
}

export default function WarRoomClient({ initial }: { initial: WarRoomSnapshot }) {
  const [snap, setSnap] = useState<WarRoomSnapshot>(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  const [probes, setProbes] = useState<Record<string, ProbeResult>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState('');
  // Top-level view tabs — the page was one long scroll; each area now gets its
  // own focused view. Checklist sections collapse with per-section progress.
  const [view, setView] = useState<'status' | 'checklist' | 'architecture' | 'api' | 'funnel'>('status');
  const [cohortDays, setCohortDays] = useState(0);
  const [secOpen, setSecOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(TICKS_KEY);
      if (raw) setTicks(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  const toggleTick = useCallback((label: string) => {
    setTicks((prev) => {
      const next = { ...prev, [label]: !prev[label] };
      try { localStorage.setItem(TICKS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const refreshSnapshot = useCallback(async (days?: number) => {
    setRefreshing(true);
    try {
      const d = days ?? cohortDays;
      const url = d > 0 ? `/api/warroom?cohortDays=${d}` : '/api/warroom';
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) setSnap(await res.json());
    } catch { /* keep last */ }
    setRefreshing(false);
  }, [cohortDays]);

  const handleCohort = useCallback(async (days: number) => {
    setCohortDays(days);
    setRefreshing(true);
    try {
      const url = days > 0 ? `/api/warroom?cohortDays=${days}` : '/api/warroom';
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) setSnap(await res.json());
    } catch { /* keep last */ }
    setRefreshing(false);
  }, []);

  const probeRoute = useCallback(async (path: string) => {
    setProbes((p) => ({ ...p, [path]: { status: 'loading', code: null, ms: null } }));
    const started = performance.now();
    try {
      const res = await fetch(path, { cache: 'no-store' });
      const ms = Math.round(performance.now() - started);
      const status: ProbeResult['status'] = res.ok ? 'ok' : res.status >= 500 ? 'down' : 'alive';
      setProbes((p) => ({ ...p, [path]: { status, code: res.status, ms } }));
    } catch {
      setProbes((p) => ({ ...p, [path]: { status: 'down', code: null, ms: Math.round(performance.now() - started) } }));
    }
  }, []);

  const probeAll = useCallback(async () => {
    const targets = snap.apiRoutes.flatMap((g) => g.routes).filter((r) => r.probeable).map((r) => r.path);
    // small concurrency cap so we don't hammer the origin
    const queue = [...targets];
    const workers = Array.from({ length: 6 }, async () => {
      while (queue.length) {
        const path = queue.shift()!;
        await probeRoute(path);
      }
    });
    await Promise.all(workers);
  }, [snap.apiRoutes, probeRoute]);

  useEffect(() => {
    const id = setInterval(() => { refreshSnapshot(); }, 30000);
    return () => clearInterval(id);
  }, [refreshSnapshot]);

  const checklistWithTicks = useMemo(
    () => snap.checklist.map((sec) => ({
      ...sec,
      items: sec.items.map((it) => ({ ...it, done: it.status === 'done' || !!ticks[it.label] })),
    })),
    [snap.checklist, ticks],
  );

  const nextSteps = useMemo(() => {
    const out: { section: string; label: string }[] = [];
    for (const sec of checklistWithTicks) for (const it of sec.items) if (!it.done) out.push({ section: sec.section, label: it.label });
    return out;
  }, [checklistWithTicks]);

  const totalChecklist = checklistWithTicks.reduce((n, s) => n + s.items.length, 0);
  const doneChecklist = totalChecklist - nextSteps.length;

  // Group the open steps by section so the panel reads as tabs, not one long list.
  const nextBySection = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const s of nextSteps) { if (!map.has(s.section)) map.set(s.section, []); map.get(s.section)!.push(s.label); }
    return Array.from(map, ([section, items]) => ({ section, items }));
  }, [nextSteps]);
  const [stepTab, setStepTab] = useState<string | null>(null);
  const activeStepSection = stepTab && nextBySection.some((g) => g.section === stepTab) ? stepTab : (nextBySection[0]?.section ?? null);
  const activeStepItems = nextBySection.find((g) => g.section === activeStepSection)?.items ?? [];

  const filteredGroups = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return snap.apiRoutes;
    return snap.apiRoutes
      .map((g) => ({ ...g, routes: g.routes.filter((r) => r.path.toLowerCase().includes(q) || r.methods.join(',').toLowerCase().includes(q)) }))
      .filter((g) => g.routes.length > 0);
  }, [snap.apiRoutes, filter]);

  const allExpanded = filteredGroups.length > 0 && filteredGroups.every((g) => open[g.group]);
  const toggleAll = () => {
    const next: Record<string, boolean> = {};
    for (const g of snap.apiRoutes) next[g.group] = !allExpanded;
    setOpen(next);
  };

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif', padding: '24px 20px 64px' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>

        <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16, marginBottom: 22 }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 12, letterSpacing: 3, color: C.dim, textTransform: 'uppercase' }}>Shape · Operations</div>
            <h1 style={{ fontSize: 30, fontWeight: 800, margin: '2px 0 0' }}>War Room</h1>
          </div>
          <div style={{ textAlign: 'right', fontSize: 12, color: C.dim }}>
            <div>env <b style={{ color: C.text }}>{snap.runtime.vercelEnv ?? snap.runtime.nodeEnv ?? 'local'}</b> · node {snap.runtime.nodeVersion}{snap.runtime.region ? ` · ${snap.runtime.region}` : ''}</div>
            <div>updated {new Date(snap.generatedAt).toLocaleTimeString()}</div>
          </div>
          <button onClick={() => refreshSnapshot()} disabled={refreshing}
            style={{ background: C.accent, color: '#04101f', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 700, cursor: 'pointer', opacity: refreshing ? 0.6 : 1 }}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 22 }}>
          <Stat label="Config readiness" value={`${snap.readiness.score}/${snap.readiness.total}`} sub={snap.readiness.label}
            color={snap.readiness.score === snap.readiness.total ? C.ok : snap.readiness.score === 0 ? C.bad : C.warn} />
          <Stat label="Go-live steps" value={`${doneChecklist}/${totalChecklist}`} sub={nextSteps.length === 0 ? 'all clear' : `${nextSteps.length} open`}
            color={nextSteps.length === 0 ? C.ok : C.warn} />
          <Stat label="API routes" value={String(snap.inventory.apiRoutes)} sub={`${snap.apiRoutes.length} groups`} color={C.accent} />
          <Stat label="Migrations" value={String(snap.inventory.migrations)} sub="SQL files" color={C.accent} />
          <Stat label="Mobile build" value={snap.inventory.mobileBuild ? 'Present' : 'Missing'} sub={`${snap.inventory.mobileAssets} assets`}
            color={snap.inventory.mobileBuild ? C.ok : C.bad} />
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
          {([
            ['status', 'Status'],
            ['checklist', `Checklist · ${doneChecklist}/${totalChecklist}`],
            ['architecture', 'Architecture'],
            ['api', `API routes · ${snap.inventory.apiRoutes}`],
            ['funnel', 'Funnel'],
          ] as const).map(([k, l]) => {
            const on = view === k;
            return (
              <button key={k} onClick={() => setView(k)}
                style={{ padding: '8px 16px', borderRadius: 999, border: `1px solid ${on ? C.accent : C.border}`, background: on ? 'rgba(90,169,255,0.14)' : 'transparent', color: on ? C.text : C.dim, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {l}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 16 }}>

          {/* North Star — the mission statement leads BOTH the default Status
              view and the Architecture view (restored after the tab split). */}
          {(view === 'status' || view === 'architecture') && (<>
          {/* North Star — positioning / vision */}
          <Panel title="North Star — positioning" hint="coach marketplace + social" wide>
            <div style={{ background: C.panel2, border: `1px solid ${C.accent}`, borderLeft: `4px solid ${C.accent}`, borderRadius: 10, padding: '14px 16px', marginBottom: 18 }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.accent, marginBottom: 6 }}>North Star</div>
              <div style={{ fontSize: 16, color: C.text, lineHeight: 1.5, fontWeight: 600 }}>{snap.architecture.northStar.statement}</div>
              <div style={{ fontSize: 13, color: C.dim, lineHeight: 1.55, marginTop: 10 }}>{snap.architecture.northStar.positioning}</div>
            </div>

            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.accent, marginBottom: 10 }}>Fuses all three</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 10, marginBottom: 20 }}>
              {snap.architecture.northStar.combine.map((c) => (
                <div key={c.camp} style={{ background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 13px' }}>
                  <b style={{ fontSize: 13 }}>{c.camp}</b>
                  <div style={{ fontSize: 10.5, color: C.dim, marginTop: 3, fontStyle: 'italic' }}>today: {c.players}</div>
                  <div style={{ fontSize: 12, color: C.text, marginTop: 8, lineHeight: 1.5 }}>{c.shapeDoes}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginBottom: 18 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.warn, marginBottom: 8 }}>The wedge</div>
                <div style={{ fontSize: 12.5, color: C.dim, lineHeight: 1.55 }}>{snap.architecture.northStar.wedge}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.ok, marginBottom: 8 }}>Why it's defensible</div>
                {snap.architecture.northStar.moats.map((m) => (
                  <div key={m} style={{ display: 'flex', gap: 7, fontSize: 12, color: C.dim, lineHeight: 1.4, marginBottom: 4 }}>
                    <span style={{ color: C.ok, flexShrink: 0 }}>✓</span><span>{m}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.accent, marginBottom: 10 }}>Cold-start sequence</div>
            <div style={{ display: 'flex', alignItems: 'stretch', overflowX: 'auto', paddingBottom: 6 }}>
              {snap.architecture.northStar.sequence.map((s, i) => (
                <div key={s.phase} style={{ display: 'flex', alignItems: 'center' }}>
                  <div style={{ width: 190, flexShrink: 0, background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '11px 12px', minHeight: 88 }}>
                    <b style={{ fontSize: 12.5 }}>{s.phase}</b>
                    <div style={{ fontSize: 11.5, color: C.dim, marginTop: 5, lineHeight: 1.45 }}>{s.focus}</div>
                  </div>
                  {i < snap.architecture.northStar.sequence.length - 1 && <span style={{ color: C.dim, padding: '0 7px', fontSize: 17 }}>→</span>}
                </div>
              ))}
            </div>
          </Panel>

          </>)}

          {/* Up next — the P1 build queue across every layer */}
          {view === 'status' && (() => {
            const p1 = snap.architecture.layers.flatMap((l) => l.gaps.filter((g) => g.priority === 'P1').map((g) => ({ ...g, layer: l.layer })));
            if (p1.length === 0) return null;
            return (
              <Panel title="Up next — P1 build queue" hint={`${p1.length} priority items`} wide>
                {p1.map((g, i) => (
                  <div key={`${g.layer}-${g.task}`} style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '9px 0', borderTop: i > 0 ? `1px solid ${C.border}` : 0 }}>
                    <span style={{ fontFamily: 'monospace', color: C.bad, fontWeight: 800, fontSize: 12, flexShrink: 0 }}>{String(i + 1).padStart(2, '0')}</span>
                    <span style={{ flexShrink: 0, fontSize: 9.5, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: 96 }}>{g.layer}</span>
                    <span style={{ flex: 1, fontSize: 13, color: C.text, lineHeight: 1.4 }}>{g.task}</span>
                    <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: g.status === 'in-progress' ? C.accent : C.dim }}>
                      {g.status === 'in-progress' ? '● in progress' : '○ not started'}
                    </span>
                  </div>
                ))}
              </Panel>
            );
          })()}

          {view === 'architecture' && (<>
          {/* Architecture & flow — the "how Shape works" map */}
          <Panel title="Shape — architecture & flow" hint="how it works · who it serves" wide>
            <div style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.6, marginBottom: 18 }}>{snap.architecture.summary}</div>

            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.accent, marginBottom: 10 }}>Who it serves</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, marginBottom: 22 }}>
              {snap.architecture.personas.map((p) => (
                <div key={p.key} style={{ background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '11px 12px' }}>
                  <b style={{ fontSize: 13 }}>{p.label}</b>
                  <div style={{ fontSize: 12, color: C.dim, marginTop: 4, lineHeight: 1.45 }}>{p.tagline}</div>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.accent, marginBottom: 8 }}>The flow · member journey</div>
            <div style={{ marginBottom: 22 }}>
              {snap.architecture.flow.map((s) => (
                <div key={s.n} style={{ display: 'grid', gridTemplateColumns: '26px 132px 1fr', gap: 12, alignItems: 'baseline', padding: '9px 0', borderTop: s.n > 1 ? `1px solid ${C.border}` : 0 }}>
                  <span style={{ fontFamily: 'monospace', color: C.accent, fontWeight: 800, fontSize: 12 }}>{String(s.n).padStart(2, '0')}</span>
                  <div>
                    <b style={{ fontSize: 13 }}>{s.stage}</b>
                    <div style={{ fontSize: 10, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 3 }}>{s.persona}</div>
                  </div>
                  <span style={{ fontSize: 12.5, color: C.dim, lineHeight: 1.5 }}>{s.detail}</span>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.accent, marginBottom: 10 }}>The stack · layers</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 10, marginBottom: 22 }}>
              {snap.architecture.layers.map((l) => (
                <div key={l.layer} style={{ background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 13px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <b style={{ fontSize: 13 }}>{l.layer}</b>
                    <span style={{ fontSize: 9.5, color: C.accent, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{l.serves}</span>
                  </div>
                  <div style={{ fontSize: 12, color: C.dim, marginTop: 4 }}>{l.purpose}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 9 }}>
                    {l.pieces.map((pc) => <span key={pc} style={{ fontSize: 11, color: C.text, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 999, padding: '3px 8px' }}>{pc}</span>)}
                  </div>
                  {l.gaps && l.gaps.length > 0 && (
                    <div style={{ marginTop: 10, paddingTop: 9, borderTop: `1px solid ${C.border}` }}>
                      <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.warn, marginBottom: 6 }}>Still to do · build order</div>
                      {[...l.gaps].sort((a, b) => a.priority.localeCompare(b.priority)).map((g) => {
                        const pc = g.priority === 'P1' ? C.bad : g.priority === 'P2' ? C.warn : C.dim;
                        return (
                          <div key={g.task} style={{ display: 'flex', gap: 7, alignItems: 'baseline', fontSize: 11.5, color: C.dim, lineHeight: 1.4, marginBottom: 5 }}>
                            <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 800, color: pc, border: `1px solid ${pc}`, borderRadius: 4, padding: '1px 4px' }}>{g.priority}</span>
                            <span style={{ flex: 1 }}>{g.task}</span>
                            <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: g.status === 'in-progress' ? C.accent : C.dim }}>
                              {g.status === 'in-progress' ? '● in progress' : '○ not started'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.accent, marginBottom: 10 }}>Area × persona</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12.5, minWidth: 560 }}>
                <thead>
                  <tr>
                    {['Area', 'Member', 'Trainer', 'Nutritionist'].map((h) => (
                      <th key={h} style={{ textAlign: 'left', padding: '8px 10px', color: C.dim, borderBottom: `1px solid ${C.border}`, fontWeight: 700, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {snap.architecture.matrix.map((r) => (
                    <tr key={r.area}>
                      <td style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}`, color: C.text, fontWeight: 700, whiteSpace: 'nowrap', verticalAlign: 'top' }}>{r.area}</td>
                      <td style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}`, color: C.dim, verticalAlign: 'top', lineHeight: 1.4 }}>{r.member}</td>
                      <td style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}`, color: C.dim, verticalAlign: 'top', lineHeight: 1.4 }}>{r.trainer}</td>
                      <td style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}`, color: C.dim, verticalAlign: 'top', lineHeight: 1.4 }}>{r.nutritionist}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          {/* Flow diagram — boxes + arrows view of the same map */}
          <Panel title="Flow diagram" hint="boxes + arrows" wide>
            <ArchDiagram arch={snap.architecture} />
          </Panel>
          </>)}

          {view === 'status' && (<>
          {/* Config & secrets */}
          <Panel title="Config & secrets" hint="wired? (values never shown)" wide>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
              {snap.config.map((g) => (
                <div key={g.key} style={{ background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 13px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <b style={{ fontSize: 13.5 }}>{g.label}</b>
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: g.ready ? C.ok : g.required ? C.bad : C.warn }}>
                      {g.ready ? 'ready' : g.required ? 'incomplete' : 'optional'}
                    </span>
                  </div>
                  {g.items.map((it) => (
                    <div key={it.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12.5, padding: '2px 0' }}>
                      <span style={{ color: C.dim }}>{it.label}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {it.note ? <em style={{ fontSize: 10.5, color: it.note === 'live' ? C.ok : it.note === 'test' ? C.warn : C.dim, fontStyle: 'normal' }}>{it.note}</em> : null}
                        <span style={{ color: it.present ? C.ok : C.bad, fontWeight: 800 }}>{it.present ? '✓' : '✗'}</span>
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </Panel>
          </>)}

          {/* Go-live checklist — collapsible sections with per-section progress */}
          {view === 'checklist' && (
          <Panel title="Go-live checklist" hint={`${doneChecklist}/${totalChecklist} done`} wide>
            {checklistWithTicks.map((sec) => {
              const done = sec.items.filter((i) => i.done).length;
              const complete = done === sec.items.length;
              const isOpen = !!secOpen[sec.section];
              return (
                <div key={sec.section} style={{ border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 8, overflow: 'hidden' }}>
                  <button onClick={() => setSecOpen((o) => ({ ...o, [sec.section]: !o[sec.section] }))}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: C.panel2, border: 'none', color: C.text, padding: '11px 13px', cursor: 'pointer', fontSize: 13.5 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                      <span style={{ color: C.dim, transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s', display: 'inline-block', flexShrink: 0 }}>▶</span>
                      <b style={{ textAlign: 'left' }}>{sec.section}</b>
                    </span>
                    <span style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 800, color: complete ? C.ok : C.warn }}>
                      {complete ? '✓ ' : ''}{done}/{sec.items.length}
                    </span>
                  </button>
                  {isOpen && (
                    <div style={{ padding: '6px 14px 12px', borderTop: `1px solid ${C.border}` }}>
                      {sec.items.map((it) => {
                        const auto = it.status === 'done';
                        return (
                          <label key={it.label} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, padding: '5px 0', cursor: auto ? 'default' : 'pointer', opacity: it.done ? 0.6 : 1, lineHeight: 1.45 }}>
                            <input type="checkbox" checked={it.done} disabled={auto} onChange={() => toggleTick(it.label)} style={{ marginTop: 2, accentColor: C.ok }} />
                            <span style={{ textDecoration: it.done ? 'line-through' : 'none' }}>
                              {it.label}
                              {auto ? <em style={{ fontSize: 10, color: C.ok, fontStyle: 'normal', marginLeft: 6 }}>auto</em> : null}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </Panel>
          )}

          {view === 'status' && (<>
          {/* Live services */}
          <Panel title="Live services" hint="real ping + latency">
            {snap.services.map((s) => (
              <Row key={s.key}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>{dot(statusColor(s.status))}<b>{s.label}</b></span>
                <span style={{ textAlign: 'right', fontSize: 12.5, color: C.dim }}>
                  <span style={{ color: statusColor(s.status), fontWeight: 700, textTransform: 'uppercase', fontSize: 11 }}>{s.status}</span>
                  {s.latencyMs != null ? ` · ${s.latencyMs}ms` : ''}<br />
                  <span style={{ fontSize: 11.5 }}>{s.detail}</span>
                </span>
              </Row>
            ))}
          </Panel>

          {/* Next steps to go live — tabbed by section so it's short + scannable */}
          <Panel title="Next steps to go live" hint={`${nextSteps.length} open · ${nextBySection.length} areas`}>
            {nextSteps.length === 0 ? (
              <div style={{ color: C.ok, fontWeight: 700, padding: '8px 2px' }}>✓ Everything tracked here is done. Run the live smoke test and ship.</div>
            ) : (
              <>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 13 }}>
                  {nextBySection.map((g) => {
                    const on = g.section === activeStepSection;
                    return (
                      <button key={g.section} onClick={() => setStepTab(g.section)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 999, border: `1px solid ${on ? C.accent : C.border}`, background: on ? 'rgba(90,169,255,0.14)' : 'transparent', color: on ? C.text : C.dim, fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
                        {g.section}
                        <span style={{ fontSize: 10, fontWeight: 800, color: on ? C.accent : C.dim }}>{g.items.length}</span>
                      </button>
                    );
                  })}
                </div>
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.dim, marginBottom: 8 }}>{activeStepSection}</div>
                <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.55 }}>
                  {activeStepItems.map((label, i) => (
                    <li key={i} style={{ fontSize: 13.5, marginBottom: 6 }}>{label}</li>
                  ))}
                </ol>
              </>
            )}
          </Panel>

          </>)}

          {/* ── ALL API ROUTES (browsable + probeable) ── */}
          {view === 'api' && (
          <Panel title="All API routes" hint={`${snap.inventory.apiRoutes} endpoints`} wide>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by path or method…"
                style={{ flex: 1, minWidth: 180, background: C.panel2, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '8px 11px', fontSize: 13 }} />
              <button onClick={toggleAll} style={btn(C.border, C.text)}>{allExpanded ? 'Collapse all' : 'Expand all'}</button>
              <button onClick={probeAll} style={btn(C.ok, '#04101f')}>Probe all GET</button>
            </div>
            <div style={{ fontSize: 11.5, color: C.dim, marginBottom: 10 }}>
              Tap a group to expand. <b style={{ color: C.ok }}>GET</b> routes have a <b>Probe</b> button — it sends a real request from your browser (any response = the route is alive; 401/403 just means it needs the right session). Write routes (POST/PUT/DELETE), webhooks, and dynamic <code>[id]</code> paths aren’t auto-called to avoid side effects.
            </div>

            {filteredGroups.map((g) => {
              const isOpen = !!open[g.group];
              const probeable = g.routes.filter((r) => r.probeable).length;
              return (
                <div key={g.group} style={{ border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 8, overflow: 'hidden' }}>
                  <button onClick={() => setOpen((o) => ({ ...o, [g.group]: !o[g.group] }))}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: C.panel2, border: 'none', color: C.text, padding: '11px 13px', cursor: 'pointer', fontSize: 13.5 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <span style={{ color: C.dim, transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s', display: 'inline-block' }}>▶</span>
                      <b>{g.group}</b>
                    </span>
                    <span style={{ fontSize: 11.5, color: C.dim }}>{g.routes.length} routes · {probeable} GET</span>
                  </button>
                  {isOpen && (
                    <div style={{ padding: '4px 0' }}>
                      {g.routes.map((r) => {
                        const pr = probes[r.path];
                        return (
                          <div key={r.path} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 13px', borderTop: `1px solid ${C.border}`, flexWrap: 'wrap' }}>
                            <span style={{ display: 'flex', gap: 4 }}>
                              {r.methods.map((m) => (
                                <span key={m} style={{ fontSize: 10, fontWeight: 800, color: METHOD_COLOR[m] ?? C.dim, border: `1px solid ${METHOD_COLOR[m] ?? C.dim}`, borderRadius: 5, padding: '1px 5px' }}>{m}</span>
                              ))}
                            </span>
                            <code style={{ flex: 1, minWidth: 200, fontSize: 12.5 }}>{r.path}</code>
                            {r.probeable ? (
                              <>
                                <button onClick={() => probeRoute(r.path)} style={btn(C.border, C.text, true)}>
                                  {pr?.status === 'loading' ? '…' : 'Probe'}
                                </button>
                                {pr && pr.status !== 'loading' && (
                                  <span style={{ fontSize: 12, minWidth: 78, textAlign: 'right' }}>
                                    <b style={{ color: statusColor(pr.status) }}>{pr.code ?? 'ERR'}</b>
                                    <span style={{ color: C.dim }}>{pr.ms != null ? ` · ${pr.ms}ms` : ''}</span>
                                  </span>
                                )}
                              </>
                            ) : (
                              <span style={{ fontSize: 10.5, color: C.dim, border: `1px dashed ${C.border}`, borderRadius: 5, padding: '2px 6px' }}>{nonProbeReason(r)}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            {filteredGroups.length === 0 && <div style={{ color: C.dim, fontSize: 13, padding: '8px 2px' }}>No routes match “{filter}”.</div>}
          </Panel>
          )}

          {/* ── FUNNEL & DROP-OFF ── */}
          {view === 'funnel' && (
          <div style={{ gridColumn: '1 / -1' }}>
            <FunnelPanel funnel={snap.funnel} onCohort={handleCohort} />
          </div>
          )}

        </div>

        <footer style={{ marginTop: 28, fontSize: 11.5, color: C.dim, textAlign: 'center' }}>
          Auto-refreshes every 30s · admin-only · full setup detail in GO-LIVE-CHECKLIST.md & DEPLOY.md
        </footer>
      </div>
    </div>
  );
}

function FunnelPanel({ funnel, onCohort }: { funnel: WarRoomSnapshot['funnel']; onCohort: (d: number) => void }) {
  const max = Math.max(1, funnel.rows[0]?.count || 1);
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <strong style={{ color: C.text }}>Funnel &amp; drop-off · <span style={{ color: C.dim, fontWeight: 400 }}>{funnel.generatedFor}</span></strong>
        <select onChange={e => onCohort(Number(e.target.value))} defaultValue="0" title="Cohort window"
          style={{ background: C.panel2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 8px' }}>
          <option value="0">All time</option>
          <option value="90">Last 90 days</option>
          <option value="30">Last 30 days</option>
        </select>
      </div>
      {funnel.biggestDrop && (
        <div style={{ color: C.bad, fontSize: 13, marginBottom: 10 }}>
          Biggest drop: {funnel.rows.find(r => r.isBiggestDrop)?.label} — {funnel.rows.find(r => r.isBiggestDrop)?.pctDrop}%
        </div>
      )}
      {funnel.rows.map(r => (
        <div key={r.key} style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: r.isBiggestDrop ? C.bad : C.text }}>
            <span>{r.label}</span>
            <span>{r.count.toLocaleString()} · {r.pctOfSignup}%{r.pctDrop > 0 ? ` · −${r.pctDrop}%` : ''}</span>
          </div>
          <div style={{ height: 6, background: C.panel2, borderRadius: 3, marginTop: 3 }}>
            <div style={{ height: 6, width: `${Math.round((r.count / max) * 100)}%`, background: r.isBiggestDrop ? C.bad : C.ok, borderRadius: 3 }} />
          </div>
        </div>
      ))}
      {funnel.rows.length === 0 && (
        <div style={{ color: C.dim, fontSize: 13, padding: '8px 2px' }}>No funnel data — apply the analytics_events migration to start collecting.</div>
      )}
    </div>
  );
}

function btn(bg: string, fg: string, small = false): React.CSSProperties {
  return { background: bg, color: fg, border: 'none', borderRadius: 7, padding: small ? '4px 10px' : '8px 13px', fontWeight: 700, fontSize: small ? 11.5 : 12.5, cursor: 'pointer' };
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, color: C.dim, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color, margin: '2px 0' }}>{value}</div>
      <div style={{ fontSize: 11.5, color: C.dim }}>{sub}</div>
    </div>
  );
}

// Map a flow step's persona to a colour so the diagram reads at a glance.
function personaColor(p: string): string {
  const s = p.toLowerCase();
  if (s.includes('prospect')) return C.dim;
  if (s.includes('trainer') || s.includes('nutrition') || s.includes('coach')) return C.warn;
  if (s.includes('+') || s.includes('all')) return C.ok;
  if (s.includes('member')) return C.accent;
  return C.accent;
}

// One branch row of the tree: a connector column (vertical rail + elbow tick)
// next to its content. `last` shortens the rail so it stops at the elbow.
function TreeRow({ children, last }: { children: React.ReactNode; last: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'stretch' }}>
      <div style={{ position: 'relative', width: 22, flexShrink: 0 }}>
        <div style={{ position: 'absolute', left: 8, top: 0, width: 2, height: last ? 15 : '100%', background: C.border }} />
        <div style={{ position: 'absolute', left: 8, top: 14, width: 12, height: 2, background: C.border }} />
      </div>
      <div style={{ flex: 1, minWidth: 0, paddingBottom: 8 }}>{children}</div>
    </div>
  );
}

// Company-style hierarchy as a vertical tree (site-map): a root that branches
// down into sections, each branching into its pieces. The member journey ribbon
// sits below as the sequential view.
function ArchDiagram({ arch }: { arch: WarRoomSnapshot['architecture'] }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.accent, marginBottom: 4 }}>How it's built · hierarchy</div>
      <div style={{ fontSize: 11, color: C.dim, marginBottom: 14 }}>Shape → its sections → the pieces inside each</div>

      {/* Root */}
      <div style={{ display: 'inline-block', background: C.accent, color: '#04121f', borderRadius: 10, padding: '9px 18px' }}>
        <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '0.02em' }}>SHAPE</div>
        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.82 }}>Coach marketplace + social</div>
      </div>

      {/* Sections (branch under root), each with its pieces nested below */}
      <div style={{ paddingLeft: 6, marginTop: 2 }}>
        {arch.layers.map((l, i) => {
          const p1 = l.gaps.filter((g) => g.priority === 'P1').length;
          return (
            <TreeRow key={l.layer} last={i === arch.layers.length - 1}>
              <div style={{ background: C.panel2, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.accent}`, borderRadius: 9, padding: '8px 11px', marginTop: 4, display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                <b style={{ fontSize: 13 }}>{l.layer}</b>
                <span style={{ fontSize: 9, color: C.accent, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{l.serves}</span>
                {l.gaps.length > 0 && (
                  <span title={l.gaps.map((g) => `${g.priority} ${g.task}`).join(' · ')} style={{ fontSize: 9, fontWeight: 800, color: C.warn, background: 'rgba(247,201,72,0.12)', border: `1px solid ${C.warn}`, borderRadius: 999, padding: '1px 7px' }}>{l.gaps.length} to do{p1 ? ` · ${p1}×P1` : ''}</span>
                )}
              </div>
              {/* pieces — nested branch */}
              <div style={{ paddingLeft: 14, marginTop: 4 }}>
                {l.pieces.map((pc, j) => (
                  <TreeRow key={pc} last={j === l.pieces.length - 1}>
                    <span style={{ display: 'inline-block', marginTop: 7, fontSize: 10.5, color: C.dim, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 7, padding: '3px 8px', lineHeight: 1.25 }}>{pc}</span>
                  </TreeRow>
                ))}
              </div>
            </TreeRow>
          );
        })}
      </div>

      {/* Member journey — the sequential flow through the hierarchy */}
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.accent, margin: '22px 0 4px' }}>Member journey</div>
      <div style={{ fontSize: 11, color: C.dim, marginBottom: 12 }}>colour = who it serves · scroll →</div>
      <div style={{ display: 'flex', alignItems: 'center', overflowX: 'auto', paddingBottom: 12 }}>
        {arch.flow.map((s, i) => {
          const col = personaColor(s.persona);
          return (
            <div key={s.n} style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ width: 152, minHeight: 78, flexShrink: 0, background: C.panel2, border: `1px solid ${C.border}`, borderLeft: `4px solid ${col}`, borderRadius: 10, padding: '9px 11px' }}>
                <div style={{ fontFamily: 'monospace', fontSize: 10, color: col, fontWeight: 800 }}>{String(s.n).padStart(2, '0')}</div>
                <b style={{ fontSize: 12.5, display: 'block', marginTop: 3, lineHeight: 1.2 }}>{s.stage}</b>
                <div style={{ fontSize: 9, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>{s.persona}</div>
              </div>
              {i < arch.flow.length - 1 && <span style={{ color: C.dim, padding: '0 7px', fontSize: 17 }}>→</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Panel({ title, hint, children, wide }: { title: string; hint?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 18px', gridColumn: wide ? '1 / -1' : 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{title}</h2>
        {hint ? <span style={{ fontSize: 11, color: C.dim }}>{hint}</span> : null}
      </div>
      {children}
    </section>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderTop: `1px solid ${C.border}` }}>
      {children}
    </div>
  );
}
