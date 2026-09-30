import React from 'react';
// ─── INTEGRATIONS (Settings → Integrations) + source reconciliation ──────────
// Moved out of iosAppBroadsheetClient.jsx (2026-09-30) as the first real ES
// import carved from that module: BSIntegrationsPage (the settings door for
// Spotify / Strava / WHOOP / Garmin / Oura / Apple Health / Apple Music /
// Instacart) and BSReconcile (INT2 source reconciliation), which the coach
// module also renders through window.BSReconcile.
//
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME, NEVER AT MODULE TOP. This file is a
// static import of the client module, so it evaluates BEFORE that module's body
// runs — and BSDetailHeader is only put on window BY that body (its own
// Object.assign(window, …)). A top-level `const { BSDetailHeader } = window` here
// would capture undefined and render React error #130 on first open. Each
// component names the globals it needs on its first line instead. The chrome's
// globals (useBS, BSPage, BSEyebrow, BSSection, BSFooter) are published earlier, by
// the chrome module, which the app entry imports before any role bundle loads; they
// are read the same way for uniformity, not because they are hazardous.

const { useState } = React;

// The i18n translator for this module — the same self-contained copy every
// feature module carries (see iosAppBroadsheetHabits.jsx), so this file does
// not depend on another module's copy or its load order.
function useShapeTr() {
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const unsub = window.ShapeLocale?.subscribe?.(() => force((n) => n + 1));
    return typeof unsub === 'function' ? unsub : undefined;
  }, []);
  return (key, opts) => {
    const v = window.ShapeI18n?.t?.(key, opts);
    return (v == null || v === key) ? (opts?.defaultValue ?? key) : v;
  };
}

const _BS_SOURCE_NAMES = { whoop: 'WHOOP', oura: 'Oura', garmin: 'Garmin', apple_health: 'Apple Health', strava: 'Strava', manual: 'Manual' };
const _bsSourceName = (s) => _BS_SOURCE_NAMES[s] || String(s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
// Source reconciliation (INT2): on-demand "these two disagree — which do you
// trust?" Shows only metrics where connected providers actually differ; tapping
// a source makes it authoritative (writes the override + re-points the snapshot).
export function BSReconcile({ onBack, clientId }) {
  const { useBS } = window;
  const t = useBS();
  const { BSPage, BSDetailHeader } = window;
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState('');
  const load = React.useCallback(() => {
    Promise.resolve(window.ShapeReconcile?.get?.(clientId) || { items: [] })
      .then(r => setItems(Array.isArray(r.items) ? r.items : []))
      .catch(() => setItems([]));
  }, [clientId]);
  React.useEffect(() => { load(); }, [load]);
  const pick = async (metric, source) => {
    setBusy(`${metric}:${source}`);
    try { await window.ShapeReconcile?.set?.({ clientId, metric, source }); }
    catch (e) { window.__bsToast?.("Couldn't save — try again", 'err'); setBusy(''); return; }
    // optimistic: mark chosen authoritative, then refresh from the server
    setItems(list => (list || []).map(it => it.metric !== metric ? it : {
      ...it, override: source, authoritativeSource: source,
      sources: it.sources.map(s => ({ ...s, isAuthoritative: s.source === source })),
    }));
    setBusy('');
    load();
  };
  const fmt = (v, unit) => `${Number.isInteger(v) ? v : Number(v).toFixed(1)}${unit ? (unit === '%' || unit === '' ? unit : ' ' + unit) : ''}`;

  return (
    <BSPage>
      <BSDetailHeader onBack={onBack} eyebrow="Data · Integrations" kicker="Reconcile" title={<>Which source<br/>do you trust?</>} />
      <div style={{ padding: `12px ${t.padX}px`, borderBottom: `1px solid ${t.RULE}` }}>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 13.5, lineHeight: 1.4, fontWeight: 500, color: t.INK70 }}>When two connected devices report a metric differently, pick the one to trust. Your choice becomes the authoritative source going forward.</div>
      </div>
      {items === null && <div style={{ padding: `20px ${t.padX}px`, fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50 }}>Checking sources…</div>}
      {items !== null && items.length === 0 && (
        <div style={{ padding: `0 ${t.padX}px 18px` }}>
          <div style={{ borderTop: `2px solid ${t.INK}`, paddingTop: 14 }}>
            <div style={{ fontFamily: t.DISPLAY, fontSize: 22, fontWeight: 700, color: t.INK, lineHeight: 1.15, letterSpacing: '-0.02em', marginBottom: 8 }}>Your sources agree.</div>
            <div style={{ fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 500, color: t.INK70, lineHeight: 1.45 }}>Nothing to reconcile right now. This only appears when two connected devices disagree on the same metric.</div>
          </div>
        </div>
      )}
      {items !== null && items.length > 0 && (
        <div style={{ padding: `12px ${t.padX}px 30px`, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {items.map((it) => (
            <div key={it.metric} style={{ border: `1px solid ${t.RULE}`, borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '11px 13px', borderBottom: `1px solid ${t.HAIR}`, background: t.PAPER2 }}>
                <div style={{ fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 700, color: t.INK, letterSpacing: '-0.02em' }}>{it.label}</div>
                <div style={{ fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.RUST }}>Disagree</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(it.sources.length, 2)}, 1fr)`, gap: 0 }}>
                {it.sources.map((s, i) => (
                  <div key={s.source} style={{ padding: '12px 13px', borderLeft: i % 2 ? `1px solid ${t.HAIR}` : 0, borderTop: i >= 2 ? `1px solid ${t.HAIR}` : 0, background: s.isAuthoritative ? `${t.ACCENT}14` : 'transparent' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                      <div style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: s.isAuthoritative ? t.ACCENT : t.INK50 }}>{_bsSourceName(s.source)}</div>
                      {s.isAuthoritative && <span style={{ fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.ACCENT }}>✓ Trusted</span>}
                    </div>
                    <div style={{ marginTop: 4, fontFamily: t.DISPLAY, fontSize: 26, fontWeight: 700, color: t.INK, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>{fmt(s.value, it.unit)}</div>
                    {s.isAuthoritative ? (
                      <div style={{ marginTop: 8, fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.06em', textTransform: 'uppercase', color: t.INK50 }}>Your source</div>
                    ) : (
                      <button onClick={() => pick(it.metric, s.source)} disabled={busy === `${it.metric}:${s.source}`} style={{ marginTop: 8, width: '100%', padding: '7px', borderRadius: 8, border: `1px solid ${t.ACCENT}`, background: 'transparent', color: t.ACCENT, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer' }}>
                        {busy === `${it.metric}:${s.source}` ? 'Saving…' : 'Make this my source'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </BSPage>
  );
}
export function BSIntegrationsPage({ onBack }) {
  const { BSDetailHeader, BSEyebrow, BSFooter, BSPage, BSSection, useBS } = window;
  const t = useBS();
  const tr = useShapeTr();
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const [showReconcile, setShowReconcile] = useState(false);

  const loadStatus = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await window.ShapeIntegrations?.getStatus?.();
      setProviders(Array.isArray(result?.providers) ? result.providers : []);
    } catch (err) {
      setError(err?.message || tr('settings:integrations.loadError', { defaultValue: 'Unable to load integrations.' }));
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    loadStatus();
  }, []);

  const providerMap = providers.reduce((acc, provider) => {
    acc[provider.id] = provider;
    return acc;
  }, {});
  const whoop = providerMap.whoop || { id: 'whoop', label: 'WHOOP', connected: false };
  const strava = providerMap.strava || { id: 'strava', label: 'Strava', connected: false };
  const spotify = providerMap.spotify || { id: 'spotify', label: 'Spotify', connected: false };
  const appleMusic = providerMap.apple_music || { id: 'apple_music', label: 'Apple Music', connected: false };
  const garmin = providerMap.garmin || { id: 'garmin', label: 'Garmin', connected: false };
  const oura = providerMap.oura || { id: 'oura', label: 'Oura', connected: false };
  const appleHealth = providerMap.apple_health || { id: 'apple_health', label: 'Apple Health', connected: false };
  const healthKitNative = !!(window.ShapeIntegrations?.appleHealthAvailable?.());
  // One value per status word — `connectedLabel` also drives the accent colour on
  // every card, so a second copy would silently stop matching.
  const connectedLabel = tr('settings:health.connected', { defaultValue: 'Connected' });
  const connectLabel = tr('settings:health.connect', { defaultValue: 'Connect' });
  const reconnectLabel = tr('settings:integrations.reconnect', { defaultValue: 'Reconnect' });
  const disconnectLabel = tr('settings:integrations.disconnect', { defaultValue: 'Disconnect' });
  const readyLabel = tr('settings:integrations.ready', { defaultValue: 'Ready' });
  const iosAppLabel = tr('settings:health.iosApp', { defaultValue: 'iOS app' });
  const syncingLabel = tr('settings:integrations.syncing', { defaultValue: 'Syncing' });
  const syncLabel = tr('settings:integrations.sync', { defaultValue: 'Sync' });
  const importingLabel = tr('settings:integrations.importing', { defaultValue: 'Importing' });
  // Seventeen toast sentences collapse to six ICU keys carrying the provider name.
  const toastSynced = (name) => tr('settings:integrations.toastSynced', { defaultValue: `${name} synced`, name });
  const toastWorkouts = (name) => tr('settings:integrations.toastWorkouts', { defaultValue: `${name} workouts imported`, name });
  const toastRoutes = (name) => tr('settings:integrations.toastRoutes', { defaultValue: `${name} routes imported`, name });
  const toastConnected = (name) => tr('settings:integrations.toastConnected', { defaultValue: `${name} connected`, name });
  const toastReconnected = (name) => tr('settings:integrations.toastReconnected', { defaultValue: `${name} reconnected`, name });
  const toastDisconnected = (name) => tr('settings:integrations.toastDisconnected', { defaultValue: `${name} disconnected`, name });

  // ⚠ THE PROVIDER NAME IS PASSED, NEVER PARSED BACK OUT OF THE TOAST SENTENCE.
  // This used to read `label.replace(/\bdisconnected\b/i,'')` — the English word
  // was doing double duty as copy AND as the identifier the confirm dialog names.
  // A tr() on that label stops the regex matching in all twelve non-English
  // locales, and the dialog silently degrades to "this app" with every gate green:
  // the Train-tag and grocery-aisle class at a third site. The name is data, so it
  // comes from the provider row.
  const runAction = async (key, name, label, action) => {
    if (String(key).endsWith('-disconnect')) {
      if (!(await window.bsAskConfirm({
        title: tr('settings:integrations.confirmTitle', { defaultValue: 'Disconnect this app?' }),
        name: name || tr('settings:integrations.thisApp', { defaultValue: 'this app' }),
        message: tr('settings:integrations.confirmBody', { defaultValue: 'This stops syncing its data until you reconnect — you’ll need to re-authorize.' }),
        confirmLabel: tr('settings:integrations.disconnect', { defaultValue: 'Disconnect' }),
      }))) return;
    }
    setBusy(key);
    setError('');
    setSummary(null);
    try {
      const result = await action();
      setSummary({ label, result });
      window.__bsToast?.(label, 'ok');
      await loadStatus();
    } catch (err) {
      // The old fallback was `${label} failed.` over a label that is already a
      // sentence — it rendered "WHOOP synced failed." Named explicitly now.
      const message = err?.message || tr('settings:integrations.toastFailed', { defaultValue: `Something went wrong with ${name}.`, name });
      setError(message);
      window.__bsToast?.(message, 'error');
    } finally {
      setBusy('');
    }
  };

  const Button = ({ children, onClick, active = false, disabled = false }) => (
    <button
      onClick={onClick}
      disabled={disabled || Boolean(busy)}
      style={{
        borderRadius: t.RADIUS_SM,
        padding: '12px 10px',
        border: `1px solid ${active ? t.INK : t.RULE}`,
        background: active ? t.INK : 'transparent',
        color: active ? t.PAPER : t.INK,
        fontFamily: t.MONO,
        fontSize: 9.5,
        fontWeight: 800,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        cursor: disabled || busy ? 'wait' : 'pointer',
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {children}
    </button>
  );

  const IntegrationCard = ({ eyebrow, name, note, status, children, muted = false }) => (
    <div style={{
      padding: `16px ${t.padX}px 18px`,
      borderTop: `2px solid ${t.INK}`,
      borderBottom: `1px solid ${t.RULE}`,
      background: muted ? 'transparent' : t.PAPER2,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
        <div>
          <BSEyebrow color={status === connectedLabel ? t.ACCENT : t.INK50}>{eyebrow}</BSEyebrow>
          <div style={{ marginTop: 6, fontFamily: t.DISPLAY, fontSize: 23, fontWeight: 700, color: t.INK, letterSpacing: '-0.035em', lineHeight: 1 }}>
            {name}
          </div>
          <div style={{ marginTop: 7, maxWidth: 310, fontFamily: t.DISPLAY, fontSize: 13.5, lineHeight: 1.35, fontWeight: 500, color: t.INK70 }}>
            {note}
          </div>
        </div>
        <div style={{
          borderRadius: t.RADIUS_SM,
          padding: '7px 9px',
          border: `1px solid ${status === connectedLabel ? t.ACCENT : t.RULE}`,
          color: status === connectedLabel ? t.ACCENT : t.INK50,
          fontFamily: t.MONO,
          fontSize: 9,
          fontWeight: 800,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}>
          {status}
        </div>
      </div>
      {children}
    </div>
  );

  const statCards = summary?.result?.whoop ? [
    [tr('settings:integrations.statRecovery', { defaultValue: 'Recovery' }), `${summary.result.whoop.recoveries?.records?.[0]?.score?.recovery_score ?? '-'}%`],
    ['RHR', `${summary.result.whoop.recoveries?.records?.[0]?.score?.resting_heart_rate ?? '-'} bpm`],
    [tr('settings:integrations.statWorkouts', { defaultValue: 'Workouts' }), `${summary.result.whoop.workouts?.records?.length ?? 0}`],
  ] : null;

  if (showReconcile) return <BSReconcile onBack={() => setShowReconcile(false)} />;

  return (
    <BSPage>
      <BSDetailHeader
        onBack={onBack}
        eyebrow={tr('settings:integrations.eyebrow', { defaultValue: 'Data' })}
        kicker={tr('settings:integrations.kicker', { defaultValue: 'Settings · Integrations' })}
        title={<>{tr('settings:integrations.titleA', { defaultValue: 'Connected' })}<br/>{tr('settings:integrations.titleB', { defaultValue: 'apps.' })}</>}
        trailing={<div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: t.DISPLAY, fontSize: 36, lineHeight: 0.9, fontWeight: 700, color: t.INK, letterSpacing: '-0.05em' }}>
            {providers.filter(p => p.connected).length}
          </div>
          <BSEyebrow>{tr('settings:integrations.live', { defaultValue: 'Live' })}</BSEyebrow>
        </div>}
      />

      <div style={{ padding: `14px ${t.padX}px`, borderBottom: `1px solid ${t.RULE}` }}>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 14.5, lineHeight: 1.4, fontWeight: 500, color: t.INK70 }}>
          {tr('settings:integrations.intro', { defaultValue: 'Connect health, activity, and music platforms. WHOOP imports default to private, then you choose what gets shared with coaches or the community feed.' })}
        </div>
      </div>

      {/* On-demand data-quality check — only surfaces when sources disagree. */}
      <button onClick={() => setShowReconcile(true)} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', background: 'transparent', border: 0, borderBottom: `1px solid ${t.RULE}`, padding: `14px ${t.padX}px`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 700, color: t.INK, letterSpacing: '-0.02em' }}>{tr('settings:integrations.reconcile', { defaultValue: 'Reconcile sources' })}</div>
          <div style={{ marginTop: 2, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: t.INK50 }}>{tr('settings:integrations.reconcileMeta', { defaultValue: 'When two devices disagree — pick which to trust' })}</div>
        </div>
        <span style={{ fontFamily: t.MONO, fontSize: 13, color: t.ACCENT }}>→</span>
      </button>

      {error && (
        <div style={{ padding: `12px ${t.padX}px`, borderBottom: `1px solid ${t.RULE}`, color: t.RUST, fontFamily: t.DISPLAY, fontSize: 13.5, fontWeight: 600 }}>
          {error}
        </div>
      )}

      <BSSection title="WHOOP" meta={loading ? tr('settings:integrations.checking', { defaultValue: 'Checking' }) : whoop.connected ? connectedLabel : tr('settings:integrations.notConnected', { defaultValue: 'Not connected' })} />
      <IntegrationCard
        eyebrow={tr('settings:integrations.ebWhoop', { defaultValue: 'Recovery · Sleep · Strain' })}
        name="WHOOP"
        status={whoop.connected ? connectedLabel : connectLabel}
        note={tr('settings:integrations.noteWhoop', { defaultValue: 'Sync recovery, sleep, body measurements, cycles, and workouts. Imported workouts are private until you share them.' })}
      >
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Button active={!whoop.connected} onClick={() => window.ShapeIntegrations?.connectWhoop?.()}>
            {whoop.connected ? reconnectLabel : connectLabel}
          </Button>
          <Button disabled={!whoop.connected} onClick={() => runAction('whoop-sync', whoop.label, toastSynced(whoop.label), () => window.ShapeIntegrations.syncWhoop())}>
            {busy === 'whoop-sync' ? syncingLabel : syncLabel}
          </Button>
          <Button disabled={!whoop.connected} onClick={() => runAction('whoop-import', whoop.label, toastWorkouts(whoop.label), () => window.ShapeIntegrations.syncWhoop({ importWorkouts: true }))}>
            {busy === 'whoop-import' ? importingLabel : tr('settings:integrations.importWorkouts', { defaultValue: 'Import workouts' })}
          </Button>
          <Button disabled={!whoop.connected} onClick={() => runAction('whoop-disconnect', whoop.label, toastDisconnected(whoop.label), () => window.ShapeIntegrations.disconnect('whoop'))}>
            {disconnectLabel}
          </Button>
        </div>
        {statCards && (
          <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderTop: `2px solid ${t.INK}`, borderBottom: `1px solid ${t.RULE}` }}>
            {statCards.map(([label, value], i) => (
              <div key={label} style={{ padding: '10px 8px', borderLeft: i ? `1px solid ${t.RULE}` : 0 }}>
                <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50 }}>{label}</div>
                <div style={{ marginTop: 5, fontFamily: t.DISPLAY, fontSize: 19, fontWeight: 700, letterSpacing: '-0.04em', color: t.INK }}>{value}</div>
              </div>
            ))}
          </div>
        )}
        {summary?.result?.import && (
          <div style={{ marginTop: 10, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50, lineHeight: 1.45 }}>
            {tr('settings:integrations.importedWorkouts', {
              defaultValue: 'Imported {imported, plural, one {# private workout} other {# private workouts}} · {errors, plural, one {# error} other {# errors}}',
              imported: summary.result.import.imported || 0,
              errors: summary.result.import.errors?.length || 0,
            })}
          </div>
        )}
      </IntegrationCard>

      <BSSection title="Strava" meta={strava.connected ? connectedLabel : readyLabel} />
      <IntegrationCard
        eyebrow={tr('settings:integrations.ebStrava', { defaultValue: 'Runs · rides · routes' })}
        name="Strava"
        status={strava.connected ? connectedLabel : connectLabel}
        note={tr('settings:integrations.noteStrava', { defaultValue: 'Connect Strava activities and map data. Route imports will use the same private-first sharing model as WHOOP.' })}
      >
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Button active={!strava.connected} onClick={() => window.ShapeIntegrations?.connectStrava?.()}>
            {strava.connected ? reconnectLabel : connectLabel}
          </Button>
          <Button disabled={!strava.connected} onClick={() => runAction('strava-sync', strava.label, toastSynced(strava.label), () => window.ShapeIntegrations.syncStrava())}>
            {busy === 'strava-sync' ? syncingLabel : syncLabel}
          </Button>
          <Button disabled={!strava.connected} onClick={() => runAction('strava-import', strava.label, toastRoutes(strava.label), () => window.ShapeIntegrations.syncStrava({ importActivities: true }))}>
            {busy === 'strava-import' ? importingLabel : tr('settings:integrations.importRoutes', { defaultValue: 'Import routes' })}
          </Button>
          <Button disabled={!strava.connected} onClick={() => runAction('strava-disconnect', strava.label, toastDisconnected(strava.label), () => window.ShapeIntegrations.disconnect('strava'))}>
            {disconnectLabel}
          </Button>
        </div>
        {summary?.result?.import && (
          <div style={{ marginTop: 10, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50, lineHeight: 1.45 }}>
            {tr('settings:integrations.importedActivities', {
              defaultValue: 'Imported {imported, plural, one {# private activity} other {# private activities}} · {errors, plural, one {# error} other {# errors}}',
              imported: summary.result.import.imported || 0,
              errors: summary.result.import.errors?.length || 0,
            })}
          </div>
        )}
      </IntegrationCard>

      <BSSection title="Spotify" meta={spotify.connected ? connectedLabel : readyLabel} />
      <IntegrationCard
        eyebrow={tr('settings:integrations.ebSpotify', { defaultValue: 'Music · Playlists' })}
        name="Spotify"
        status={spotify.connected ? connectedLabel : connectLabel}
        note={tr('settings:integrations.noteSpotify', { defaultValue: 'Pick workout playlists from your Spotify library and attach them to programs. Streams in Shape Radio and the workout player.' })}
      >
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Button active={!spotify.connected} onClick={() => window.ShapeIntegrations?.connectSpotify?.()}>
            {spotify.connected ? reconnectLabel : connectLabel}
          </Button>
          <Button disabled={!spotify.connected} onClick={() => runAction('spotify-disconnect', spotify.label, toastDisconnected(spotify.label), () => window.ShapeIntegrations.disconnect('spotify'))}>
            {disconnectLabel}
          </Button>
        </div>
      </IntegrationCard>

      <BSSection title="Apple Music" meta={appleMusic.connected ? connectedLabel : readyLabel} />
      <IntegrationCard
        eyebrow={tr('settings:integrations.ebAppleMusic', { defaultValue: 'MusicKit library' })}
        name="Apple Music"
        status={appleMusic.connected ? connectedLabel : connectLabel}
        note={tr('settings:integrations.noteAppleMusic', { defaultValue: 'Authorize Apple Music with MusicKit to use your library for workout playlists. You grant access right here — no redirect.' })}
      >
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Button active={!appleMusic.connected} onClick={() => runAction('apple-connect', appleMusic.label, appleMusic.connected ? toastReconnected(appleMusic.label) : toastConnected(appleMusic.label), () => window.ShapeIntegrations.connectAppleMusic())}>
            {busy === 'apple-connect' ? tr('settings:integrations.authorizing', { defaultValue: 'Authorizing' }) : (appleMusic.connected ? reconnectLabel : connectLabel)}
          </Button>
          <Button disabled={!appleMusic.connected} onClick={() => runAction('apple-disconnect', appleMusic.label, toastDisconnected(appleMusic.label), () => window.ShapeIntegrations.disconnectAppleMusic())}>
            {disconnectLabel}
          </Button>
        </div>
      </IntegrationCard>

      <BSSection title="Instacart" meta={tr('settings:integrations.groceryHandoff', { defaultValue: 'Grocery hand-off' })} />
      <IntegrationCard
        eyebrow={tr('settings:integrations.ebInstacart', { defaultValue: 'Groceries' })}
        name="Instacart"
        status={readyLabel}
        note={tr('settings:integrations.noteInstacart', { defaultValue: 'Send your coach-built grocery list to Instacart and open a pre-filled cart. While Instacart access is pending, the list is copied to your clipboard instead.' })}
      >
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
          <Button onClick={async () => { setBusy('instacart-send'); setError(''); try { await window.ShapeIntegrations.sendGroceryToInstacart(); } catch (e) { const m = e?.message || tr('settings:integrations.groceryError', { defaultValue: 'Could not build grocery list.' }); setError(m); window.__bsToast?.(m, 'error'); } finally { setBusy(''); } }}>
            {busy === 'instacart-send' ? tr('settings:integrations.buildingList', { defaultValue: 'Building list' }) : tr('settings:integrations.sendToInstacart', { defaultValue: 'Send grocery list to Instacart →' })}
          </Button>
        </div>
      </IntegrationCard>

      <BSSection title="Garmin" meta={garmin.connected ? connectedLabel : readyLabel} />
      <IntegrationCard
        eyebrow={tr('settings:integrations.ebGarmin', { defaultValue: 'Activities · HR · Sleep' })}
        name="Garmin"
        status={garmin.connected ? connectedLabel : connectLabel}
        note={tr('settings:integrations.noteGarmin', { defaultValue: 'Pull Garmin Connect activities, heart rate, and sleep into your profile. Requires Garmin Health API approval on the developer account.' })}
      >
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Button active={!garmin.connected} onClick={() => window.ShapeIntegrations?.connectProvider?.('garmin')}>
            {garmin.connected ? reconnectLabel : connectLabel}
          </Button>
          <Button disabled={!garmin.connected} onClick={() => runAction('garmin-disconnect', garmin.label, toastDisconnected(garmin.label), () => window.ShapeIntegrations.disconnect('garmin'))}>
            {disconnectLabel}
          </Button>
        </div>
      </IntegrationCard>

      <BSSection title="Oura" meta={oura.connected ? connectedLabel : readyLabel} />
      <IntegrationCard
        eyebrow={tr('settings:integrations.ebOura', { defaultValue: 'Sleep · Readiness · HR' })}
        name="Oura"
        status={oura.connected ? connectedLabel : connectLabel}
        note={tr('settings:integrations.noteOura', { defaultValue: 'Sync Oura Ring sleep, readiness, and heart-rate data into your daily health snapshot. Workouts import privately, like WHOOP.' })}
      >
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Button active={!oura.connected} onClick={() => window.ShapeIntegrations?.connectProvider?.('oura')}>
            {oura.connected ? reconnectLabel : connectLabel}
          </Button>
          <Button disabled={!oura.connected} onClick={() => runAction('oura-sync', oura.label, toastSynced(oura.label), () => window.ShapeIntegrations.syncOura())}>
            {busy === 'oura-sync' ? syncingLabel : syncLabel}
          </Button>
          <Button disabled={!oura.connected} onClick={() => runAction('oura-import', oura.label, toastWorkouts(oura.label), () => window.ShapeIntegrations.syncOura({ importWorkouts: true }))}>
            {busy === 'oura-import' ? importingLabel : tr('settings:integrations.importWorkouts', { defaultValue: 'Import workouts' })}
          </Button>
          <Button disabled={!oura.connected} onClick={() => runAction('oura-disconnect', oura.label, toastDisconnected(oura.label), () => window.ShapeIntegrations.disconnect('oura'))}>
            {disconnectLabel}
          </Button>
        </div>
      </IntegrationCard>

      <BSSection title="Apple Health" meta={appleHealth.connected ? connectedLabel : (healthKitNative ? readyLabel : iosAppLabel)} />
      <IntegrationCard
        eyebrow={tr('settings:integrations.ebAppleHealth', { defaultValue: 'Apple Watch · Health' })}
        name="Apple Health"
        status={appleHealth.connected ? connectedLabel : (healthKitNative ? connectLabel : iosAppLabel)}
        note={healthKitNative ? tr('settings:integrations.noteAppleHealthNative', { defaultValue: 'Read steps, heart rate, HRV, resting HR, sleep, active energy, and workouts from Apple Health (including your Apple Watch) into your daily snapshot.' }) : tr('settings:integrations.noteAppleHealthWeb', { defaultValue: 'Apple Health (and Apple Watch) data is only available in the Shape iOS app. Open Shape on your iPhone to connect.' })}
      >
        {healthKitNative ? (
          <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Button active={!appleHealth.connected} onClick={() => runAction('apple-health-connect', appleHealth.label, appleHealth.connected ? toastSynced(appleHealth.label) : toastConnected(appleHealth.label), () => window.ShapeIntegrations.syncAppleHealth())}>
              {busy === 'apple-health-connect' ? tr('settings:integrations.authorizing', { defaultValue: 'Authorizing' }) : (appleHealth.connected ? tr('settings:integrations.syncNow', { defaultValue: 'Sync now' }) : connectLabel)}
            </Button>
            <Button disabled={!appleHealth.connected} onClick={() => runAction('apple-health-disconnect', appleHealth.label, toastDisconnected(appleHealth.label), () => window.ShapeIntegrations.disconnect('apple_health'))}>
              {disconnectLabel}
            </Button>
          </div>
        ) : null}
      </IntegrationCard>

      <BSFooter right="Integrations" />
    </BSPage>
  );
}
