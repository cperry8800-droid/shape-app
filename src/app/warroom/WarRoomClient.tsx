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

  const refreshSnapshot = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/warroom', { cache: 'no-store' });
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
          <button onClick={refreshSnapshot} disabled={refreshing}
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

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 16 }}>

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
                      <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.warn, marginBottom: 5 }}>Still to do</div>
                      {l.gaps.map((g) => (
                        <div key={g} style={{ display: 'flex', gap: 6, fontSize: 11.5, color: C.dim, lineHeight: 1.4, marginBottom: 3 }}>
                          <span style={{ color: C.warn, flexShrink: 0 }}>▸</span><span>{g}</span>
                        </div>
                      ))}
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

          {/* Go-live checklist */}
          <Panel title="Go-live checklist" hint={`${doneChecklist}/${totalChecklist}`} wide>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
              {checklistWithTicks.map((sec) => (
                <div key={sec.section}>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.5, color: C.accent, marginBottom: 6 }}>{sec.section}</div>
                  {sec.items.map((it) => {
                    const auto = it.status === 'done';
                    return (
                      <label key={it.label} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, padding: '4px 0', cursor: auto ? 'default' : 'pointer', opacity: it.done ? 0.65 : 1 }}>
                        <input type="checkbox" checked={it.done} disabled={auto} onChange={() => toggleTick(it.label)} style={{ marginTop: 2, accentColor: C.ok }} />
                        <span style={{ textDecoration: it.done ? 'line-through' : 'none' }}>
                          {it.label}
                          {auto ? <em style={{ fontSize: 10, color: C.ok, fontStyle: 'normal', marginLeft: 6 }}>auto</em> : null}
                        </span>
                      </label>
                    );
                  })}
                </div>
              ))}
            </div>
          </Panel>

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

          {/* Next steps to go live */}
          <Panel title="Next steps to go live" hint={`${nextSteps.length} open`}>
            {nextSteps.length === 0 ? (
              <div style={{ color: C.ok, fontWeight: 700, padding: '8px 2px' }}>✓ Everything tracked here is done. Run the live smoke test and ship.</div>
            ) : (
              <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
                {nextSteps.map((s, i) => (
                  <li key={i} style={{ fontSize: 13.5 }}>
                    <span style={{ color: C.dim, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>{s.section}</span><br />{s.label}
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          {/* ── ALL API ROUTES (browsable + probeable) ── */}
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

        </div>

        <footer style={{ marginTop: 28, fontSize: 11.5, color: C.dim, textAlign: 'center' }}>
          Auto-refreshes every 30s · admin-only · full setup detail in GO-LIVE-CHECKLIST.md & DEPLOY.md
        </footer>
      </div>
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

// Boxes + arrows view: a horizontal journey ribbon + the layer stack (top→bottom).
function ArchDiagram({ arch }: { arch: WarRoomSnapshot['architecture'] }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.accent, marginBottom: 4 }}>Member journey</div>
      <div style={{ fontSize: 11, color: C.dim, marginBottom: 12 }}>colour = who it serves · scroll →</div>
      <div style={{ display: 'flex', alignItems: 'center', overflowX: 'auto', paddingBottom: 12, marginBottom: 24 }}>
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

      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.accent, marginBottom: 4 }}>The stack</div>
      <div style={{ fontSize: 11, color: C.dim, marginBottom: 12 }}>surfaces people touch ↓ down to the data that powers it</div>
      <div>
        {arch.layers.map((l, i) => (
          <div key={l.layer}>
            <div style={{ background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '11px 13px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
              <b style={{ fontSize: 13, minWidth: 132 }}>{l.layer}</b>
              <span style={{ fontSize: 9, color: C.accent, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{l.serves}</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, flex: 1 }}>
                {l.pieces.map((pc) => <span key={pc} style={{ fontSize: 10.5, color: C.dim, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 999, padding: '2px 7px' }}>{pc}</span>)}
              </div>
              {l.gaps && l.gaps.length > 0 && (
                <span title={l.gaps.join(' · ')} style={{ fontSize: 9.5, fontWeight: 800, color: C.warn, background: 'rgba(247,201,72,0.12)', border: `1px solid ${C.warn}`, borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap' }}>{l.gaps.length} to do</span>
              )}
            </div>
            {i < arch.layers.length - 1 && <div style={{ textAlign: 'center', color: C.dim, fontSize: 15, lineHeight: '20px' }}>↓</div>}
          </div>
        ))}
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
