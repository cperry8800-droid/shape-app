
// Dashboard Profile = the LIVING profile itself (profile-first, like the app's
// Me tab). "✎ Customize profile" on the page edits it; the dashboard-only
// pieces (back link + danger zone) ride below the profile.
function DashProfileExtras() {
  const mono = "'JetBrains Mono', monospace";
  const btn = (danger) => ({ background: "transparent", color: danger ? "#e07856" : "rgba(242,237,228,0.7)", border: `1px solid ${danger ? "rgba(224,120,86,0.4)" : "rgba(242,237,228,0.2)"}`, padding: "14px 16px", borderRadius: 10, fontSize: 13, cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif", textAlign: "left" });
  return (
    <section style={{ maxWidth: 900, margin: "0 auto", padding: "26px 40px 34px" }}>
      <div style={{ background: "rgba(242,237,228,0.03)", border: "1px solid rgba(242,237,228,0.1)", borderRadius: 16, padding: "20px 22px" }}>
        <div style={{ fontFamily: mono, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(242,237,228,0.5)", marginBottom: 14 }}>Account · Danger zone</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }} className="dk-3up">
          <button style={btn(false)}>Export client data</button>
          <button style={btn(false)}>Pause coach profile</button>
          <button style={btn(true)}>Close account</button>
        </div>
      </div>
    </section>
  );
}
