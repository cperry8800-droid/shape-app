// Trainer — Create a new program. Multi-week training block builder.

function NewProgramPage() {
  const [name, setName] = React.useState("");
  const [weeks, setWeeks] = React.useState(6);
  const [price, setPrice] = React.useState("180");
  const [kind, setKind] = React.useState("one-time");
  const [tag, setTag] = React.useState("SIGNATURE");
  const [goal, setGoal] = React.useState("Strength");
  const [level, setLevel] = React.useState("Intermediate");
  const [summary, setSummary] = React.useState("");
  const [workouts, setWorkouts] = React.useState([
    { week: 1, day: "Mon", title: "Lower — push", ref: "" },
  ]);

  const addWorkout = () => setWorkouts([...workouts, { week: 1, day: "Mon", title: "", ref: "" }]);
  const setWorkout = (i, patch) => setWorkouts(workouts.map((w, j) => j === i ? { ...w, ...patch } : w));
  const removeWorkout = (i) => setWorkouts(workouts.filter((_, j) => j !== i));

  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const tags = ["SIGNATURE", "FOUNDATIONS", "PERFORMANCE", "REHAB", "ENDURANCE", "HYPERTROPHY"];
  const goals = ["Strength", "Hypertrophy", "Fat loss", "Endurance", "General fitness", "Sport-specific"];
  const levels = ["Beginner", "Intermediate", "Advanced"];

  return (
    <DashPage
      navItems={trainerNavItems("programs")}
      payoutCard={trainerPayoutCard}
      eyebrow={<a href="TrainerPrograms.html" style={{ color: "rgba(242,237,228,0.55)" }}>← PROGRAMS</a>}
      title="New program"
      subtitle="A reusable training block you sell once or via subscription. Sessions cascade to every client on the block — their history stays intact."
      actions={<>
        <a href="TrainerPrograms.html" style={{ background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.25)", padding: "10px 20px", borderRadius: 999, fontFamily: sans, fontSize: 13, cursor: "pointer" }}>Cancel</a>
        <button onClick={() => alert("Saved as draft.")} style={{ background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.25)", padding: "10px 20px", borderRadius: 999, fontFamily: sans, fontSize: 13, cursor: "pointer" }}>Save draft</button>
        <button onClick={() => { alert("Program published."); window.location.href = "TrainerPrograms.html"; }} style={{ background: TEAL, color: PAPER, border: 0, padding: "10px 22px", borderRadius: 999, fontFamily: sans, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Publish →</button>
      </>}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 20 }}>
        {/* LEFT — form */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card>
            <SectionTitle>Basics</SectionTitle>
            <Field label="Program name">
              <TextInput value={name} onChange={setName} placeholder="e.g. Strength + hybrid (12w)" />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
              <Field label="Duration">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <NumInput value={weeks} onChange={setWeeks} min={1} max={52} />
                  <span style={{ fontSize: 13, color: "rgba(242,237,228,0.55)" }}>weeks</span>
                </div>
              </Field>
              <Field label="Goal">
                <Select value={goal} onChange={setGoal} options={goals} />
              </Field>
              <Field label="Level">
                <Select value={level} onChange={setLevel} options={levels} />
              </Field>
            </div>
            <Field label="Category tag">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {tags.map(t => (
                  <button key={t} onClick={() => setTag(t)} style={{
                    padding: "7px 12px", borderRadius: 4, fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 10.5, letterSpacing: "0.08em", cursor: "pointer",
                    background: tag === t ? TEAL : "rgba(242,237,228,0.06)",
                    color: tag === t ? PAPER : "rgba(242,237,228,0.7)",
                    border: tag === t ? "none" : "1px solid rgba(242,237,228,0.12)",
                  }}>{t}</button>
                ))}
              </div>
            </Field>
            <Field label="Summary (shown on your public profile)">
              <TextArea value={summary} onChange={setSummary} rows={3} placeholder="One or two sentences on what this program does and who it's for." />
            </Field>
          </Card>

          <Card>
            <SectionTitle right={`${workouts.length} WORKOUT${workouts.length === 1 ? "" : "S"}`}>Schedule</SectionTitle>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {workouts.map((w, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "72px 80px 1fr 1.4fr 28px", gap: 10, alignItems: "center", padding: "10px 12px", background: "rgba(242,237,228,0.03)", border: "1px solid rgba(242,237,228,0.08)", borderRadius: 8 }}>
                  <Select value={`W${w.week}`} onChange={(v) => setWorkout(i, { week: Number(v.slice(1)) })} options={Array.from({ length: weeks }, (_, k) => `W${k + 1}`)} compact />
                  <Select value={w.day} onChange={(v) => setWorkout(i, { day: v })} options={days} compact />
                  <TextInput value={w.title} onChange={(v) => setWorkout(i, { title: v })} placeholder="Workout title" compact />
                  <TextInput value={w.ref} onChange={(v) => setWorkout(i, { ref: v })} placeholder="Attach a workout (from your library)" compact />
                  <button onClick={() => removeWorkout(i)} aria-label="Remove" style={{ background: "transparent", border: 0, color: "rgba(242,237,228,0.5)", fontSize: 18, cursor: "pointer", lineHeight: 1 }}>×</button>
                </div>
              ))}
            </div>
            <button onClick={addWorkout} style={{ marginTop: 14, background: "transparent", color: TEAL_BRIGHT, border: "1px dashed rgba(30,192,168,0.35)", padding: "10px 14px", borderRadius: 8, fontFamily: sans, fontSize: 13, cursor: "pointer", width: "100%" }}>+ Add workout</button>
            <div style={{ marginTop: 14, fontSize: 12, color: "rgba(242,237,228,0.5)" }}>
              Tip — leave workouts empty to fill in later, or link to ones already in your library.
              <a href="TrainerNewWorkout.html" style={{ color: TEAL_BRIGHT, marginLeft: 6 }}>Build a new workout →</a>
            </div>
          </Card>
        </div>

        {/* RIGHT — pricing + preview */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card>
            <SectionTitle>Pricing</SectionTitle>
            <Field label="Billing model">
              <div style={{ display: "flex", gap: 8 }}>
                {[["one-time", "One-time"], ["subscription", "Subscription"]].map(([v, l]) => (
                  <button key={v} onClick={() => setKind(v)} style={{
                    flex: 1, padding: "10px 14px", borderRadius: 8, cursor: "pointer",
                    background: kind === v ? INK : "rgba(242,237,228,0.04)",
                    color: kind === v ? PAPER : INK,
                    border: kind === v ? `1px solid ${TEAL}` : "1px solid rgba(242,237,228,0.1)",
                    fontFamily: sans, fontSize: 13, fontWeight: kind === v ? 500 : 400,
                  }}>{l}</button>
                ))}
              </div>
            </Field>
            <Field label={`Price ${kind === "subscription" ? "per month" : "(one-time)"}`}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.1)", borderRadius: 8, padding: "0 12px" }}>
                <span style={{ color: "rgba(242,237,228,0.55)" }}>$</span>
                <input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))} style={{ flex: 1, background: "transparent", border: 0, color: INK, fontSize: 14, padding: "10px 0", outline: "none" }} />
                <span style={{ color: "rgba(242,237,228,0.5)", fontSize: 12 }}>{kind === "subscription" ? "/mo" : ""}</span>
              </div>
            </Field>
            <div style={{ fontSize: 12, color: "rgba(242,237,228,0.55)", lineHeight: 1.5 }}>
              Shape keeps 8%. You receive <span style={{ color: INK, fontWeight: 500 }}>${price ? (Number(price) * 0.92).toFixed(2) : "—"}</span> per sale.
              Weekly payouts via Stripe Connect.
            </div>
          </Card>

          <Card>
            <SectionTitle>Preview</SectionTitle>
            <div style={{ background: "rgba(242,237,228,0.02)", border: "1px solid rgba(242,237,228,0.08)", borderRadius: 10, padding: 18 }}>
              <div style={{ height: 120, borderRadius: 6, background: "linear-gradient(135deg, rgba(30,192,168,0.16), rgba(242,237,228,0.04))", marginBottom: 14, display: "flex", alignItems: "flex-end", padding: 12 }}>
                <Pill>{tag}</Pill>
              </div>
              <div style={{ fontFamily: serif, fontSize: 19, marginBottom: 6 }}>{name || "Untitled program"}</div>
              <div style={{ fontSize: 12, color: "rgba(242,237,228,0.6)" }}>
                {weeks}w · {goal} · {level} · {kind === "subscription" ? `$${price || 0}/mo` : `$${price || 0}`}
              </div>
              <div style={{ marginTop: 12, fontSize: 13, color: "rgba(242,237,228,0.72)", lineHeight: 1.5 }}>
                {summary || "Your summary will appear here."}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </DashPage>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.1em", color: "rgba(242,237,228,0.55)", marginBottom: 6, textTransform: "uppercase" }}>{label}</div>
      {children}
    </label>
  );
}
function TextInput({ value, onChange, placeholder, compact }) {
  return <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={{ width: "100%", background: compact ? "transparent" : "rgba(242,237,228,0.04)", color: INK, border: compact ? 0 : "1px solid rgba(242,237,228,0.1)", borderRadius: 8, padding: compact ? "6px 8px" : "10px 12px", fontSize: 14, outline: "none" }} />;
}
function TextArea({ value, onChange, placeholder, rows = 3 }) {
  return <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows} style={{ width: "100%", background: "rgba(242,237,228,0.04)", color: INK, border: "1px solid rgba(242,237,228,0.1)", borderRadius: 8, padding: "10px 12px", fontSize: 14, outline: "none", resize: "vertical" }} />;
}
function NumInput({ value, onChange, min, max }) {
  return <input type="number" value={value} min={min} max={max} onChange={(e) => onChange(Number(e.target.value) || 0)} style={{ width: 80, background: "rgba(242,237,228,0.04)", color: INK, border: "1px solid rgba(242,237,228,0.1)", borderRadius: 8, padding: "10px 12px", fontSize: 14, outline: "none" }} />;
}
function Select({ value, onChange, options, compact }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ width: "100%", background: compact ? "transparent" : "rgba(242,237,228,0.04)", color: INK, border: compact ? 0 : "1px solid rgba(242,237,228,0.1)", borderRadius: 8, padding: compact ? "6px 6px" : "10px 12px", fontSize: 14, outline: "none", appearance: "none" }}>
      {options.map(o => <option key={o} value={o} style={{ background: "#14110e" }}>{o}</option>)}
    </select>
  );
}
