'use client';

// Mission Control UI — the N.O.R.A. look (the owner's renamed ops dashboard:
// near-navy ground, cyan glow HUD, left-bar section labels, status pills).
// Self-contained palette on purpose — this is admin ops chrome, the exact
// precedent WarRoomClient set with its own C object; member theme tokens
// deliberately don't apply here.
//
// Honesty rules (binding, from the spec): a gate with no record reads '—',
// never ✓/✗; loading is a skeleton, never placeholder numbers; the alarm
// strip only claims segments it actually knows.

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { WarRoomSnapshot } from '@/lib/warroom';
import { triageChecklist } from '@/lib/console-triage.mjs';
import type { ConsoleWho, TriagedItem } from '@/lib/console-triage';

// ── N.O.R.A. palette (verbatim from the owner's dashboard config.theme) ─────
const N = {
  bg: '#0a0a1a',
  panel: '#0d1117',
  panel2: '#0a0e18',
  border: 'rgba(0, 212, 255, 0.12)',
  hover: '#12182a',
  accent: '#00d4ff',
  accentDim: 'rgba(0, 212, 255, 0.3)',
  accentFaint: 'rgba(0, 212, 255, 0.08)',
  purple: '#7c6bff',
  green: '#44c98f',
  red: '#e74c3c',
  orange: '#ff6b35',
  gold: '#f6d365',
  text: '#e0e6ed',
  dim: '#6b7b8d',
  dimmer: '#3a4553',
};
const MONO = 'ui-monospace, "Cascadia Code", Consolas, "JetBrains Mono", monospace';

import type { Flight, FlightPr, Gate } from './flight-types';

// Deterministic UTC date words — identical on server and client, so the
// masthead can server-render without a hydration mismatch.
const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
function utcDateline(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${DAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}
function hhmm(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}
function ageOf(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const h = Math.max(0, Math.floor((Date.now() - t) / 3_600_000));
  return h >= 48 ? `${Math.floor(h / 24)}d` : `${h}h`;
}

const WHO_META: Record<ConsoleWho, { label: string; color: string; fill: boolean }> = {
  you: { label: 'YOU', color: N.accent, fill: true },
  ext: { label: 'EXT', color: N.orange, fill: false },
  eng: { label: 'ENG', color: N.purple, fill: false },
};

function WhoChip({ who }: { who: ConsoleWho }) {
  const m = WHO_META[who];
  return (
    <span
      style={{
        fontFamily: MONO,
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: '0.14em',
        padding: '2px 8px',
        color: m.fill ? N.bg : m.color,
        background: m.fill ? m.color : 'transparent',
        border: `1px solid ${m.color}`,
        borderRadius: 3,
        whiteSpace: 'nowrap',
      }}
    >
      {m.label}
    </span>
  );
}

const GATE_GLYPH: Record<Gate, { glyph: string; color: string }> = {
  green: { glyph: '✓', color: N.green },
  red: { glyph: '✗', color: N.red },
  running: { glyph: '…', color: N.gold },
  blocked: { glyph: '⚠', color: N.gold },
  none: { glyph: '—', color: N.dimmer },
};

function GateChip({ label, gate }: { label: string; gate: Gate }) {
  const g = GATE_GLYPH[gate];
  return (
    <span style={{ fontFamily: MONO, fontSize: 10.5, color: N.dim, marginRight: 12, whiteSpace: 'nowrap' }}>
      {label} <b style={{ color: g.color, fontWeight: 700 }}>{g.glyph}</b>
    </span>
  );
}

function SectionLabel({ title, pill, pillColor = N.accent }: { title: string; pill?: string; pillColor?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <span style={{ width: 3, height: 16, background: N.accent, boxShadow: `0 0 8px ${N.accentDim}` }} />
      <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.3em', color: N.text }}>
        {title}
      </span>
      {pill ? (
        <span
          style={{
            fontFamily: MONO,
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: '0.12em',
            color: pillColor,
            border: `1px solid ${pillColor}`,
            borderRadius: 999,
            padding: '2px 10px',
          }}
        >
          {pill}
        </span>
      ) : null}
    </div>
  );
}

// Isolated so the 1s tick re-renders ONLY this span — never the 72-row board.
function Clock() {
  const [clock, setClock] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const p = (n: number) => String(n).padStart(2, '0');
      setClock(`${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return <span style={{ color: N.accent, fontVariantNumeric: 'tabular-nums' }}>{clock ?? '––:––:––'}</span>;
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: 'relative', background: N.panel, border: `1px solid ${N.border}`, borderRadius: 8, padding: '16px 18px' }}>
      <div
        aria-hidden
        style={{
          position: 'absolute',
          insetInline: 0,
          top: 0,
          height: 1,
          background: `linear-gradient(90deg, transparent, ${N.accentDim}, transparent)`,
        }}
      />
      {children}
    </div>
  );
}

export default function ConsoleClient({ initial }: { initial: WarRoomSnapshot }) {
  const [snap, setSnap] = useState<WarRoomSnapshot>(initial);
  const [flight, setFlight] = useState<Flight | null | undefined>(undefined); // undefined = loading
  const [who, setWho] = useState<ConsoleWho | 'all'>('all');
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const triage = useMemo(() => triageChecklist(snap.checklist), [snap]);
  const rows = useMemo(
    () => (who === 'all' ? triage.open : triage.open.filter((o: TriagedItem) => o.who === who)),
    [triage, who]
  );
  // The bar pairs with the open count, so it must measure the SAME thing:
  // checklist items closed. snap.readiness is required-CONFIG-group readiness
  // (a different denominator entirely) and gets its own labelled readout.
  const pct = triage.counts.total ? Math.round((triage.counts.done / triage.counts.total) * 100) : 0;
  const cfgPct = snap.readiness.total ? Math.round((snap.readiness.score / snap.readiness.total) * 100) : 0;

  const fetchFlight = useCallback(async () => {
    try {
      const res = await fetch('/api/console/flight', { cache: 'no-store' });
      setFlight(res.ok ? ((await res.json()) as Flight) : null);
    } catch {
      setFlight(null); // null = unreachable (distinct from the API's honest not-ok payloads)
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    try {
      const [wr] = await Promise.all([
        fetch('/api/warroom', { cache: 'no-store' }).then((r) => (r.ok ? (r.json() as Promise<WarRoomSnapshot>) : null)),
        fetchFlight(),
      ]);
      if (wr) setSnap(wr);
    } finally {
      setRefreshing(false);
    }
  }, [fetchFlight]);

  useEffect(() => {
    fetchFlight();
    const poll = setInterval(refreshAll, 60_000);
    return () => clearInterval(poll);
  }, [fetchFlight, refreshAll]);

  // ── Alarms: claim only what's known ───────────────────────────────────────
  const alarms: Array<{ sev: 'red' | 'warn'; text: string }> = [];
  if (flight?.ok && flight.ciMain === 'red') alarms.push({ sev: 'red', text: 'CI RED ON MAIN — required checks failing' });
  for (const s of snap.services) {
    if (s.status === 'down') alarms.push({ sev: 'red', text: `${s.label.toUpperCase()} — DOWN${s.detail ? ` · ${s.detail}` : ''}` });
    else if (s.status === 'degraded' || s.status === 'missing')
      alarms.push({ sev: 'warn', text: `${s.label.toUpperCase()} — ${s.status.toUpperCase()}${s.detail ? ` · ${s.detail}` : ''}` });
  }
  for (const g of snap.config) {
    if (g.required && !g.ready) alarms.push({ sev: 'warn', text: `CONFIG — ${g.label.toUpperCase()} NOT READY` });
  }
  const servicesOk = snap.services.filter((s) => s.status === 'ok').length;
  // The CI segment is only KNOWN when the feed answered and returned a real
  // verdict. Unknown must never be folded into a global green claim (round-3
  // P2) — an unread gate is not a passed gate, the same rule the PR chips obey.
  const ciKnown = !!flight?.ok && flight.ciMain !== 'none';
  const ciSeg = ciKnown
    ? `CI MAIN ${GATE_GLYPH[flight!.ciMain].glyph}`
    : flight === undefined
      ? 'CI MAIN — CHECKING …'
      : 'CI MAIN — UNKNOWN (NO FLIGHT FEED)';

  const gateTag = (p: FlightPr) => {
    if (p.allGreen)
      return { text: 'AWAITING YOUR WORD', color: N.bg, bg: N.accent, border: N.accent };
    // ⚠ THE HEADLINE MUST KEY ON WHOEVER GATES, or it contradicts the thing it is a
    // headline for. CodeRabbit gates now (owner, 2026-08-20), so it decides this tag and
    // Codex no longer appears here at all — a Codex verdict on a reviewer the house has
    // stopped running would be a stale claim rendered as a status.
    if (p.ci === 'red' || p.coderabbit === 'changes')
      return { text: 'BLOCKED', color: N.red, bg: 'transparent', border: N.red };
    if (p.draft) return { text: 'DRAFT', color: N.dim, bg: 'transparent', border: N.dimmer };
    // Not "IN REVIEW" in either of the next two: the review has FINISHED in both, and
    // each needs a different action. Saying "in review" is how a finished-but-unusable
    // verdict gets waited on instead of acted on.
    if (p.coderabbit === 'limited')
      return { text: 'CR LIMIT REACHED', color: N.gold, bg: 'transparent', border: N.gold };
    // 'commented' means CodeRabbit has spoken on this PR but not passed THIS head — the
    // sweep predates the current push, so the head is unreviewed and needs another run.
    if (p.coderabbit === 'commented' || p.coderabbit === 'none')
      return { text: 'CR RE-TRIGGER', color: N.gold, bg: 'transparent', border: N.gold };
    return { text: 'IN REVIEW', color: N.gold, bg: 'transparent', border: N.gold };
  };

  return (
    <div style={{ minHeight: '100vh', background: N.bg, color: N.text, fontFamily: '"Segoe UI", system-ui, sans-serif' }}>
      <style>{`
        .mc-wrap { max-width: 1180px; margin: 0 auto; padding: 26px 22px 80px; }
        .mc-cols { display: grid; grid-template-columns: 1.55fr 1fr; gap: 18px; align-items: start; }
        .mc-duo { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
        @media (max-width: 980px) { .mc-cols, .mc-duo { grid-template-columns: 1fr; } }
        .mc-row { display: grid; grid-template-columns: 58px 1fr auto; gap: 12px; align-items: center;
                  width: 100%; text-align: left; background: none; border: 0; border-bottom: 1px solid ${N.border};
                  padding: 10px 4px; color: ${N.text}; font: inherit; cursor: pointer; border-radius: 4px; }
        .mc-row:hover { background: ${N.hover}; }
        .mc-btn { background: none; border: 1px solid ${N.dimmer}; border-radius: 999px; color: ${N.dim};
                  font-family: ${MONO}; font-size: 10.5px; font-weight: 700; letter-spacing: 0.12em;
                  padding: 7px 14px; cursor: pointer; }
        .mc-btn:hover { border-color: ${N.accent}; color: ${N.accent}; }
        button:focus-visible, a:focus-visible { outline: 2px solid ${N.accent}; outline-offset: 2px; }
        @keyframes mcPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
        .mc-live { animation: mcPulse 2.4s ease-in-out infinite; }
        @keyframes mcShimmer { 0% { background-position: -200px 0; } 100% { background-position: 200px 0; } }
        .mc-skel { height: 36px; border-radius: 4px; margin-bottom: 10px;
                   background: linear-gradient(90deg, ${N.panel2} 25%, ${N.hover} 50%, ${N.panel2} 75%);
                   background-size: 400px 100%; animation: mcShimmer 1.4s linear infinite; }
        @media (prefers-reduced-motion: reduce) { .mc-live, .mc-skel { animation: none; } }
      `}</style>

      <div className="mc-wrap">
        {/* ── Top bar ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.3em', color: N.dim }}>SHAPE · OPERATIONS</span>
          <span style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="mc-btn" onClick={refreshAll} disabled={refreshing}>
              {refreshing ? 'REFRESHING …' : 'REFRESH'}
            </button>
            <a className="mc-btn" style={{ textDecoration: 'none', display: 'inline-block' }} href="/warroom">
              WAR ROOM →
            </a>
          </span>
        </div>

        {/* ── Masthead ── */}
        <div style={{ textAlign: 'center', padding: '18px 0 26px' }}>
          <div style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.3em', color: N.green }}>
            <span className="mc-live" style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: N.green, boxShadow: `0 0 8px ${N.green}`, marginRight: 8, verticalAlign: 1 }} />
            SYSTEM ONLINE
          </div>
          <h1
            style={{
              margin: '14px 0 10px',
              fontFamily: MONO,
              fontWeight: 700,
              fontSize: 'clamp(30px, 6vw, 46px)',
              letterSpacing: '0.42em',
              paddingLeft: '0.42em',
              color: N.accent,
              textShadow: `0 0 18px rgba(0,212,255,0.55), 0 0 46px rgba(0,212,255,0.22)`,
            }}
          >
            N.O.R.A.
          </h1>
          <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.26em', color: N.dim }}>
            SHAPE MISSION CONTROL — NETWORK OPERATIONS &amp; READINESS ASSISTANT
          </div>
          <div style={{ marginTop: 14, fontFamily: MONO, fontSize: 13, color: N.dim }}>
            {utcDateline(snap.generatedAt)}
            <span style={{ margin: '0 12px', color: N.dimmer }}>|</span>
            <Clock />
          </div>
        </div>

        {/* ── Alarm strip ── */}
        {alarms.length === 0 ? (
          <div
            style={{
              border: `1px solid ${ciKnown ? 'rgba(68,201,143,0.35)' : 'rgba(107,123,141,0.4)'}`,
              background: ciKnown ? 'rgba(68,201,143,0.06)' : 'rgba(107,123,141,0.05)',
              borderRadius: 8,
              padding: '10px 16px',
              fontFamily: MONO,
              fontSize: 11.5,
              color: ciKnown ? N.green : N.dim,
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            {/* Green ✓ only when every segment is actually known. */}
            <b>{ciKnown ? '✓ ALL SYSTEMS NOMINAL' : '◦ NO ALARMS — STATUS PARTIAL'}</b>
            <span style={{ color: N.dim }}>
              — SERVICES {servicesOk}/{snap.services.length} · CONFIG READY · {ciSeg}
            </span>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }} role="alert">
            {alarms.map((a, i) => (
              <div
                key={i}
                style={{
                  border: `1px solid ${a.sev === 'red' ? 'rgba(231,76,60,0.55)' : 'rgba(246,211,101,0.4)'}`,
                  background: a.sev === 'red' ? 'rgba(231,76,60,0.08)' : 'rgba(246,211,101,0.05)',
                  borderRadius: 8,
                  padding: '10px 16px',
                  fontFamily: MONO,
                  fontSize: 11.5,
                  color: a.sev === 'red' ? N.red : N.gold,
                }}
              >
                ⚠ {a.text}
              </div>
            ))}
          </div>
        )}

        {/* ── Main columns ── */}
        <div className="mc-cols" style={{ marginTop: 20 }}>
          {/* THE COUNTDOWN */}
          <Panel>
            <SectionLabel title="THE COUNTDOWN" pill={`${triage.counts.open} OPEN`} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 14, marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 42,
                    fontWeight: 700,
                    color: N.accent,
                    textShadow: `0 0 22px rgba(0,212,255,0.45)`,
                    fontVariantNumeric: 'tabular-nums',
                    lineHeight: 1,
                  }}
                >
                  {triage.counts.open}
                </span>
                <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.24em', color: N.dim }}>
                  OPEN BEFORE LAUNCH
                </span>
              </div>
              <div style={{ minWidth: 220 }}>
                <div style={{ height: 3, background: N.dimmer, borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: N.accent, boxShadow: `0 0 10px ${N.accentDim}` }} />
                </div>
                <div style={{ marginTop: 6, fontFamily: MONO, fontSize: 10.5, color: N.dim, fontVariantNumeric: 'tabular-nums' }}>
                  CHECKLIST {triage.counts.done} / {triage.counts.total} CLOSED · {pct}%
                </div>
                <div style={{ marginTop: 3, fontFamily: MONO, fontSize: 9.5, color: N.dimmer, fontVariantNumeric: 'tabular-nums' }}>
                  CONFIG {snap.readiness.score} / {snap.readiness.total} GROUPS · {snap.readiness.label.toUpperCase()}
                  {cfgPct === 100 ? '' : ` · ${cfgPct}%`}
                </div>
              </div>
            </div>

            {/* who filter */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }} role="group" aria-label="Filter by who it waits on">
              {(
                [
                  ['all', `ALL ${triage.counts.open}`, N.accent],
                  ['you', `YOU ${triage.counts.you}`, N.accent],
                  ['ext', `EXT ${triage.counts.ext}`, N.orange],
                  ['eng', `ENG ${triage.counts.eng}`, N.purple],
                ] as Array<[ConsoleWho | 'all', string, string]>
              ).map(([key, label, color]) => {
                const active = who === key;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setWho(key)}
                    style={{
                      fontFamily: MONO,
                      fontSize: 10.5,
                      fontWeight: 700,
                      letterSpacing: '0.12em',
                      padding: '8px 14px',
                      borderRadius: 999,
                      cursor: 'pointer',
                      color: active ? N.bg : color,
                      background: active ? color : 'transparent',
                      border: `1px solid ${active ? color : N.dimmer}`,
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* rows */}
            <div>
              {rows.map((o: TriagedItem, i: number) => {
                const key = `${o.section}::${i}::${o.label.slice(0, 60)}`;
                const open = openKey === key;
                return (
                  <div key={key}>
                    <button type="button" className="mc-row" aria-expanded={open} onClick={() => setOpenKey(open ? null : key)}>
                      <span>
                        <WhoChip who={o.who} />
                      </span>
                      <span style={{ fontSize: 13.5, lineHeight: 1.45, color: N.text }}>{o.short}</span>
                      <span
                        title={o.section}
                        style={{
                          fontFamily: MONO,
                          fontSize: 9,
                          letterSpacing: '0.08em',
                          color: N.dimmer,
                          textTransform: 'uppercase',
                          maxWidth: 150,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {o.section}
                      </span>
                    </button>
                    {open ? (
                      <div
                        style={{
                          margin: '2px 0 12px',
                          padding: '12px 16px',
                          background: N.panel2,
                          borderLeft: `2px solid ${N.accentDim}`,
                          borderRadius: 4,
                          fontSize: 13,
                          lineHeight: 1.75,
                          color: N.text,
                          whiteSpace: 'pre-wrap',
                          overflowWrap: 'anywhere',
                        }}
                      >
                        {o.label}
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {rows.length === 0 ? (
                <div style={{ padding: '18px 4px', fontFamily: MONO, fontSize: 11.5, color: N.dim }}>
                  Nothing open in this lane.
                </div>
              ) : null}
            </div>
          </Panel>

          {/* IN FLIGHT */}
          <Panel>
            <SectionLabel
              title="IN FLIGHT"
              pill={flight?.ok ? `${flight.prs.length} PR${flight.prs.length === 1 ? '' : 'S'}` : undefined}
            />
            {flight === undefined ? (
              <div aria-label="Loading flight data">
                <div className="mc-skel" />
                <div className="mc-skel" />
                <div className="mc-skel" style={{ width: '70%' }} />
              </div>
            ) : flight === null || (!flight.ok && flight.reason === 'github_error') ? (
              <div style={{ fontFamily: MONO, fontSize: 11.5, color: N.dim, lineHeight: 1.8 }}>
                GITHUB UNREACHABLE — FLIGHT DATA UNAVAILABLE.
                <div style={{ marginTop: 10 }}>
                  <button type="button" className="mc-btn" onClick={fetchFlight}>
                    RETRY
                  </button>
                </div>
              </div>
            ) : !flight.ok ? (
              <div style={{ fontFamily: MONO, fontSize: 11.5, color: N.dim, lineHeight: 1.9 }}>
                FLIGHT FEED OFFLINE — set{' '}
                <code style={{ color: N.accent, background: N.accentFaint, padding: '2px 6px', borderRadius: 3 }}>
                  GITHUB_TOKEN
                </code>{' '}
                in Vercel env to light up PR gates (repo read scope is enough). Optional — everything else on this board
                runs without it.
              </div>
            ) : flight.prs.length === 0 ? (
              <div style={{ fontFamily: MONO, fontSize: 11.5, color: N.dim, padding: '8px 0' }}>
                NOTHING IN FLIGHT — THE RUNWAY IS CLEAR.
              </div>
            ) : (
              <div>
                {flight.prs.map((p) => {
                  const tag = gateTag(p);
                  return (
                    <div key={p.number} style={{ padding: '10px 2px', borderBottom: `1px solid ${N.border}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <a
                            href={p.url}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: N.accent, textDecoration: 'none', fontFamily: MONO, fontWeight: 700, fontSize: 13 }}
                          >
                            #{p.number}
                          </a>
                          <span style={{ marginLeft: 8, fontSize: 13, color: N.text }}>{p.title}</span>
                        </span>
                        <span
                          style={{
                            fontFamily: MONO,
                            fontSize: 8.5,
                            fontWeight: 700,
                            letterSpacing: '0.12em',
                            padding: '3px 8px',
                            borderRadius: 3,
                            whiteSpace: 'nowrap',
                            color: tag.color,
                            background: tag.bg,
                            border: `1px solid ${tag.border}`,
                          }}
                        >
                          {tag.text}
                        </span>
                      </div>
                      <div style={{ marginTop: 5, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                        <span style={{ fontFamily: MONO, fontSize: 10, color: N.dimmer, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '55%' }}>
                          {p.branch} · {ageOf(p.createdAt)}
                        </span>
                        <span>
                          <GateChip label="CI" gate={p.ci} />
                          <GateChip
                            label="CR"
                            gate={
                              p.coderabbit === 'approved' || p.coderabbit === 'clean'
                                ? 'green'
                                : p.coderabbit === 'changes'
                                  ? 'red'
                                  : p.coderabbit === 'limited'
                                    ? 'blocked'
                                    : p.coderabbit === 'commented'
                                      ? 'running'
                                      : 'none'
                            }
                          />
                          <GateChip
                            label="CDX"
                            gate={
                              p.codex === 'clean'
                                ? 'green'
                                : p.codex === 'findings'
                                  ? 'red'
                                  : // 'stale' — Codex ran, but not on THIS head. Shown as the
                                    // warn glyph rather than a dash: a dash reads "never ran",
                                    // and the action here is a re-trigger, not a first run.
                                    p.codex === 'stale'
                                    ? 'blocked'
                                    : 'none'
                            }
                          />
                        </span>
                      </div>
                    </div>
                  );
                })}
                <div style={{ marginTop: 10, fontFamily: MONO, fontSize: 9.5, color: N.dimmer, lineHeight: 1.7 }}>
                  CR ◇ APPROVED / CLEAN-PASS ✓ · CHANGES ✗ · COMMENTED … · CAPPED, NEVER RAN ⚠ · NO RECORD —
                  (verdicts count on the current head only; a clean pass is read from the edited summary — neither a
                  dash nor a cap notice is a verdict). ⚠ CR DOES NOT GATE — it is a breadth sweep and its chip is
                  reported, never required.
                  <br />
                  CDX ◇ CLEAN ON THIS HEAD ✓ · FINDINGS ✗ · RAN, BUT NOT ON THIS HEAD ⚠ · NO RECORD — (Codex IS the
                  gate; ⚠ means re-trigger, not first run)
                </div>
              </div>
            )}
          </Panel>
        </div>

        {/* ── Dormant slots ── */}
        <div className="mc-duo" style={{ marginTop: 18 }}>
          {['BUSINESS — WIRED AT LAUNCH', 'MEMBER ACTIVITY — WIRED AT LAUNCH'].map((t) => (
            <div
              key={t}
              style={{
                border: `1px dashed rgba(0,212,255,0.16)`,
                borderRadius: 8,
                padding: '16px 18px',
                textAlign: 'center',
                fontFamily: MONO,
                fontSize: 9.5,
                letterSpacing: '0.3em',
                color: N.dimmer,
              }}
            >
              {t}
            </div>
          ))}
        </div>

        {/* ── Footer ── */}
        <div style={{ marginTop: 26, textAlign: 'center', fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', color: N.dimmer }}>
          N.O.R.A. · SHAPE OPERATIONS · SNAPSHOT {hhmm(snap.generatedAt)} ·{' '}
          {flight?.ok ? `FLIGHT ${hhmm(flight.generatedAt)}` : 'FLIGHT OFFLINE'} · POLLS 60S ·{' '}
          <a href="/warroom" style={{ color: N.dim }}>
            DEEP ARCHIVE →
          </a>
        </div>
      </div>
    </div>
  );
}
