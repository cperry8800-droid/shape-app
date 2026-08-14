// Shared-Clients tab for TrainerClients / NutritionistClients pages.
//
// Pure React (no own root). Exports a global `SharedClientsTab` component
// expected to be rendered inside the existing clients page.
//
// Props:
//   role: 'trainer' | 'nutritionist'     — the caller's role on this page.
//   onCountChange?: (n: number) => void  — fires when active (un-acknowledged)
//                                          count changes so the page can show
//                                          a badge on the tab.
//
// Backed by /api/me/shared-clients. Each row gets a "Message {name}" button
// that POSTs to /api/me/shared-clients/:clientId/thread to find-or-create the
// coach↔coach conversation, then opens the global chat widget pinned to that
// counterpart by name. A "Dismiss banner" button POSTs to .../ack so the
// alert chip stops nagging until a different counterpart shows up.

function SharedClientsTab({ role, onCountChange }) {
  const [rows, setRows] = React.useState(null);  // null = loading
  const [busy, setBusy] = React.useState({});    // { [key]: 'msg' | 'ack' }

  React.useEffect(() => {
    let cancelled = false;
    // A FAILED load must not render as "no shared clients". The route was changed to answer 500
    // rather than 200-with-empty precisely because a silent empty roster is what hid the original
    // defect for as long as it lasted -- swallowing that 500 here would hand the coach the same
    // lie with a red line in a log they never read. `false` is the load-failed sentinel.
    fetch('/api/me/shared-clients', { credentials: 'same-origin' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .then(d => { if (!cancelled) setRows(Array.isArray(d && d.shared) ? d.shared : []); })
      .catch(() => { if (!cancelled) setRows(false); });
    return () => { cancelled = true; };
  }, []);

  React.useEffect(() => {
    if (!Array.isArray(rows)) return;
    const active = rows.filter(r => !r.acknowledged).length;
    if (typeof onCountChange === 'function') onCountChange(active);
  }, [rows, onCountChange]);

  const rowKey = (r) => `${r.clientId}|${r.counterpart.userId}`;

  async function openMessage(r) {
    const k = rowKey(r);
    setBusy(prev => ({ ...prev, [k]: 'msg' }));
    try {
      const res = await fetch(`/api/me/shared-clients/${encodeURIComponent(r.clientId)}/thread`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ counterpartUserId: r.counterpart.userId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Could not open the chat.');
        return;
      }
      // Open the chat widget. If no local thread for this coach exists yet,
      // the widget will prepend a fresh one tagged with the conversationId.
      try {
        window.__openChat && window.__openChat({
          who: r.counterpart.name,
          role: `${r.counterpart.role === 'trainer' ? 'Trainer' : 'Nutritionist'} · re: ${r.clientName}`,
          conversationId: data.conversationId,
        });
      } catch {}
    } finally {
      setBusy(prev => { const n = { ...prev }; delete n[k]; return n; });
    }
  }

  async function dismiss(r) {
    const k = rowKey(r);
    setBusy(prev => ({ ...prev, [k]: 'ack' }));
    try {
      await fetch(`/api/me/shared-clients/${encodeURIComponent(r.clientId)}/ack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ counterpartUserId: r.counterpart.userId }),
      });
      setRows(prev => prev.map(x => rowKey(x) === k ? { ...x, acknowledged: true } : x));
    } finally {
      setBusy(prev => { const n = { ...prev }; delete n[k]; return n; });
    }
  }

  if (rows === null) {
    return (
      <div style={{ padding: 28, color: "rgba(242,237,228,0.55)", fontSize: 13.5, textAlign: "center" }}>
        Loading shared clients…
      </div>
    );
  }
  // Load failed. Deliberately NOT the empty state below: "no shared clients yet" is a claim
  // about the roster, and a request that never answered cannot support it.
  if (rows === false) {
    return (
      <div style={{ padding: 36, textAlign: "center", color: "rgba(242,237,228,0.6)", fontSize: 13.5, lineHeight: 1.6 }}>
        Couldn't load your shared clients. This is a loading problem, not an empty roster —
        refresh to try again.
      </div>
    );
  }
  if (rows.length === 0) {
    const other = role === 'trainer' ? 'nutritionists' : 'trainers';
    return (
      <div style={{ padding: 36, textAlign: "center", color: "rgba(242,237,228,0.6)", fontSize: 13.5, lineHeight: 1.6 }}>
        No shared clients yet. When one of your clients also subscribes to a {role === 'trainer' ? 'nutritionist' : 'trainer'},
        you'll see them here along with their other coach. From here you can message {other} directly to coordinate.
      </div>
    );
  }

  const COLS = "1.6fr 1.5fr 0.6fr auto auto";

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 12, padding: "6px 4px 14px", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.08em", color: "rgba(242,237,228,0.5)", borderBottom: "1px solid rgba(242,237,228,0.08)" }}>
        <span>CLIENT</span>
        <span>{role === 'trainer' ? 'NUTRITIONIST' : 'TRAINER'}</span>
        <span>STATUS</span>
        <span></span>
        <span></span>
      </div>
      {rows.map((r, i) => {
        const k = rowKey(r);
        const isMsgBusy = busy[k] === 'msg';
        const isAckBusy = busy[k] === 'ack';
        return (
          <div key={k} style={{ display: "grid", gridTemplateColumns: COLS, gap: 12, padding: "14px 4px", alignItems: "center", borderTop: i === 0 ? "none" : "1px solid rgba(242,237,228,0.05)" }}>
            <a href={`${role === 'nutritionist' ? 'NutritionistClient' : 'TrainerClient'}.html?id=${encodeURIComponent(r.clientId)}`}
               style={{ display: "flex", gap: 10, alignItems: "center", textDecoration: "none", color: "inherit", cursor: "pointer" }}>
              <div style={{ width: 28, height: 28, borderRadius: 999, background: "#efece6" }} />
              <span style={{ fontSize: 13.5, fontWeight: 500 }}>{r.clientName}</span>
            </a>
            <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
              <div style={{ width: 24, height: 24, borderRadius: 999, background: "rgba(46,224,196,0.18)", border: "1px solid rgba(46,224,196,0.35)", flex: "none", overflow: "hidden" }}>
                {r.counterpart.avatarUrl ? <img src={r.counterpart.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.counterpart.name}</div>
                <div style={{ fontSize: 10.5, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.08em", color: "rgba(242,237,228,0.5)", textTransform: "uppercase" }}>{r.counterpart.role}</div>
              </div>
            </div>
            <span>
              {r.acknowledged ? (
                <span style={{ fontSize: 10.5, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.1em", color: "rgba(242,237,228,0.45)", textTransform: "uppercase" }}>Seen</span>
              ) : (
                <span style={{ fontSize: 10.5, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.1em", color: "#2ee0c4", textTransform: "uppercase" }}>New</span>
              )}
            </span>
            <button
              onClick={() => openMessage(r)}
              disabled={isMsgBusy}
              style={{ background: "#0ac5a8", color: "#1a1612", border: 0, padding: "8px 16px", borderRadius: 999, fontFamily: "'Space Grotesk', sans-serif", fontSize: 12, fontWeight: 500, cursor: isMsgBusy ? "wait" : "pointer", whiteSpace: "nowrap", opacity: isMsgBusy ? 0.6 : 1 }}
            >
              {isMsgBusy ? "Opening…" : `Message ${r.counterpart.name.split(/\s+/)[0]}`}
            </button>
            {!r.acknowledged ? (
              <button
                onClick={() => dismiss(r)}
                disabled={isAckBusy}
                style={{ background: "transparent", color: "rgba(242,237,228,0.6)", border: "1px solid rgba(242,237,228,0.15)", padding: "7px 12px", borderRadius: 999, fontFamily: "'Space Grotesk', sans-serif", fontSize: 11.5, cursor: isAckBusy ? "wait" : "pointer", whiteSpace: "nowrap" }}
              >
                {isAckBusy ? "…" : "Dismiss"}
              </button>
            ) : <span />}
          </div>
        );
      })}
    </div>
  );
}
