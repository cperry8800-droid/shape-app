function AIGeneratorCard({ kind = "workout", role = "trainer", onApply }) {
  const isMeal = kind === "meal_plan";
  const isProgram = kind === "program";
  const [goal, setGoal] = React.useState(isMeal ? "Protein-led cut" : isProgram ? "Marathon strength" : "Upper push strength");
  const [client, setClient] = React.useState(isMeal ? "Riley Kim" : "Alex Rivera");
  const [level, setLevel] = React.useState("Intermediate");
  const [duration, setDuration] = React.useState(isMeal ? "7 days" : isProgram ? "4 weeks" : "60 minutes");
  const [preferences, setPreferences] = React.useState(isMeal ? "high protein, simple prep, no shellfish" : "standard gym, protect right knee");
  const [draft, setDraft] = React.useState(null);
  const [status, setStatus] = React.useState("");

  const generate = async () => {
    setStatus("Generating draft...");
    try {
      const response = await fetch("/api/ai/generate-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          role,
          goal,
          client,
          level,
          duration,
          daysPerWeek: isProgram ? 4 : 1,
          equipment: isMeal ? "" : preferences,
          preferences,
          calories: isMeal ? "2100 kcal" : "",
          protein: isMeal ? "150g" : "",
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to generate draft.");
      setDraft(payload.draft);
      setStatus(payload.source === "openai" ? "AI draft ready. Apply it, then edit before sending." : "Template draft ready. Add OPENAI_API_KEY for AI output.");
    } catch (error) {
      setStatus(error.message || "Unable to generate draft.");
    }
  };

  const field = (label, value, setter) => (
    <label style={{ display: "block" }}>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(242,237,228,0.55)", marginBottom: 6 }}>{label}</div>
      <input value={value} onChange={(e) => setter(e.target.value)} style={{ width: "100%", background: "rgba(242,237,228,0.04)", color: INK, border: "1px solid rgba(242,237,228,0.1)", borderRadius: 8, padding: "10px 12px", fontSize: 14, outline: "none" }} />
    </label>
  );

  return (
    <Card style={{ borderColor: "rgba(30,192,168,0.28)", boxShadow: "0 18px 50px rgba(30,192,168,0.06)" }}>
      <SectionTitle right={draft ? "EDITABLE DRAFT" : "COACH REVIEW REQUIRED"}>{isMeal ? "AI meal-plan generator" : isProgram ? "AI program generator" : "AI workout generator"}</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 12 }}>
        {field("Goal", goal, setGoal)}
        {field("Client", client, setClient)}
        {field("Level", level, setLevel)}
        {field("Length", duration, setDuration)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 170px", gap: 12, alignItems: "end" }}>
        {field(isMeal ? "Food preferences" : "Equipment / constraints", preferences, setPreferences)}
        <button onClick={generate} style={{ background: TEAL, color: PAPER, border: 0, padding: "11px 16px", borderRadius: 8, fontFamily: sans, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Generate draft</button>
      </div>
      {status && <div style={{ marginTop: 10, fontSize: 12, color: "rgba(242,237,228,0.58)" }}>{status}</div>}
      {draft && (
        <div style={{ marginTop: 16, padding: 14, border: "1px solid rgba(242,237,228,0.08)", borderRadius: 10, background: "rgba(242,237,228,0.025)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
            <div>
              <div style={{ fontFamily: serif, fontSize: 22, letterSpacing: "-0.015em" }}>{draft.title}</div>
              <div style={{ marginTop: 5, fontSize: 13, color: "rgba(242,237,228,0.68)", lineHeight: 1.45 }}>{draft.summary}</div>
            </div>
            {onApply && (
              <button onClick={() => onApply(draft)} style={{ flex: "none", background: INK, color: PAPER, border: 0, padding: "10px 14px", borderRadius: 8, fontFamily: sans, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Apply to editor</button>
            )}
          </div>
          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {(draft.blocks || []).slice(0, 6).map((block) => (
              <div key={`${block.label}-${block.title}`} style={{ padding: 10, border: "1px solid rgba(242,237,228,0.08)", borderRadius: 8 }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: TEAL, letterSpacing: "0.1em" }}>{block.label}</div>
                <div style={{ marginTop: 4, fontSize: 13.5, color: INK, fontWeight: 600 }}>{block.title}</div>
                <div style={{ marginTop: 3, fontSize: 12, color: "rgba(242,237,228,0.58)" }}>{block.detail}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
