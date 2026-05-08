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
      setStatus(payload.source === "openai" ? "AI draft ready. Edit anything below, then apply it." : "Template draft ready. Edit anything below, then apply it. Add OPENAI_API_KEY for AI output.");
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
  const editInput = (value, onChange, placeholder, extra = {}) => (
    <input
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: "100%",
        background: "rgba(242,237,228,0.045)",
        color: INK,
        border: "1px solid rgba(242,237,228,0.12)",
        borderRadius: 8,
        padding: "9px 10px",
        fontSize: 13,
        outline: "none",
        ...extra,
      }}
    />
  );
  const editArea = (value, onChange, placeholder, extra = {}) => (
    <textarea
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={2}
      style={{
        width: "100%",
        resize: "vertical",
        background: "rgba(242,237,228,0.045)",
        color: INK,
        border: "1px solid rgba(242,237,228,0.12)",
        borderRadius: 8,
        padding: "9px 10px",
        fontSize: 13,
        lineHeight: 1.35,
        outline: "none",
        ...extra,
      }}
    />
  );
  const updateDraft = (patch) => setDraft((current) => ({ ...current, ...patch }));
  const updateDraftBlock = (index, patch) => setDraft((current) => ({
    ...current,
    blocks: (current.blocks || []).map((block, i) => i === index ? { ...block, ...patch } : block),
  }));
  const removeDraftBlock = (index) => setDraft((current) => ({
    ...current,
    blocks: (current.blocks || []).filter((_, i) => i !== index),
  }));
  const addDraftBlock = () => setDraft((current) => ({
    ...current,
    blocks: [
      ...(current.blocks || []),
      { label: String.fromCharCode(65 + ((current.blocks || []).length % 26)), title: "New block", detail: "", note: "" },
    ],
  }));

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
            <div style={{ flex: 1, display: "grid", gap: 8 }}>
              {editInput(draft.title, (value) => updateDraft({ title: value }), "Draft title", { fontFamily: serif, fontSize: 20, letterSpacing: "-0.015em" })}
              {editArea(draft.summary, (value) => updateDraft({ summary: value }), "Draft summary")}
            </div>
            {onApply && (
              <button onClick={() => onApply(draft)} style={{ flex: "none", background: INK, color: PAPER, border: 0, padding: "10px 14px", borderRadius: 8, fontFamily: sans, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Apply edits</button>
            )}
          </div>
          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {(draft.blocks || []).slice(0, 8).map((block, index) => (
              <div key={`${index}-${block.label}`} style={{ padding: 10, border: "1px solid rgba(242,237,228,0.08)", borderRadius: 8 }}>
                <div style={{ display: "grid", gridTemplateColumns: "64px 1fr 28px", gap: 8, alignItems: "center", marginBottom: 8 }}>
                  {editInput(block.label, (value) => updateDraftBlock(index, { label: value }), "A", { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: TEAL_BRIGHT, letterSpacing: "0.1em", textTransform: "uppercase" })}
                  {editInput(block.title, (value) => updateDraftBlock(index, { title: value }), "Block title", { fontWeight: 600 })}
                  <button onClick={() => removeDraftBlock(index)} aria-label="Remove block" style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid rgba(242,237,228,0.12)", background: "rgba(242,237,228,0.04)", color: "rgba(242,237,228,0.72)", cursor: "pointer" }}>x</button>
                </div>
                {editArea(block.detail, (value) => updateDraftBlock(index, { detail: value }), isMeal ? "Meal details" : isProgram ? "Week or block details" : "Sets, reps, load, or timing")}
                {editInput(block.note, (value) => updateDraftBlock(index, { note: value }), "Coach note / cue", { marginTop: 8, fontSize: 12 })}
              </div>
            ))}
          </div>
          <button onClick={addDraftBlock} style={{ marginTop: 10, width: "100%", background: "transparent", color: TEAL_BRIGHT, border: "1px dashed rgba(30,192,168,0.35)", padding: "10px 14px", borderRadius: 8, fontFamily: sans, fontSize: 13, cursor: "pointer" }}>+ Add editable block</button>
        </div>
      )}
    </Card>
  );
}
