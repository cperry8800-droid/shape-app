// One message to a chosen set of clients, from the Clients page (owner, 2026-11-05: "Nudge all 3",
// "Note to all"). Each client gets their own copy in their own thread with the coach; there is no group
// thread. A confirm step names how many it goes to before anything is sent, and the server holds the
// count to it (POST /api/coach/messages/group, rate-limited there).
//
// GroupMessageButton({ role, triage })
//   `triage` is the page's roster (getTriageFeed rows): the presets pick "the N who need you" (red) or
//   everyone, and the coach can tick and untick from there.
//
// Window globals, read at render time (no module system on the website).

const GMB_MONO = "'JetBrains Mono', monospace";
const GMB_INK50 = "rgba(var(--sh-ink-rgb, 242,237,228),0.55)";
const GMB_HAIR = "rgba(var(--sh-ink-rgb, 242,237,228),0.12)";
const GMB_TEAL = "var(--sh-accent, #2ee0c4)";
const GMB_NUDGE = "Checking in — how is this week going? Anything I can adjust for you?";

function gmbUuid() {
  try { if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID(); } catch (e) {}
  const h = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
  return h() + h() + "-" + h() + "-4" + h().slice(1) + "-a" + h().slice(1) + "-" + h() + h() + h();
}

function GroupMessageButton({ role, triage }) {
  const [open, setOpen] = React.useState(false);
  const [picked, setPicked] = React.useState({});
  const [body, setBody] = React.useState("");
  const [step, setStep] = React.useState("compose"); // compose · confirm · sending · done
  const [groupId, setGroupId] = React.useState(null);
  const [result, setResult] = React.useState(null);
  const rows = (Array.isArray(triage) ? triage : []).filter((r) => r && r.client && r.client.profile && r.client.profile.id);
  const needs = rows.filter((r) => r.severity === "red");
  const ids = Object.keys(picked).filter((k) => picked[k]);
  const nameOf = (id) => { const r = rows.find((x) => x.client.profile.id === id); return r ? r.client.profile.name : "Client"; };
  const preset = (list, text) => { const next = {}; list.forEach((r) => { next[r.client.profile.id] = true; }); setPicked(next); if (text != null) setBody(text); setStep("compose"); };
  const reset = () => { setOpen(false); setPicked({}); setBody(""); setStep("compose"); setGroupId(null); setResult(null); };

  const send = async () => {
    setStep("sending");
    try {
      const r = await fetch("/api/coach/messages/group", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, clientIds: ids, body: body.trim(), confirmed: ids.length, groupId }),
      });
      const j = await r.json().catch(() => ({}));
      setResult(r.ok || j.sent ? { ok: !(j.failed && j.failed.length), sent: j.sent || 0, failed: j.failed || [] } : { ok: false, error: j.error || "Nothing was sent. Try again." });
      setStep("done");
    } catch (e) {
      setResult({ ok: false, error: "Nothing was sent. Try again." });
      setStep("done");
    }
  };

  const btn = (primary) => ({ fontFamily: GMB_MONO, fontSize: 9.5, letterSpacing: "0.12em", textTransform: "uppercase", padding: "9px 14px", borderRadius: 4, cursor: "pointer",
    border: primary ? 0 : "1px solid " + GMB_HAIR, background: primary ? GMB_TEAL : "transparent", color: primary ? "var(--sh-deep, #06231f)" : "var(--sh-ink, #f2ede4)" });

  return (
    <React.Fragment>
      <button type="button" onClick={() => setOpen(true)} disabled={!rows.length}
        style={{ background: "transparent", color: "var(--sh-ink, #f2ede4)", border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.25)", padding: "10px 20px", borderRadius: 999, fontSize: 13, cursor: rows.length ? "pointer" : "default", fontFamily: "inherit" }}>
        Message several
      </button>
      {open && ReactDOM.createPortal(
        <div role="dialog" aria-modal="true" aria-label="Message several clients" style={{ position: "fixed", inset: 0, zIndex: 260 }}>
          <div aria-hidden="true" onClick={() => step !== "sending" && reset()} style={{ position: "absolute", inset: 0, background: "rgba(10,10,8,0.6)" }} />
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "min(520px, 94vw)", maxHeight: "88vh", overflowY: "auto", boxSizing: "border-box", background: "var(--sh-ground2, #14110e)", border: "1px solid " + GMB_HAIR, borderRadius: 10, padding: 22, color: "var(--sh-ink, #f2ede4)" }}>
            <div style={{ fontFamily: GMB_MONO, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: GMB_INK50 }}>Message several clients</div>
            <div style={{ fontSize: 12.5, color: GMB_INK50, margin: "6px 0 14px", lineHeight: 1.5 }}>Each client gets their own copy in their thread with you. Nobody sees who else got it.</div>

            {step === "compose" && (
              <React.Fragment>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                  {needs.length > 0 && <button type="button" style={btn(false)} onClick={() => preset(needs, GMB_NUDGE)}>Nudge the {needs.length} who need you</button>}
                  <button type="button" style={btn(false)} onClick={() => preset(rows, null)}>Note to all {rows.length}</button>
                  {ids.length > 0 && <button type="button" style={btn(false)} onClick={() => setPicked({})}>Clear</button>}
                </div>
                <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid " + GMB_HAIR, borderRadius: 6, padding: "4px 10px", marginBottom: 12 }}>
                  {rows.map((r) => {
                    const id = r.client.profile.id;
                    return (
                      <label key={id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", fontSize: 13, cursor: "pointer" }}>
                        <input type="checkbox" checked={!!picked[id]} onChange={(e) => setPicked({ ...picked, [id]: e.target.checked })} />
                        <span>{r.client.profile.name}</span>
                        {r.severity === "red" && <span style={{ fontFamily: GMB_MONO, fontSize: 8.5, color: GMB_INK50, textTransform: "uppercase", letterSpacing: "0.1em" }}>Needs you</span>}
                      </label>
                    );
                  })}
                </div>
                <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={2000} aria-label="Your message" placeholder="Write your message…"
                  style={{ width: "100%", boxSizing: "border-box", background: "transparent", color: "var(--sh-ink, #f2ede4)", border: "1px solid " + GMB_HAIR, borderRadius: 6, padding: 10, fontFamily: "inherit", fontSize: 13, resize: "vertical" }} />
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
                  <button type="button" style={btn(false)} onClick={reset}>Cancel</button>
                  <button type="button" style={{ ...btn(true), opacity: ids.length && body.trim() ? 1 : 0.5 }} disabled={!ids.length || !body.trim()} onClick={() => { setGroupId(gmbUuid()); setStep("confirm"); }}>Review · {ids.length}</button>
                </div>
              </React.Fragment>
            )}

            {(step === "confirm" || step === "sending") && (
              <React.Fragment>
                <div style={{ fontSize: 15, marginBottom: 8 }}>Send this to {ids.length} client{ids.length === 1 ? "" : "s"}?</div>
                <div style={{ fontSize: 12.5, color: GMB_INK50, marginBottom: 10, lineHeight: 1.5 }}>{ids.map(nameOf).join(", ")}</div>
                <div style={{ border: "1px solid " + GMB_HAIR, borderRadius: 6, padding: 10, fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap", marginBottom: 14 }}>{body.trim()}</div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button type="button" style={btn(false)} disabled={step === "sending"} onClick={() => setStep("compose")}>Back</button>
                  <button type="button" style={btn(true)} disabled={step === "sending"} onClick={send}>{step === "sending" ? "Sending…" : "Send to " + ids.length}</button>
                </div>
              </React.Fragment>
            )}

            {step === "done" && result && (
              <React.Fragment>
                <div role="status" style={{ fontSize: 14, lineHeight: 1.5, marginBottom: 14 }}>
                  {result.error ? result.error
                    : result.ok ? "Sent to " + result.sent + " client" + (result.sent === 1 ? "" : "s") + "."
                    : "Sent to " + result.sent + ". Not sent to " + result.failed.map(nameOf).join(", ") + "."}
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end" }}><button type="button" style={btn(true)} onClick={reset}>Done</button></div>
              </React.Fragment>
            )}
          </div>
        </div>,
        document.body
      )}
    </React.Fragment>
  );
}

Object.assign(window, { GroupMessageButton });
