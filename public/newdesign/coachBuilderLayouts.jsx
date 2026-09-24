// Three ways to work on ONE document. Layout and step are preferences, never
// prescription data; the builders keep owning edits, uploads, saves and assignment.
const COACH_BUILDER_LAYOUTS = ["guided", "editor", "planner"];

function coachTemplateCopy(template) {
  const detail = JSON.parse(JSON.stringify(template.detail || {}));
  detail.revision = 0;
  // Do not spread the record: ids, recovery state and publication belong to the
  // original. Nested day/meal ids remain consistent with variant override keys.
  return { name: template.name + " (copy)", published: false, detail, sourceName: template.name };
}

function CoachBuilderNav({ layout, onLayout, step, onStep, steps, busy, children }) {
  return <>
    <style>{`
.cbuilder{color:var(--sh-ink, #f2ede4);font-family:var(--sh-font-body, 'Space Grotesk', 'Space Grotesk Fallback', sans-serif);min-width:0}
.cbuilder [hidden]{display:none!important}
.cbuilder *{box-sizing:border-box}
.cbuilder :focus-visible{outline:2px solid var(--sh-accent, #2ee0c4);outline-offset:3px}
.cbuilder .cb-choice{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid var(--sh-line, #302c27)}
.cbuilder .cb-choice p{margin:0;color:var(--sh-ink2, #a09b94);font-size:13px}
.cbuilder .cb-options{display:flex;gap:5px;flex-wrap:wrap}
.cbuilder .cb-button{font:600 14px var(--sh-font-body, 'Space Grotesk', 'Space Grotesk Fallback', sans-serif);min-height:40px;padding:8px 14px;border-radius:8px;border:1px solid var(--sh-line2, #413d38);background:var(--sh-card, #25211d);color:var(--sh-ink, #f2ede4);cursor:pointer}
.cbuilder .cb-button[aria-pressed=true],.cbuilder .cb-button[aria-current=step]{background:var(--sh-accent, #2ee0c4);border-color:var(--sh-accent, #2ee0c4);color:var(--sh-deep, #06231f)}
.cbuilder button:disabled{opacity:.5;cursor:wait}
.cbuilder .cb-steps{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:0 0 16px}
.cbuilder .cb-step{display:flex;align-items:center;gap:9px;text-align:left}
.cbuilder .cb-step span:first-child{font-size:12px;opacity:.8}
.cbuilder .cb-copy{padding:12px 16px;background:var(--sh-rest, #221e19);border-radius:8px;font-size:14px;margin:0 0 16px}
.cbuilder .cb-intro{margin-bottom:16px;max-width:840px}
.cbuilder .cb-intro h2{font:600 22px var(--sh-font-display, 'Fraunces', 'Fraunces Fallback', 'Instrument Serif', serif);margin:0 0 6px}
.cbuilder .cb-intro p{font-size:14px;line-height:1.5;color:var(--sh-ink2, #a09b94);margin:0}
.cbuilder .cb-workspace{display:grid;grid-template-columns:220px minmax(0,1fr);gap:24px;align-items:start}
.cbuilder .cb-days{display:flex;flex-direction:column;gap:7px;min-width:0}
.cbuilder .cb-days button{text-align:left;overflow-wrap:anywhere}
.cbuilder .cb-days select{width:100%;min-height:40px}
.cbuilder .cb-days small{display:block;margin:0 0 6px;color:var(--sh-ink2, #a09b94)}
.cbuilder .cb-foot{position:sticky;bottom:0;z-index:30;background:var(--sh-ground, #1a1612);display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 0;margin-top:24px;border-top:1px solid var(--sh-line, #302c27)}
.cbuilder .cb-foot p{margin:0;font-size:13px;color:var(--sh-ink2, #a09b94)}
.cbuilder .cb-review{border:1px solid var(--sh-line, #302c27);border-radius:12px;padding:20px;margin:16px 0}
.cbuilder .cb-review h2{margin-top:0}
.cbuilder .cb-actions{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0}
.cbuilder .cb-exercise{border-bottom:1px solid var(--sh-line, #302c27);margin-bottom:10px}
.cbuilder .cb-exercise>summary{padding:14px 4px;cursor:pointer;font-weight:600;font-size:15px}
.cbuilder .cb-exercise>summary small{font-size:13px;font-weight:400;color:var(--sh-ink2, #a09b94);margin-left:12px}
.cbuilder .cb-schedule{margin-top:20px}
.cbuilder .cb-schedule>summary{font-size:14px;cursor:pointer;padding:12px 0}
.cbuilder.dbu2 .drawer.float:not(.is-popped){position:static;width:100%;max-height:none;margin:0;overflow:visible;box-shadow:none}
.cbuilder.dbu2 .stage{min-height:0}
.cbuilder.dbu2 .drawer .dh{position:static;flex-wrap:wrap}
.cbuilder.dbu2 .cb-planner-editor{margin:0}
.cbuilder.dbu2 .cb-planner-editor .drawer.is-sidepanel{position:fixed!important;inset:16px 16px 16px auto!important;width:min(600px,calc(100vw - 32px))!important;max-height:calc(100dvh - 32px)!important;margin:0!important;overflow:auto;overscroll-behavior:contain;z-index:55;box-shadow:0 18px 50px rgba(0,0,0,.24)}
.cbuilder.dbu2 .drawer.is-sidepanel .dh{position:sticky;top:0;z-index:2;background:var(--sh-card, #25211d);padding:8px 0}
.cbuilder.dbu2 .cb-choice .tb{margin:0;flex:1;flex-wrap:wrap;gap:8px}
.cbuilder.dbu2 .cb-choice .tb select{max-width:240px}
.cbuilder .cb-details{border-bottom:1px solid var(--sh-line, #302c27);margin:0 0 14px;padding:0 0 4px}
.cbuilder .cb-details>summary{cursor:pointer;padding:10px 0;font-size:14px;font-weight:600}
.cbuilder .cb-details>summary small{margin-left:10px;color:var(--sh-ink2, #a09b94);font-size:12px;font-weight:400}
.cbuilder .cb-details>p{font-size:13px;line-height:1.5;color:var(--sh-ink2, #a09b94);margin:4px 0 12px}
.cbuilder .cb-details .meta{margin-bottom:10px}
.cbuilder .dmb-layout{display:grid;grid-template-columns:240px minmax(0,1fr);gap:20px;align-items:start}
.cbuilder .dmb-side{display:flex;flex-direction:column;gap:14px;min-width:0}
.cbuilder .dmb-content,.cbuilder .dmb-preview{min-width:0}
.cbuilder .dmb-preview{grid-column:1/-1;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}
.cbuilder .dmb-preview>label{grid-column:1/-1;display:flex;align-items:center;gap:10px}
.cbuilder[data-layout=guided] .dmb-layout{display:block}
.cbuilder[data-layout=guided] .dmb-side{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));margin-bottom:20px}
.cbuilder[data-layout=planner] .dmb-layout{display:flex;flex-direction:column}
.cbuilder[data-layout=planner] .dmb-side{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));width:100%}
.cbuilder[data-layout=planner] .dmb-rotation{grid-column:1/-1;grid-row:1}
.cbuilder[data-layout=planner] .dmb-content,.cbuilder[data-layout=planner] .dmb-preview{width:100%}
.cbuilder .dmb-rotation-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px}
.cbuilder .dmb-settings>summary{cursor:pointer;padding:12px 0;font-weight:600}
@media(max-width:760px){
 .cbuilder .cb-workspace,.cbuilder .dmb-layout,.cbuilder .dmb-preview,.cbuilder[data-layout=guided] .dmb-side,.cbuilder[data-layout=planner] .dmb-side{grid-template-columns:1fr}
 .cbuilder .cb-days{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}
 .cbuilder .cb-days label{grid-column:1/-1}
 .cbuilder .cb-steps{gap:4px}
 .cbuilder .cb-step{padding:8px 4px;font-size:12px;flex-direction:column;gap:3px;text-align:center}
 .cbuilder .cb-foot{flex-wrap:wrap}
 .cbuilder .cb-foot p{display:none}
 .cbuilder.dbu2{padding:16px 12px}
 .cbuilder.dbu2 .hd>div{min-width:0!important}
 .cbuilder .dmb-preview{display:block}
 .cbuilder.dbu2 .cb-planner-editor .drawer.is-sidepanel{inset:0!important;width:100%!important;max-height:100dvh!important;border-radius:0}
}
`}</style>
    <div className="cb-choice">
      <div className="cb-options" role="group" aria-label="Builder layout">
        {[["guided", "Guided"], ["editor", "Editor"], ["planner", "Planner"]].map(([key, label]) => <button key={key} type="button" className="cb-button" aria-pressed={layout === key} disabled={busy} onClick={() => onLayout(key)}>{label}</button>)}
      </div>
      {children || <p>Choose how you build. Your plan stays the same.</p>}
    </div>
    {layout === "guided" && <nav className="cb-steps" aria-label="Builder steps">
      {steps.map((label, i) => <button key={label} type="button" className="cb-button cb-step" aria-current={step === i ? "step" : undefined} disabled={busy} onClick={() => onStep(i)}><span>{i + 1}</span><span>{label}</span></button>)}
    </nav>}
  </>;
}

function CoachBuilderFooter({ step, onStep, steps, busy }) {
  return <div className="cb-foot">
    <button type="button" className="cb-button" disabled={busy || step === 0} onClick={() => onStep(step - 1)}>Back</button>
    <p>Step {step + 1} of {steps.length} · {steps[step]}</p>
    {step < steps.length - 1 && <button type="button" className="cb-button" disabled={busy} onClick={() => onStep(step + 1)}>Continue →</button>}
  </div>;
}

Object.assign(window, { COACH_BUILDER_LAYOUTS, CoachBuilderNav, CoachBuilderFooter, coachTemplateCopy });
