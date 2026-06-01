'use client';

// War Room dashboard UI. Self-contained dark control-panel styling (inline so
// it doesn't depend on global classes). Three live layers:
//   • polls /api/warroom every 30s for fresh config + Supabase/Stripe pings
//   • pings safe read-only GET endpoints straight from the browser for liveness
//   • lets you tick the manual go-live items (persisted in localStorage) and
//     rolls everything still-open into a "Next steps to go live" list.

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { WarRoomSnapshot, ServiceStatus } from '@/lib/warroom';

// Read-only GET endpoints that are safe to probe from the browser. We only care
// that the route *responds* — 401/403/405 still means "alive", only a network
// failure or 5xx is "down".
const PING_ENDPOINTS = [
  { path: '/api/health', label: 'Health / env' },
  { path: '/api/marketplace-stats', label: 'Marketplace stats' },
  { path: '/api/leaderboard', label: 'Leaderboard' },
  { path: '/api/community/feed', label: 'Community feed' },
  { path: '/api/radio', label: 'Radio' },
  { path: '/api/me', label: 'Me / session' },
  { path: '/api/notifications', label: 'Notifications' },
  { path: '/api/integrations/status', label: 'Integrations' },
];

const TICKS_KEY = 'shape.warroom.ticks';

type EndpointState = { path: string; label: string; status: 'ok' | 'alive' | 'down' | 'pending'; code: number | null; ms: number | null };

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

function dot(color: string, size = 9) {
  return <span style={{ display: 'inline-block', width: size, height: size, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}` }} />;
}

function statusColor(s: ServiceStatus | EndpointState['status']): string {
  if (s === 'ok') return C.ok;
  if (s === 'degraded' || s === 'alive') return C.warn;
  if (s === 'down') return C.bad;
  if (s === 'missing') return C.dim;
  return C.dim;
}

export default function WarRoomClient({ initial }: { initial: WarRoomSnapshot }) {
  const [snap, setSnap] = useState<WarRoomSnapshot>(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [endpoints, setEndpoints] = useState<EndpointState[]>(
    PING_ENDPOINTS.map((e) => ({ ...e, status: 'pending', code: null, ms: null })),
  );
  const [ticks, setTicks] = useState<Record<string, boolean>>({});

  // Load manual ticks once.
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

  const pingEndpoints = useCallback(async () => {
    const results = await Promise.all(
      PING_ENDPOINTS.map(async (e) => {
        const started = performance.now();
        try {
          const res = await fetch(e.path, { cache: 'no-store' });
          const ms = Math.round(performance.now() - started);
          const status: EndpointState['status'] = res.ok ? 'ok' : res.status >= 500 ? 'down' : 'alive';
          return { ...e, status, code: res.status, ms };
        } catch {
          return { ...e, status: 'down' as const, code: null, ms: Math.round(performance.now() - started) };
        }
      }),
    );
    setEndpoints(results);
  }, []);

  // Initial browser pings + 30s auto-refresh of everything.
  useEffect(() => {
    pingEndpoints();
    const id = setInterval(() => { refreshSnapshot(); pingEndpoints(); }, 30000);
    return () => clearInterval(id);
  }, [pingEndpoints, refreshSnapshot]);

  // Effective checklist status (auto 'done' OR manually ticked).
  const checklistWithTicks = useMemo(
    () => snap.checklist.map((sec) => ({
      ...sec,
      items: sec.items.map((it) => ({ ...it, done: it.status === 'done' || !!ticks[it.label] })),
    })),
    [snap.checklist, ticks],
  );

  // Everything still open → ordered "next steps".
  const nextSteps = useMemo(() => {
    const out: { section: string; label: string }[] = [];
    for (const sec of checklistWithTicks) {
      for (const it of sec.items) {
        if (!it.done) out.push({ section: sec.section, label: it.label });
      }
    }
    return out;
  }, [checklistWithTicks]);

  const totalChecklist = checklistWithTicks.reduce((n, s) => n + s.items.length, 0);
  const doneChecklist = totalChecklist - nextSteps.length;

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif', padding: '24px 20px 64px' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>

        {/* Header */}
        <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16, marginBottom: 22 }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 12, letterSpacing: 3, color: C.dim, textTransform: 'uppercase' }}>Shape · Operations</div>
            <h1 style={{ fontSize: 30, fontWeight: 800, margin: '2px 0 0' }}>War Room</h1>
          </div>
          <div style={{ textAlign: 'right', fontSize: 12, color: C.dim }}>
            <div>env <b style={{ color: C.text }}>{snap.runtime.vercelEnv ?? snap.runtime.nodeEnv ?? 'local'}</b> · node {snap.runtime.nodeVersion}{snap.runtime.region ? ` · ${snap.runtime.region}` : ''}</div>
            <div>updated {new Date(snap.generatedAt).toLocaleTimeString()}</div>
          </div>
          <button onClick={() => { refreshSnapshot(); pingEndpoints(); }} disabled={refreshing}
            style={{ background: C.accent, color: '#04101f', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 700, cursor: 'pointer', opacity: refreshing ? 0.6 : 1 }}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </header>

        {/* Top stat strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 22 }}>
          <Stat label="Config readiness" value={`${snap.readiness.score}/${snap.readiness.total}`} sub={snap.readiness.label}
            color={snap.readiness.score === snap.readiness.total ? C.ok : snap.readiness.score === 0 ? C.bad : C.warn} />
          <Stat label="Go-live steps" value={`${doneChecklist}/${totalChecklist}`} sub={nextSteps.length === 0 ? 'all clear' : `${nextSteps.length} open`}
            color={nextSteps.length === 0 ? C.ok : C.warn} />
          <Stat label="API routes" value={String(snap.inventory.apiRoutes)} sub="handlers" color={C.accent} />
          <Stat label="Migrations" value={String(snap.inventory.migrations)} sub="SQL files" color={C.accent} />
          <Stat label="Mobile build" value={snap.inventory.mobileBuild ? 'Present' : 'Missing'} sub={`${snap.inventory.mobileAssets} assets`}
            color={snap.inventory.mobileBuild ? C.ok : C.bad} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 16 }}>

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

          {/* Endpoint liveness */}
          <Panel title="API endpoints" hint="browser GET probe">
            {endpoints.map((e) => (
              <Row key={e.path}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  {dot(statusColor(e.status === 'pending' ? 'unknown' : e.status))}
                  <span><b>{e.label}</b><br /><code style={{ fontSize: 11, color: C.dim }}>{e.path}</code></span>
                </span>
                <span style={{ textAlign: 'right', fontSize: 12, color: C.dim }}>
                  {e.code != null ? <span style={{ color: statusColor(e.status), fontWeight: 700 }}>{e.code}</span> : (e.status === 'pending' ? '…' : '—')}
                  {e.ms != null ? <><br /><span style={{ fontSize: 11 }}>{e.ms}ms</span></> : null}
                </span>
              </Row>
            ))}
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

          {/* Next steps to go live */}
          <Panel title="Next steps to go live" hint={`${nextSteps.length} open`} wide>
            {nextSteps.length === 0 ? (
              <div style={{ color: C.ok, fontWeight: 700, padding: '8px 2px' }}>✓ Everything tracked here is done. Run the live smoke test and ship.</div>
            ) : (
              <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
                {nextSteps.map((s, i) => (
                  <li key={i} style={{ fontSize: 13.5 }}>
                    <span style={{ color: C.dim, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>{s.section}</span><br />
                    {s.label}
                  </li>
                ))}
              </ol>
            )}
            <div style={{ marginTop: 10, fontSize: 11.5, color: C.dim }}>
              Auto-derived items flip to done when their config lands. Tick manual items below — saved in this browser.
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
        </div>

        <footer style={{ marginTop: 28, fontSize: 11.5, color: C.dim, textAlign: 'center' }}>
          Auto-refreshes every 30s · admin-only · full setup detail in GO-LIVE-CHECKLIST.md & DEPLOY.md
        </footer>
      </div>
    </div>
  );
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
