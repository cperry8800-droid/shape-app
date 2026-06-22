
// Dashboard Profile = the LIVING profile itself (profile-first, like the app's
// Me tab). "✎ Customize profile" on the page edits it; the dashboard-only
// pieces (credentials & verification + back link + danger zone) ride below.

// Coach credentials & verification — upload the Certificate of Insurance (COI)
// + certifications, then submit for admin review. On approval a ✓ Verified badge
// shows on the marketplace + profile. Backed by /api/coach/credentials(+/document).
function CoachCredentialsCard() {
  const mono = "'JetBrains Mono', monospace";
  const sans = "'Space Grotesk', sans-serif";
  const teal = "#2ee0c4";
  const [st, setSt] = React.useState({ loading: true });
  const [busy, setBusy] = React.useState("");
  const [msg, setMsg] = React.useState("");
  const [cert, setCert] = React.useState({ type: "", number: "" });

  const load = React.useCallback(() => {
    fetch("/api/coach/credentials", { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setSt({ loading: false, data: d }))
      .catch(() => setSt({ loading: false, data: null }));
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const upload = async (kind, file, extra) => {
    if (!file) return;
    setBusy(kind); setMsg("");
    try {
      const fd = new FormData();
      fd.append("file", file); fd.append("kind", kind);
      if (extra) { fd.append("type", extra.type || ""); fd.append("number", extra.number || ""); }
      const r = await fetch("/api/coach/credentials/document", { method: "POST", credentials: "same-origin", body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Upload failed.");
      setMsg(kind === "coi" ? "Insurance document uploaded." : "Certificate uploaded.");
      if (kind === "cert") setCert({ type: "", number: "" });
      load();
    } catch (e) { setMsg((e && e.message) || "Upload failed."); }
    finally { setBusy(""); }
  };

  const submit = async () => {
    setBusy("submit"); setMsg("");
    try {
      const r = await fetch("/api/coach/credentials", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "submit" }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Could not submit.");
      setMsg("Submitted for review — we’ll verify within a few business days.");
      load();
    } catch (e) { setMsg((e && e.message) || "Could not submit."); }
    finally { setBusy(""); }
  };

  const d = st.data || {};
  const review = d.review || {};
  const verified = !!d.verified;
  const status = verified ? "verified" : (review.status || "none");
  const badge = {
    verified: ["✓ Verified", teal],
    pending: ["In review", "#d8b25a"],
    changes_requested: ["Changes requested", "#e0a23a"],
    rejected: ["Not verified", "#e07856"],
    approved: ["✓ Verified", teal],
    none: ["Not submitted", "rgba(242,237,228,0.5)"],
  }[status] || ["—", "rgba(242,237,228,0.5)"];

  const card = { background: "rgba(242,237,228,0.03)", border: "1px solid rgba(242,237,228,0.1)", borderRadius: 16, padding: "20px 22px" };
  const kick = { fontFamily: mono, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(242,237,228,0.5)" };
  const lbl = { fontFamily: mono, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(242,237,228,0.55)" };
  const fileBtn = { display: "inline-block", cursor: "pointer", fontFamily: sans, fontSize: 12.5, color: "rgba(242,237,228,0.8)", border: "1px solid rgba(242,237,228,0.25)", borderRadius: 9, padding: "9px 13px" };
  const input = { background: "rgba(0,0,0,0.2)", border: "1px solid rgba(242,237,228,0.18)", borderRadius: 9, padding: "9px 11px", color: "#f2ede4", fontFamily: sans, fontSize: 12.5, outline: "none", minWidth: 0 };

  return (
    <div style={{ ...card, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={kick}>Credentials & verification</div>
        <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: badge[1], border: `1px solid ${badge[1]}55`, borderRadius: 999, padding: "4px 10px" }}>{badge[0]}</span>
      </div>

      {st.loading ? (
        <div style={{ fontFamily: mono, fontSize: 11, color: "rgba(242,237,228,0.4)" }}>Loading…</div>
      ) : !st.data ? (
        <div style={{ fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.6)" }}>Sign in as a coach to manage your credentials.</div>
      ) : (
        <>
          <p style={{ fontFamily: sans, fontSize: 12.5, color: "rgba(242,237,228,0.6)", margin: "0 0 16px", lineHeight: 1.5 }}>
            Upload proof of certification and your professional liability insurance (COI). Once verified, a
            <span style={{ color: teal }}> ✓ Verified</span> badge shows on your marketplace profile.
            {review.notes && status !== "verified" ? <span style={{ display: "block", marginTop: 8, color: "#e0a23a" }}>Reviewer note: {review.notes}</span> : null}
          </p>

          {/* COI */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 0", borderTop: "1px solid rgba(242,237,228,0.08)", flexWrap: "wrap" }}>
            <div>
              <div style={lbl}>Insurance · COI</div>
              <div style={{ fontFamily: sans, fontSize: 12, color: review.hasCoi ? teal : "rgba(242,237,228,0.45)", marginTop: 3 }}>{review.hasCoi ? "On file ✓" : "Not uploaded"}</div>
            </div>
            <label style={fileBtn}>
              {busy === "coi" ? "Uploading…" : (review.hasCoi ? "Replace COI" : "Upload COI")}
              <input type="file" accept="application/pdf,image/*,.doc,.docx" style={{ display: "none" }} disabled={busy === "coi"} onChange={(e) => upload("coi", e.target.files && e.target.files[0])} />
            </label>
          </div>

          {/* Certifications */}
          <div style={{ padding: "12px 0", borderTop: "1px solid rgba(242,237,228,0.08)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={lbl}>Certifications</div>
              <div style={{ fontFamily: sans, fontSize: 12, color: review.certCount ? teal : "rgba(242,237,228,0.45)" }}>{review.certCount ? `${review.certCount} on file ✓` : "None yet"}</div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <input aria-label="Certification type" style={{ ...input, flex: "1 1 120px" }} placeholder="Cert (e.g. NASM-CPT)" value={cert.type} onChange={(e) => setCert((c) => ({ ...c, type: e.target.value }))} />
              <input aria-label="Certification number" style={{ ...input, flex: "1 1 120px" }} placeholder="Cert # (optional)" value={cert.number} onChange={(e) => setCert((c) => ({ ...c, number: e.target.value }))} />
              <label style={fileBtn}>
                {busy === "cert" ? "Uploading…" : "Add file"}
                <input type="file" accept="application/pdf,image/*,.doc,.docx" style={{ display: "none" }} disabled={busy === "cert"} onChange={(e) => upload("cert", e.target.files && e.target.files[0], cert)} />
              </label>
            </div>
          </div>

          {/* Submit */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, paddingTop: 14, borderTop: "1px solid rgba(242,237,228,0.08)", flexWrap: "wrap" }}>
            <div style={{ fontFamily: mono, fontSize: 10.5, color: "rgba(242,237,228,0.45)", minHeight: 14 }}>{msg}</div>
            <button
              onClick={submit}
              disabled={busy === "submit" || !review.hasCoi || status === "pending"}
              style={{ background: (!review.hasCoi || status === "pending") ? "rgba(46,224,196,0.25)" : teal, color: "#0b0e0c", border: 0, borderRadius: 999, padding: "10px 18px", fontFamily: sans, fontSize: 12.5, fontWeight: 600, cursor: (!review.hasCoi || status === "pending") ? "default" : "pointer" }}
              title={!review.hasCoi ? "Upload your COI first" : status === "pending" ? "Already in review" : "Submit for verification"}
            >
              {status === "pending" ? "In review" : busy === "submit" ? "Submitting…" : "Submit for review"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function DashProfileExtras() {
  const mono = "'JetBrains Mono', monospace";
  const btn = (danger) => ({ background: "transparent", color: danger ? "#e07856" : "rgba(242,237,228,0.7)", border: `1px solid ${danger ? "rgba(224,120,86,0.4)" : "rgba(242,237,228,0.2)"}`, padding: "14px 16px", borderRadius: 10, fontSize: 13, cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif", textAlign: "left" });
  return (
    <section style={{ maxWidth: 900, margin: "0 auto", padding: "26px 40px 34px" }}>
      <CoachCredentialsCard />
      <div style={{ background: "rgba(242,237,228,0.03)", border: "1px solid rgba(242,237,228,0.1)", borderRadius: 16, padding: "20px 22px", marginBottom: 18 }}>
        <div style={{ fontFamily: mono, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(242,237,228,0.5)", marginBottom: 14 }}>App tour</div>
        <button style={btn(false)} onClick={() => { try { window.dispatchEvent(new Event("shape:startTour")); } catch (e) {} }}>Take a tour — walk through your dashboard</button>
      </div>
      <div style={{ background: "rgba(242,237,228,0.03)", border: "1px solid rgba(242,237,228,0.1)", borderRadius: 16, padding: "20px 22px" }}>
        <div style={{ fontFamily: mono, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(242,237,228,0.5)", marginBottom: 14 }}>Account · Danger zone</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }} className="dk-3up">
          <button style={btn(false)} onClick={async (ev) => {
            const b = ev && ev.currentTarget;
            if (b) b.disabled = true; // guard against double-submission
            try {
              // no-store: the export is the coach's full personal data — keep it out of the browser HTTP cache.
              const res = await fetch("/api/account/export", { credentials: "same-origin", cache: "no-store" });
              if (res.status === 401) { window.location.href = "/login.html"; return; }
              if (!res.ok) throw new Error("export failed");
              const blob = await res.blob(); const url = URL.createObjectURL(blob);
              const a = document.createElement("a"); a.href = url; a.download = `shape-data-export-${new Date().toISOString().slice(0, 10)}.json`;
              document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
            } catch (e) { alert("Could not export your data right now. Email privacy@theshapecommunity.com."); }
            finally { if (b) b.disabled = false; }
          }}>Export my data</button>
          <button style={btn(false)}>Pause coach profile</button>
          <button style={btn(true)} onClick={async (ev) => {
            const b = ev && ev.currentTarget;
            if (!window.confirm("Permanently delete your Shape account and ALL your data? This cannot be undone.")) return;
            const typed = window.prompt("This erases your account, profile, and data for good. Type DELETE to confirm.");
            if ((typed || "").trim().toUpperCase() !== "DELETE") return;
            if (b) b.disabled = true; // destructive + non-idempotent — block re-clicks while in flight
            try {
              const res = await fetch("/api/account/delete", { method: "POST", credentials: "same-origin" });
              if (res.status === 401) { window.location.href = "/login.html"; return; }
              if (!res.ok) throw new Error("delete failed");
              alert("Your account and data have been deleted.");
              try { if (window.shapeDb && window.shapeDb.client && window.shapeDb.client.auth) await window.shapeDb.client.auth.signOut(); } catch (e) {}
              window.location.href = "/";
            } catch (e) { alert("Could not delete your account right now. Email privacy@theshapecommunity.com."); if (b) b.disabled = false; }
          }}>Close account</button>
        </div>
      </div>
    </section>
  );
}
