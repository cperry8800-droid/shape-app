
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

// Marketplace listing photos — the coach dresses their marketplace box (portrait,
// cover, studio gallery) from the dashboard. Reads/writes the coach's OWN provider
// row directly via window.shapeDb.client (owner-scoped RLS + the admin-column
// guard). Role is the dashboard's own (Trainer vs Nutritionist page). Media is
// normalized by the canonical ShapeListingLib at both write and (server-side)
// render, so an invalid/foreign URL never persists or shows.
function CoachListingMediaCard() {
  const mono = "'JetBrains Mono', monospace";
  const sans = "'Space Grotesk', sans-serif";
  const rust = "#e07856";
  const teal = (typeof window !== "undefined" && window.TEAL_BRIGHT) || "#2ee0c4"; // pageShell's shared TEAL_BRIGHT; literal fallback if it hasn't loaded
  const lib = (typeof window !== "undefined" && window.ShapeListingLib) || null;
  const GMAX = (lib && lib.BS_LISTING_GALLERY_MAX) || 6;
  const CMAX = (lib && lib.BS_LISTING_CAPTION_MAX) || 80;
  const role = /nutrition/i.test(typeof window !== "undefined" ? window.location.pathname : "") ? "nutritionist" : "trainer";
  const table = role === "nutritionist" ? "nutritionists" : "trainers";
  const [meta, setMeta] = React.useState({ loading: true, signedIn: true, hasRow: true, loadError: false });
  const [uid, setUid] = React.useState(null);
  const [portrait, setPortrait] = React.useState(null);
  const [cover, setCover] = React.useState(null);
  const [gallery, setGallery] = React.useState([]); // [{ id, url, caption }]
  const nextId = React.useRef(0);
  const [busy, setBusy] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    const cl = window.shapeDb && window.shapeDb.client;
    if (!cl || !cl.auth) { setMeta({ loading: false, signedIn: false, hasRow: false, loadError: false }); return undefined; }
    let on = true;
    setMeta((s) => ({ ...s, loading: true, loadError: false }));
    (async () => {
      try {
        const { data: ud } = await cl.auth.getUser();
        const id = ud && ud.user && ud.user.id;
        if (!on) return;
        if (!id) { setMeta({ loading: false, signedIn: false, hasRow: false, loadError: false }); return; }
        setUid(id);
        const r = await cl.from(table).select("listing_media").eq("owner_id", id).maybeSingle();
        if (!on) return;
        if (r.error) throw r.error;
        if (!r.data) { setMeta({ loading: false, signedIn: true, hasRow: false, loadError: false }); return; }
        // Without the normalizer we can't safely READ or later WRITE — treat a
        // missing guard as a load failure (Retry), never an empty editor that
        // Save would then persist over the coach's real photos.
        if (!lib || !lib.bsNormalizeListingMedia) throw new Error("listing guard unavailable");
        const m = lib.bsNormalizeListingMedia(r.data.listing_media, id);
        setPortrait(m.portrait || null);
        setCover(m.cover || null);
        setGallery((Array.isArray(m.gallery) ? m.gallery : []).map((g) => ({ id: nextId.current++, url: g.url, caption: g.caption || "" })));
        setMeta({ loading: false, signedIn: true, hasRow: true, loadError: false });
      } catch (e) { if (on) setMeta({ loading: false, signedIn: true, hasRow: true, loadError: true }); }
    })();
    return () => { on = false; };
  }, [table, reloadKey]);

  const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif"];
  const IMAGE_EXTS = ["jpg", "jpeg", "png", "webp", "gif", "heic", "heif"];
  const okImage = (file) => {
    const t = (file.type || "").toLowerCase();
    if (t) return IMAGE_MIMES.includes(t);
    const ext = (file.name || "").toLowerCase().split(".").pop();
    return IMAGE_EXTS.includes(ext);
  };
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(""), 2800); };
  const uploadImage = async (file) => {
    const cl = window.shapeDb && window.shapeDb.client;
    if (!file || !cl || !uid) return null;
    if (!okImage(file) || file.size > 10 * 1024 * 1024) { flash("Images only, under 10 MB."); return null; }
    setUploading(true);
    try {
      const nameExt = (file.name && file.name.includes(".")) ? file.name.split(".").pop() : "";
      const ext = ((file.type && file.type.split("/")[1]) || nameExt || "jpg").replace(/[^a-z0-9]/gi, "") || "jpg";
      const EXT_MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", heic: "image/heic", heif: "image/heif" };
      const path = `${uid}/listing/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
      const { error } = await cl.storage.from("coach-media").upload(path, file, { contentType: file.type || EXT_MIME[ext.toLowerCase()] || "image/jpeg", upsert: false });
      if (error) throw error;
      const { data } = cl.storage.from("coach-media").getPublicUrl(path);
      return (data && data.publicUrl) || null;
    } catch (e) { flash((e && e.message) || "Upload failed."); return null; }
    finally { setUploading(false); }
  };
  const pickSlot = (setter) => async (e) => {
    const file = e.target.files && e.target.files[0]; if (e.target) e.target.value = "";
    const url = await uploadImage(file); if (url) setter(url);
  };
  const pickGallery = async (e) => {
    const file = e.target.files && e.target.files[0]; if (e.target) e.target.value = "";
    if (gallery.length >= GMAX) return;
    const url = await uploadImage(file); if (url) setGallery((p) => (p.length >= GMAX ? p : [...p, { id: nextId.current++, url, caption: "" }]));
  };
  const setCap = (id, v) => setGallery((p) => p.map((g) => (g.id === id ? { ...g, caption: v.slice(0, CMAX) } : g)));
  const rmGal = (id) => setGallery((p) => p.filter((g) => g.id !== id));
  const save = async () => {
    const cl = window.shapeDb && window.shapeDb.client;
    if (busy || uploading || !cl || !uid) return;
    setBusy(true); setMsg("");
    try {
      // Backstop: never write an un-normalized doc (the load effect already
      // blocks the editor when the guard is missing).
      if (!lib || !lib.bsNormalizeListingMedia) throw new Error("Couldn't save — reload the page and try again.");
      const raw = { portrait, cover, gallery: gallery.map((g) => ({ url: g.url, caption: g.caption })), updatedAt: new Date().toISOString() };
      const clean = lib.bsNormalizeListingMedia(raw, uid);
      const { data: rows, error } = await cl.from(table).update({ listing_media: clean }).eq("owner_id", uid).select("id");
      if (error) throw error;
      if (!rows || !rows.length) throw new Error("Your coach listing was not found.");
      flash("Listing saved ✓");
    } catch (e) { flash((e && e.message) || "Could not save — try again."); }
    finally { setBusy(false); }
  };

  const card = { background: "rgba(242,237,228,0.03)", border: "1px solid rgba(242,237,228,0.1)", borderRadius: 16, padding: "20px 22px", marginBottom: 16 };
  const kick = { fontFamily: mono, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(242,237,228,0.5)" };
  const lbl = { fontFamily: mono, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(242,237,228,0.55)" };
  const fileBtn = { display: "inline-block", cursor: "pointer", fontFamily: sans, fontSize: 12, color: "rgba(242,237,228,0.8)", border: "1px solid rgba(242,237,228,0.25)", borderRadius: 9, padding: "8px 12px" };
  const linkBtn = { background: "transparent", border: 0, cursor: "pointer", fontFamily: mono, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(242,237,228,0.5)", padding: "8px 4px" };
  const input = { background: "rgba(0,0,0,0.2)", border: "1px solid rgba(242,237,228,0.18)", borderRadius: 9, padding: "9px 11px", color: "#f2ede4", fontFamily: sans, fontSize: 12.5, outline: "none", minWidth: 0, flex: 1 };
  const thumb = (url, w, h) => ({ width: w, height: h, flex: "none", borderRadius: 10, border: "1px solid rgba(242,237,228,0.16)", background: url ? `center/cover no-repeat url("${url}")` : "rgba(0,0,0,0.2)" });
  const slot = (label, url, ctl, wide) => (
    <div style={{ padding: "12px 0", borderTop: "1px solid rgba(242,237,228,0.08)" }}>
      <div style={lbl}>{label}</div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
        <div aria-hidden="true" style={thumb(url, wide ? 108 : 60, 60)} />
        <label style={fileBtn}>{url ? "↻ Replace" : "＋ Add photo"}<input type="file" accept="image/*" style={{ display: "none" }} disabled={uploading || busy} onChange={pickSlot(ctl.set)} /></label>
        {url ? <button style={linkBtn} onClick={() => ctl.clear()}>× Remove</button> : null}
      </div>
    </div>
  );

  return (
    <div style={card}>
      <div style={{ ...kick, marginBottom: 14 }}>Marketplace listing · photos</div>
      {meta.loading ? (
        <div style={{ fontFamily: mono, fontSize: 11, color: "rgba(242,237,228,0.4)" }}>Loading…</div>
      ) : meta.loadError ? (
        <div>
          <div style={{ fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.65)" }}>Couldn't load your listing photos — your saved photos are untouched. Try again.</div>
          <button style={{ ...fileBtn, marginTop: 12 }} onClick={() => setReloadKey((k) => k + 1)}>Retry</button>
        </div>
      ) : !meta.signedIn ? (
        <div style={{ fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.6)" }}>Sign in as a coach to manage your listing photos.</div>
      ) : !meta.hasRow ? (
        <div style={{ fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.6)" }}>Your listing box appears once your coach application is approved.</div>
      ) : (
        <>
          <p style={{ fontFamily: sans, fontSize: 12.5, color: "rgba(242,237,228,0.6)", margin: "0 0 4px", lineHeight: 1.5 }}>Your box on the marketplace — a portrait of you, a cover (the box's background), and a studio gallery of your space.</p>
          {slot("Portrait · you", portrait, { set: setPortrait, clear: () => setPortrait(null) }, false)}
          {slot("Cover · your background", cover, { set: setCover, clear: () => setCover(null) }, true)}
          <div style={{ padding: "12px 0", borderTop: "1px solid rgba(242,237,228,0.08)" }}>
            <div style={lbl}>{`Studio gallery · up to ${GMAX}`}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
              {gallery.map((g) => (
                <div key={g.id} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <div aria-hidden="true" style={thumb(g.url, 52, 52)} />
                  <input aria-label="Caption" style={input} placeholder="Caption" maxLength={CMAX} value={g.caption} onChange={(e) => setCap(g.id, e.target.value)} />
                  <button aria-label="Remove" style={{ ...linkBtn, fontSize: 15, color: rust }} onClick={() => rmGal(g.id)}>×</button>
                </div>
              ))}
            </div>
            {gallery.length < GMAX ? (
              <label style={{ ...fileBtn, marginTop: 10 }}>＋ Add photo<input type="file" accept="image/*" style={{ display: "none" }} disabled={uploading || busy} onChange={pickGallery} /></label>
            ) : null}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, paddingTop: 14, borderTop: "1px solid rgba(242,237,228,0.08)", flexWrap: "wrap" }}>
            <div style={{ fontFamily: mono, fontSize: 10.5, color: "rgba(242,237,228,0.5)", minHeight: 14 }}>{msg}</div>
            <button onClick={save} disabled={busy || uploading} style={{ background: (busy || uploading) ? "rgba(46,224,196,0.25)" : teal, color: "#0b0e0c", border: 0, borderRadius: 999, padding: "10px 18px", fontFamily: sans, fontSize: 12.5, fontWeight: 600, cursor: (busy || uploading) ? "default" : "pointer" }}>{busy ? "Saving…" : "Save listing"}</button>
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
      <CoachListingMediaCard />
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
