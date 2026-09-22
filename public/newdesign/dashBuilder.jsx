// Trainer Programs v2 — library + performance zones and the workout builder
// (dashboard-v2 spec step). Logic lives in dashBuilderCore.js (pure, tested);
// this file is UI. Templates persist to /api/coach/plans (detail.builder —
// the same store the mobile builder and marketplace share); assignment
// snapshots into client_workouts via /api/trainer/workout, which is what the
// client today-rail, calendar, and app already read. Signed out / API down:
// the demo templates render under the demo band, and drafts go to
// localStorage so the builder is fully usable in preview.
//
// Load order: pageShell → trainerDashboard → coachNav → dashSignals →
// dashData → dashToday → dashClient (DashWorkoutCard) → dashBuilderCore →
// this file.

// ⚠ THE BUILDER IS THE CONCEPT BOARD'S LIGHT PAPER, NOT THE DASHBOARD'S DARK BROADSHEET.
// The round-one concepts kept the dark newspaper chrome and the tree-beside-editor layout
// and the owner said no to all of it; the board's own lede is "these three start from a
// white page, real controls, readable type, and dates you can see". So every value below is
// lifted from the approved artboards (`.ab2` in the G · Grid ⇄ Sheet board) rather than
// re-invented: 14px body text where this file used 8.5px mono, 40px controls, 9–10px radii,
// white cards on #f4f6f5.
// ⚠ SCOPED TO THE BUILDER, because the global paper switch is PR 5 and PRs 3–4 have not yet
// swept Business · Goals · Progress · Train · Nutri · Settings · Playlists. Flipping
// `dash.css`'s tokens now would make the swept surfaces light and the unswept ones dark. The
// surrounding shell turns light with PR 5; this is the surface the redesign is about.
const DBU_PG = "#f4f6f5", DBU_WH = "#ffffff";
const DBU_INK = "#15211e", DBU_INK2 = "#5a6763", DBU_INK3 = "#8a9490";
const DBU_LINE = "#e1e6e3", DBU_LINE2 = "#c9d2ce";
const DBU_TEAL = "#0a8f87", DBU_TEALBG = "#e2f2f0";
const DBU_RUST = "#c0533b", DBU_RUSTBG = "#fbeae5";
const DBU_GOLD = "#a07a2e", DBU_GOLDBG = "#f7eed8";
const DBU_REST = "#edf0ee";
const DBU_INK50 = DBU_INK2;
const DBU_MONO = "'JetBrains Mono', monospace";
const DBU_DISPLAY = "'Anybody', system-ui, sans-serif";
const DBU_BODY = "'Schibsted Grotesk', system-ui, sans-serif";

// `.btn` / `.btn.pri` from the board.
function dbuBtn(primary, c) {
  const col = c || DBU_TEAL;
  const base = { display: "inline-flex", alignItems: "center", gap: 7, height: 40, padding: "0 16px", borderRadius: 9, fontFamily: DBU_BODY, fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer", boxSizing: "border-box" };
  return primary
    ? { ...base, background: col, border: "1px solid " + col, color: "#fff" }
    : { ...base, background: DBU_WH, border: "1px solid " + DBU_LINE2, color: DBU_INK };
}
// `.fld` and `.lbl`.
const dbuField = { boxSizing: "border-box", display: "flex", alignItems: "center", height: 40, padding: "0 12px", borderRadius: 9, border: "1px solid " + DBU_LINE2, background: DBU_WH, fontFamily: DBU_BODY, fontSize: 14, color: DBU_INK, outline: "none" };
const dbuLabel = { fontFamily: DBU_BODY, fontSize: 12.5, color: DBU_INK2, fontWeight: 600, marginBottom: 5, display: "block" };

function dbuGoalTag(key) {
  return DashBuilder.GOAL_TAGS.find((g) => g.key === key) || DashBuilder.GOAL_TAGS[1];
}

// ── Dates ────────────────────────────────────────────────────────────────────
// ⚠ F2 (P0): NOTHING IN THIS BUILDER EVER SHOWED A DATE. The client's page and the app
// are both dated, and the first date a coach saw was inside a collapsed <details> in the
// Assign modal — so a program was written blind and its shape on a real calendar was a
// surprise at assign time.
//
// ⚠ AND EVERY DATE DRAWN HERE COMES FROM THE FUNCTION THAT ASSIGNS THEM, never from a
// second copy of the rule. `DashBuilder.buildAssignmentRows` is what actually writes
// `scheduledDate` onto every row; deriving the sheet from any other arithmetic would let
// the preview and the assignment disagree, which is worse than showing no date at all.
const DBU_DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// Same order and same indices as DBU_DOW — the day editor's Training-day select spells
// them out where the Grid's column heads abbreviate.
const DBU_DOW_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DBU_MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function dbuISO(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
// The Assign modal's own next-Monday rule, lifted so the two cannot drift apart.
function dbuNextMonday() {
  const d = new Date();
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  return dbuISO(d);
}
function dbuParseISO(iso) {
  const d = new Date(String(iso) + "T00:00:00");
  return Number.isFinite(d.getTime()) ? d : null;
}
// ⚠ THE REFERENCE START SNAPS TO ITS MONDAY, because the Grid draws Mon–Sun columns and
// `builderToAssignmentRows` offsets each day from the START's weekday, not from a Monday
// (`workoutDocument.js:98`). Measured on a Mon/Wed/Fri program with a WEDNESDAY start: each
// Grid row then spans TWO calendar weeks and its dates run BACKWARDS across it — Monday's
// cell reads 28 Sep beside Wednesday's 23 Sep — while the week header, which takes the
// earliest date in the row, contradicts its own first cell. The field's label already says
// "Reference start Monday" and the default is `dbuNextMonday()`; only the input accepted
// anything else. `previewStart` is read in exactly ONE place and reaches nothing at assign
// (each client's real start is chosen there), so snapping costs no scheduling accuracy.
// (CodeRabbit, #2143.) An unusable value yields null and the caller keeps what it had.
function dbuMondayOf(iso) {
  const d = dbuParseISO(iso);
  if (!d) return null;
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return dbuISO(d);
}
function dbuShortDate(iso) {
  const d = dbuParseISO(iso);
  return d ? DBU_DOW[(d.getDay() + 6) % 7] + " " + d.getDate() + " " + DBU_MON[d.getMonth()] : "";
}
function dbuDayMonth(iso) {
  const d = dbuParseISO(iso);
  return d ? d.getDate() + " " + DBU_MON[d.getMonth()] : "";
}

// ── Weekday defaults ─────────────────────────────────────────────────────────
// ⚠ F3 (P0): `newDay` carried NO weekday, and `builderToAssignmentRows` falls back to the
// day's INDEX when one is missing (workoutDocument.js:98) — so a two-session week landed
// on Mon and TUE with five empty days after it, and nothing on screen said so. The table
// is the brief's: 1 → Mon · 2 → Mon Thu · 3 → Mon Wed Fri · 4 → Mon Tue Thu Fri ·
// 5 → Mon–Fri · 6 → Mon–Sat · 7 → every day.
// ⚠ PAST SEVEN DAYS A WEEK THE COLLISION IS ARITHMETIC — a week has seven weekdays — so
// the extras cycle and the sheet DRAWS two bands on one date. That is the improvement:
// today the identical collision happens silently at assign time (F12).
const DBU_WEEKDAYS = { 1: [0], 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 5], 7: [0, 1, 2, 3, 4, 5, 6] };
function dbuDefaultWeekdays(n) {
  if (DBU_WEEKDAYS[n]) return DBU_WEEKDAYS[n].slice();
  return Array.from({ length: Math.max(0, n) }, (_, i) => i % 7);
}
const dbuHasWeekday = (d) => !!d && Number.isInteger(d.weekday) && d.weekday >= 0 && d.weekday <= 6;
// Give a legacy document weekdays ON LOAD, per week, in order, leaving any the coach has
// already set alone.
// ⚠ APPLIED IN THE BUILDER RATHER THAN IN THE SHARED NORMALISER (`workoutDocument.js`),
// which the API route also runs: rewriting stored documents server-side is a far larger
// blast radius than one PR should take, and doing it here is where the coach can SEE the
// result before assigning. A document assigned straight from the library without ever
// being opened keeps today's behaviour — a no-op, not a regression — and the fallback
// branch of `builderToAssignmentRows` stays as the guard it was written to be.
function dbuWithWeekdays(doc) {
  if (!doc || !Array.isArray(doc.weeks)) return doc;
  if (doc.weeks.every((w) => (w.days || []).every(dbuHasWeekday))) return doc;
  return {
    ...doc,
    weeks: doc.weeks.map((w) => {
      const days = w.days || [];
      if (days.every(dbuHasWeekday)) return w;
      const taken = new Set(days.filter(dbuHasWeekday).map((d) => d.weekday));
      const free = dbuDefaultWeekdays(days.length).filter((x) => !taken.has(x));
      let k = 0;
      return {
        ...w,
        days: days.map((d) => {
          if (dbuHasWeekday(d)) return d;
          const wd = free[k] != null ? free[k] : k % 7;
          k += 1;
          return { ...d, weekday: wd };
        }),
      };
    }),
  };
}
// The next weekday a new day in this week should take: the first the week is not using.
function dbuNextFreeWeekday(week) {
  const taken = new Set((week.days || []).filter(dbuHasWeekday).map((d) => d.weekday));
  const table = dbuDefaultWeekdays((week.days || []).length + 1);
  const free = table.find((x) => !taken.has(x));
  if (free != null) return free;
  for (let i = 0; i < 7; i += 1) if (!taken.has(i)) return i;
  return 0;
}

// ⚠ ASSIGNING A WEEKDAY IS A SWAP, NOT AN OVERWRITE, AND THIS IS ITS ONLY IMPLEMENTATION.
// The Grid finds a day BY WEEKDAY (`findIndex(d => d.weekday === wd)`), so two days in one
// week sharing a weekday leaves the second UNREACHABLE: it cannot be rendered, selected or
// edited, while the document still holds it and Sheet still lists it. Exchanging the two
// days' values keeps the week a permutation, so that state is unrepresentable rather than
// merely avoided at each call site.
// ⚠ BOTH WRITERS ROUTE THROUGH HERE, and the second is why this is a module helper rather
// than a closure: the Grid's drag lives in `DbuGrid` and the day editor's Training-day
// select lives in `DbuBuilder`, so a shared rule cannot be a local function of either. The
// select wrote through a blind positional replace until #2143 — picking a weekday another
// day already held produced exactly the collision the drag had just been fixed to prevent,
// through the ORDINARY control rather than a deliberate drop onto an occupied cell.
// A source with no weekday ("In sequence from start") is legitimate here and is NOT refused:
// the displaced day takes its absent weekday, which is still a permutation and still leaves
// no two days sharing one. Passing `undefined` therefore clears a day's weekday and, because
// no day can equal it, disturbs nothing else — so clearing needs no separate path.
// Which OTHER day in this week holds each weekday, for the select's option labels. Read
// per render rather than memoised: it is at most seven entries, and a hook here would sit
// below `week`/`day` in `DbuBuilder` where a later early return could change the hook order.
function dbuTakenByWeekday(week, di) {
  const out = {};
  ((week && week.days) || []).forEach((d, j) => {
    if (j !== di && dbuHasWeekday(d)) out[d.weekday] = d.name || ("Day " + (j + 1));
  });
  return out;
}
function dbuAssignWeekday(week, di, weekday) {
  const days = (week && week.days) || [];
  const from = days[di];
  if (!from) return week;
  return {
    ...week,
    days: days.map((d, j) => {
      if (j === di) return { ...d, weekday };
      if (dbuHasWeekday(d) && d.weekday === weekday) return { ...d, weekday: from.weekday };
      return d;
    }),
  };
}

// Every date the assignment would write, keyed "week:day" — one call, one source of truth.
// ⚠ A meta object is passed rather than null because `builderToAssignmentRows` only stamps
// `template.week` / `template.day` when it HAS one; with null the rows come back unlabelled
// and nothing could be keyed to a band.
function dbuDateMap(doc, startISO) {
  const out = {};
  try {
    DashBuilder.buildAssignmentRows(doc, { id: null, name: "" }, startISO).forEach((r) => {
      const t = r.payload && r.payload.template;
      if (t && t.week && t.day) out[(t.week - 1) + ":" + (t.day - 1)] = r.scheduledDate;
    });
  } catch (e) { /* an unusable start date or an empty document simply yields no dates */ }
  return out;
}
// A summary a coach can check at a glance, derived rather than typed.
function dbuSummary(doc, dates) {
  const weekdays = new Set();
  let sessions = 0;
  (doc.weeks || []).forEach((w) => (w.days || []).forEach((d) => {
    sessions += 1;
    if (dbuHasWeekday(d)) weekdays.add(d.weekday);
  }));
  const all = Object.values(dates).filter(Boolean).sort();
  return {
    weeks: (doc.weeks || []).length,
    sessions,
    weekdays: [...weekdays].sort((a, b) => a - b),
    last: all[all.length - 1] || "",
  };
}

// ── Template persistence (live API ⇄ localStorage drafts) ───────────────────
const dbuDraftKey = ownerId => "shape.dashBuilderDrafts.v2." + (ownerId || "demo");
function dbuReadDrafts(ownerId) {
  try { return JSON.parse(localStorage.getItem(dbuDraftKey(ownerId)) || "{}"); } catch (e) { return {}; }
}
function dbuWriteDraft(ownerId, id, value) {
  try { const all = dbuReadDrafts(ownerId); if (value) all[id] = value; else delete all[id]; localStorage.setItem(dbuDraftKey(ownerId), JSON.stringify(all)); return true; } catch (e) { return false; }
}
function dbuRecoveredTemplate(id, draft, templates) {
  const saved = (templates || []).find(t => t.id === id) || {};
  return { ...saved, draftId:id, id:draft.persisted ? id : undefined, name:draft.name,
    published:draft.published ?? saved.published ?? false,
    detail:{...(saved.detail || {}),...(draft.detail || {}),builder:draft.doc,revision:draft.revision || 0}, recovered:draft };
}
async function dbuUploadVideo(file) {
  const client = window.shapeDb && window.shapeDb.client;
  if (!client) throw new Error("Sign in to upload a demonstration.");
  const {data, error:authError} = await client.auth.getUser();
  if (authError || !data?.user) throw new Error("Sign in to upload a demonstration.");
  const ext = String(file.name || "").split(".").pop().toLowerCase();
  if (!['mp4','mov','m4v','webm'].includes(ext)) throw new Error("Choose an MP4, MOV, M4V or WebM video.");
  if (file.size > 200 * 1024 * 1024) throw new Error("Keep the video under 200 MB.");
  const path = data.user.id + "/exercise/" + crypto.randomUUID() + "." + ext;
  const {error} = await client.storage.from("coach-media").upload(path,file,{upsert:false,contentType:file.type || ({mov:'video/quicktime',webm:'video/webm'}[ext] || 'video/mp4')});
  if (error) throw error;
  const {data:media} = client.storage.from("coach-media").getPublicUrl(path);
  if (!media?.publicUrl) throw new Error("Upload did not return a playable link. Retry.");
  return media.publicUrl;
}

// ── Exercise picker popover ──────────────────────────────────────────────────
function DbuExercisePicker({ onPick, onClose }) {
  const [q, setQ] = React.useState("");
  const [selected, setSelected] = React.useState([]);
  const results = DashBuilder.searchExercises(q);
  return <DbuDialog title="Add exercises" onClose={onClose} busy={false}>
    <h2 style={{fontSize:20,margin:'0 0 14px'}}>Add exercises</h2>
    <input autoFocus aria-label="Search exercises" value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>{if(e.key==='Escape')onClose();}} placeholder="Search exercises, muscles, equipment…" style={{...dbuField,width:"100%",marginBottom:8}} />
    <div style={{maxHeight:'min(360px, 50vh)',overflowY:"auto"}}>{results.map(ex=><label key={ex.id} style={{display:"flex",gap:10,minHeight:44,alignItems:"center",fontSize:13}}><input type="checkbox" checked={selected.some(x=>x.id===ex.id)} onChange={e=>{const checked=e.target.checked;setSelected(prev=>checked?[...prev,ex]:prev.filter(x=>x.id!==ex.id));}}/><span>{ex.name}<small style={{display:"block",color:DBU_INK50}}>{ex.muscle} · {ex.equipment}</small></span></label>)}</div>
    {!results.length && <button style={dbuBtn(false)} onClick={()=>setSelected(prev=>[...prev,{id:crypto.randomUUID(),name:q.trim(),muscle:"",equipment:""}])} disabled={!q.trim()}>Use “{q}” as custom exercise</button>}
    <div style={{display:"flex",gap:8,marginTop:10}}><button disabled={!selected.length} style={dbuBtn(true)} onClick={()=>onPick(selected)}>Add {selected.length || ''} exercises</button><button style={dbuBtn(false)} onClick={onClose}>Cancel</button></div>
  </DbuDialog>;
}

// ── Exercise row editor ──────────────────────────────────────────────────────
function DbuRow({ row, label, onChange, onRemove, onMove, onDuplicate, clips = [], onUploading }) {
  const set = (k,v) => {const next={...row,[k]:v}; if(k==='load'||k==='loadType') delete next.loadText; onChange(next);};
  const [uploading,setUploading] = React.useState(false);
  const [error,setError] = React.useState('');
  const fileRef=React.useRef(null), latest=React.useRef({row,onChange}); latest.current={row,onChange};
  const mounted=React.useRef(true);
  React.useEffect(()=>()=>{mounted.current=false;},[]);
  const upload=async(file)=>{if(!file)return; setUploading(true);setError('');onUploading(1);try {const url=await dbuUploadVideo(file);if(mounted.current)latest.current.onChange({...latest.current.row,video:url});}catch(e){if(mounted.current)setError(e.message || 'Upload failed. Choose the file to retry.');}finally{if(mounted.current)setUploading(false);onUploading(-1);}};
  const video=ShapeWorkoutDocument.videoUrl(row.video);
  const field=(key,label,type='text')=><label style={{display:'block',minWidth:0}}><span style={dbuLabel}>{label}</span><input aria-label={row.name+' '+label} type={type} min={type==='number'?1:undefined} value={row[key] ?? ''} onChange={e=>set(key,type==='number'?e.target.value:e.target.value)} style={{...dbuField,width:'100%'}}/></label>;
  return <div style={{border:'1px solid rgba(242,237,228,0.12)',borderLeft:'3px solid '+(row.group?'#2ee0c4':'rgba(242,237,228,0.2)'),borderRadius:4,padding:12,marginBottom:10}}>
    <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:10}}>
      <span style={{color:DBU_INK50}}>{label}</span><strong style={{flex:1,fontSize:15}}>{row.name}</strong>
      <button aria-label={'Move '+row.name+' up'} onClick={()=>onMove(-1)} style={dbuBtn(false)}>↑</button><button aria-label={'Move '+row.name+' down'} onClick={()=>onMove(1)} style={dbuBtn(false)}>↓</button>
      <button onClick={onDuplicate} style={dbuBtn(false)}>Duplicate</button><button disabled={uploading} aria-label={'Remove '+row.name} onClick={onRemove} style={dbuBtn(false)}>×</button>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(85px,1fr))',gap:10}}>
      {field('sets','Sets','number')}{field('reps','Reps')}
      <label><span style={dbuLabel}>Load</span><input aria-label={row.name+' load'} type="number" min="0" value={row.load ?? ''} onChange={e=>set('load',e.target.value===''?'':Number(e.target.value))} style={{...dbuField,width:'100%'}}/></label>
      <label><span style={dbuLabel}>Unit</span><select aria-label={row.name+' load unit'} value={row.loadType || 'kg'} onChange={e=>set('loadType',e.target.value)} style={{...dbuField,width:'100%'}}><option value="kg">kg</option><option value="lb">lb</option><option value="pct">% 1RM</option><option value="rpe">Target RPE</option></select></label>
      {field('rest','Rest')}
    </div>
    {row.loadText && <p style={{fontSize:12,color:DBU_INK50}}>Original load instruction: {row.loadText}</p>}
    <details style={{marginTop:12}}><summary style={{cursor:'pointer',fontSize:13,minHeight:32}}>Cues, tempo, superset & progression</summary>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:10}}>{field('cue','Coach cue')}{field('tempo','Tempo')}<label><span style={dbuLabel}>Superset</span><select value={row.group || ''} onChange={e=>set('group',e.target.value || null)} style={dbuField}><option value="">None</option>{['A','B','C','D'].map(g=><option key={g}>{g}</option>)}</select></label></div>
      <label style={{display:'flex',gap:8,alignItems:'center',fontSize:12,marginTop:10}}><input type="checkbox" checked={!!row.progression} onChange={e=>set('progression',e.target.checked?{rule:'all-reps',incKg:row.loadType==='kg'?2.5:undefined,incLb:row.loadType==='lb'?5:undefined,incPct:row.loadType==='pct'?2.5:undefined,incRpe:row.loadType==='rpe'?0.5:undefined}:null)}/> Apply progression when copying a week with progression</label>
    </details>
    <div style={{marginTop:12,paddingTop:10,borderTop:'1px solid rgba(242,237,228,0.1)'}}>
      <input ref={fileRef} type="file" accept="video/mp4,video/quicktime,video/webm,video/x-m4v,.mp4,.mov,.m4v,.webm" hidden onChange={e=>{const f=e.target.files[0];e.target.value='';upload(f);}}/>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}><button disabled={uploading} style={dbuBtn(false)} onClick={()=>fileRef.current.click()}>{uploading?'Uploading…':video?'Replace demo':'Upload demo'}</button>
        {!!clips.length && <select aria-label={'Choose demo for '+row.name} style={{...dbuField,maxWidth:'100%'}} value="" disabled={uploading} onChange={e=>set('video',e.target.value)}><option value="">Choose from video library</option>{clips.map(c=><option key={c.url} value={c.url}>{c.name}</option>)}</select>}
        {video && <button disabled={uploading} style={dbuBtn(false)} onClick={()=>set('video','')}>Remove demo</button>}
      </div>
      {uploading && <progress aria-label="Uploading exercise demonstration" style={{width:'100%',marginTop:8}}/>}
      {error && <p role="alert" style={{fontSize:13,color:'#e0644b'}}>{error}</p>}
      {video && <details style={{marginTop:8}}><summary style={{cursor:'pointer',fontSize:13}}>Preview demonstration</summary><video src={video} controls playsInline preload="metadata" onError={()=>setError('This browser could not play the clip. Upload a compatible MP4 before assigning.')} style={{width:'100%',maxHeight:240,marginTop:8}}/></details>}
    </div>
  </div>;
}

// ── Day editor (right pane) ──────────────────────────────────────────────────
function DbuDayEditor({ day, onChange, onWeekday, takenBy, playlists, clips, onUploading }) {
  const [pickerFor, setPickerFor] = React.useState(null); // block index
  const labels = DashBuilder.rowLabels(day);
  let labelIdx = 0;
  const setBlock = (bi, next) => onChange({ ...day, blocks: day.blocks.map((b, i) => (i === bi ? next : b)) });
  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <label style={dbuLabel} htmlFor="dbu-day-name">Day name</label>
          <input id="dbu-day-name" value={day.name} onChange={(e) => onChange({ ...day, name: e.target.value })} style={{ ...dbuField, width: "100%", fontSize: 14 }} />
        </div>
        <label>
          <span style={dbuLabel}>Training day</span>
          {/* ⚠ ROUTED THROUGH `onWeekday`, NEVER `onChange`. This select and the Grid's drag
              are the two writers of a day's weekday; both go through `dbuAssignWeekday`, so a
              weekday another day already holds is EXCHANGED rather than duplicated. Writing it
              through `onChange` — a blind positional replace — is how two days came to sit on
              one weekday, and the Grid can render only the first of those, so the second was
              unreachable while the document still held it. Fixed in #2143.
              The option names the day it would swap with, so the outcome is legible before the
              click rather than a session quietly changing day. */}
          <select value={day.weekday ?? ''} onChange={(e) => onWeekday(e.target.value === '' ? undefined : Number(e.target.value))} style={dbuField}>
            <option value="">In sequence from start</option>
            {DBU_DOW_FULL.map((d, i) => <option key={d} value={i}>{d}{takenBy && takenBy[i] ? " · swaps with " + takenBy[i] : ""}</option>)}
          </select>
        </label>
        <div>
          <span style={dbuLabel}>Shape Radio playlist · chips on the client card</span>
          <select value={day.playlist ? day.playlist.name : ""} onChange={(e) => {
            const p = playlists.find((x) => x.name === e.target.value);
            onChange({ ...day, playlist: p ? { name: p.name, meta: p.meta || "" } : null });
          }} style={{ ...dbuField, minWidth: 220 }}>
            <option value="">No playlist</option>
            {playlists.map((p) => <option key={p.name} value={p.name}>{p.name}{p.meta ? " · " + p.meta : ""}</option>)}
          </select>
        </div>
      </div>
      {day.blocks.map((block, bi) => (
        <div key={bi} style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
            <select value={block.kind} onChange={(e) => setBlock(bi, { ...block, kind: e.target.value })} style={{ ...dbuField, fontFamily: DBU_MONO, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.1em", color: DBU_RUST, padding: "5px 7px" }}>
              {DashBuilder.BLOCK_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
            </select>
            <div style={{ flex: 1, height: 2, background: "linear-gradient(90deg, " + DBU_RUST + ", rgba(192,83,59,0.2) 45%, transparent 85%)" }} />
            {day.blocks.length > 1 && <button onClick={() => onChange({ ...day, blocks: day.blocks.filter((_, i) => i !== bi) })} style={{ ...dbuBtn(false), padding: "4px 8px", color: "#e0644b", borderColor: "rgba(224,100,75,0.4)" }}>Remove block</button>}
          </div>
          {block.rows.map((row, ri) => {
            const label = labels[labelIdx]; labelIdx += 1;
            return (
              <DbuRow key={row.id} row={row} label={label} clips={clips} onUploading={onUploading}
                onDuplicate={() => setBlock(bi, {...block, rows:[...block.rows.slice(0,ri+1),{...JSON.parse(JSON.stringify(row)),id:crypto.randomUUID()},...block.rows.slice(ri+1)]})}
                onChange={(next) => setBlock(bi, { ...block, rows: block.rows.map((r, i) => (i === ri ? next : r)) })}
                onRemove={() => setBlock(bi, { ...block, rows: block.rows.filter((_, i) => i !== ri) })}
                onMove={(dir) => {
                  const rows = [...block.rows];
                  const j = ri + dir;
                  if (j < 0 || j >= rows.length) return;
                  [rows[ri], rows[j]] = [rows[j], rows[ri]];
                  setBlock(bi, { ...block, rows });
                }} />
            );
          })}
          <div style={{ position: "relative", display: "inline-block" }}>
            <button onClick={() => setPickerFor(pickerFor === bi ? null : bi)} style={dbuBtn(false)}>+ Exercise</button>
            {pickerFor === bi && (
              <DbuExercisePicker
                onPick={(items) => { setBlock(bi, { ...block, rows: [...block.rows, ...items.map(DashBuilder.newRow)] }); setPickerFor(null); }}
                onClose={() => setPickerFor(null)} />
            )}
          </div>
        </div>
      ))}
      <button onClick={() => onChange({ ...day, blocks: [...day.blocks, { kind: "accessory", rows: [] }] })} style={{ ...dbuBtn(false), marginTop: 2 }}>+ Block</button>
    </div>
  );
}

function DbuDialog({title,onClose,busy,children}) {
  const ref=React.useRef(null), latest=React.useRef({onClose,busy});latest.current={onClose,busy};
  React.useEffect(()=>{
    const previous=document.activeElement;
    const node=ref.current;
    node?.focus();
    const key=e=>{if(e.key==='Escape'&&!latest.current.busy){e.preventDefault();latest.current.onClose();}if(e.key==='Tab'){
      const items=[...node.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),summary,[tabindex="0"]')].filter(x=>!x.hidden);
      const first=items[0],last=items[items.length-1];
      if(!first){e.preventDefault();node.focus();}else if(e.shiftKey&&(document.activeElement===first||document.activeElement===node)){e.preventDefault();last.focus();}else if(!e.shiftKey&&(document.activeElement===last||document.activeElement===node)){e.preventDefault();first.focus();}
    }};
    node.addEventListener('keydown',key);const old=document.body.style.overflow;document.body.style.overflow='hidden';
    return()=>{node.removeEventListener('keydown',key);document.body.style.overflow=old;if(previous?.isConnected)previous.focus();};
  },[]);
  return ReactDOM.createPortal(<div style={{position:'fixed',inset:0,zIndex:300,display:'grid',placeItems:'center',background:'rgba(10,10,8,.8)',padding:16}} onPointerDown={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}>
    <div ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} style={{width:'min(660px,100%)',maxHeight:'90vh',overflowY:'auto',boxSizing:'border-box',padding:22,background:'#14110e',color:'#f2ede4',border:'1px solid rgba(242,237,228,.2)',borderRadius:8,fontFamily:"'Space Grotesk',sans-serif"}}>{children}</div>
  </div>,document.body);
}

function DbuFutureUpdates({template,clients,onClose}) {
  const [rows,setRows]=React.useState(null),[picked,setPicked]=React.useState({}),[error,setError]=React.useState(''),[busy,setBusy]=React.useState(false),[done,setDone]=React.useState(false),[skipped,setSkipped]=React.useState(0);
  React.useEffect(()=>{let on=true;const date=new Date();const today=date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');fetch('/api/coach/plans/assignments?id='+encodeURIComponent(template.id)+'&today='+today,{credentials:'same-origin'}).then(async res=>{const data=await res.json();if(!res.ok)throw new Error(data.error||'Could not load assignments.');if(on){setRows(data.assignments||[]);setSkipped(data.skipped||0);}}).catch(e=>{if(on)setError(e.message);});return()=>{on=false;};},[template.id]);
  const selected=(rows||[]).filter(r=>picked[r.id]);
  const apply=async()=>{
    setBusy(true);setError('');let completed=0;
    try{
      for(const clientId of [...new Set(selected.map(r=>r.clientId))]){
        for(const week of DashBuilder.groupAssignmentWeeks(selected.filter(r=>r.clientId===clientId))){
          const res=await fetch('/api/trainer/workout',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({clientIds:[clientId],assignmentPreconditions:week.rows.map(r=>r.before),sessions:week.rows.map(r=>({title:r.title,description:r.description,kind:'template',scheduledDate:r.scheduledDate,payload:r.payload}))})});
          const data=await res.json();if(!res.ok)throw new Error(data.error||'Update failed.');completed+=week.rows.length;
          setPicked(prev=>{const next={...prev};week.rows.forEach(r=>delete next[r.id]);return next;});
          setRows(prev=>prev.filter(r=>!week.rows.some(x=>x.id===r.id)));
        }
      }
      setDone(true);
    }catch(e){setError((completed?completed+' workouts updated. ':'')+e.message);}finally{setBusy(false);}
  };
  const summary=e=>[e.sets&&e.reps?e.sets+' × '+e.reps:'',e.load,e.rest,e.tempo&&e.tempo+' tempo',e.cue,e.video?'Demo attached':''].filter(Boolean).join(' · ');
  return <DbuDialog title="Update future workouts" onClose={onClose} busy={busy}><h2>Update future workouts</h2><p style={{fontSize:13,lineHeight:1.5}}>Choose the upcoming prescriptions to replace with this saved template. Dates stay the same. Today's workouts and logged sessions are excluded. Clients already training keep the prescription with which they started.</p>
    {skipped>0&&<p style={{fontSize:13}}>{skipped} assignments with logged work, removed days or client overrides need individual review.</p>}
    {rows===null&&!error&&<p role="status">Loading upcoming workouts…</p>}
    {rows?.length===0&&<p>{done?'Selected workouts updated.':'No eligible future assignments.'}</p>}
    {(rows||[]).map(r=><div key={r.id} style={{borderTop:'1px solid rgba(242,237,228,.15)',padding:'12px 0'}}><label style={{display:'flex',gap:10,alignItems:'center'}}><input type="checkbox" disabled={busy} checked={!!picked[r.id]} onChange={e=>setPicked({...picked,[r.id]:e.target.checked})}/><span>{clients.find(c=>c.profile.id===r.clientId)?.profile.name||'Client'} · {r.scheduledDate} · {r.title}</span></label><details style={{margin:'8px 0 0 24px'}}><summary>Review changes</summary><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,fontSize:12}}><div><strong>Current</strong><p>{r.before.title}</p>{r.before.exercises.map((e,i)=><p key={i}><b>{e.name}</b><br/>{summary(e)}</p>)}</div><div><strong>Updated</strong><p>{r.title}</p>{r.payload.exercises.map((e,i)=><p key={i}><b>{e.name}</b><br/>{summary(e)}</p>)}</div></div></details></div>)}
    {error&&<p role="alert" style={{color:'#e0644b'}}>{error}</p>}
    <div style={{display:'flex',gap:10,marginTop:16}}><button disabled={busy||!selected.length} onClick={apply} style={dbuBtn(true)}>{busy?'Updating…':'Update '+selected.length+' workouts'}</button><button disabled={busy} onClick={onClose} style={dbuBtn(false)}>Close</button></div>
  </DbuDialog>;
}

// ── Assign modal — multi-client + start date; marks the programming queue ───
function DbuAssignModal({ template, doc, clients, queue, live, onClose }) {
  const [picked, setPicked] = React.useState({});
  const [startDate, setStartDate] = React.useState(() => {
    const d = new Date(); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); // next Monday
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  });
  const [state, setState] = React.useState("");
  // ⚠ The guardrail's REASON, kept. A 409 is the gate holding the week and it
  // carries the sentence the coach has to act on ("this is a 40% jump on
  // her last four weeks"); a fixed "try again" is advice that can never work,
  // because retrying an unchanged week returns the same 409 forever.
  const [errMsg, setErrMsg] = React.useState("");
  const queueState = (id) => { const q = (queue || []).find((r) => r.client.profile.id === id); return q ? q.state : null; };
  const dayCount = doc.weeks.reduce((s, w) => s + w.days.length, 0);
  const ids = Object.keys(picked).filter((k) => picked[k]);

  const assign = async () => {
    if (!ids.length || state === "working" || state === "done") return;
    setState("working");
    setErrMsg("");
    let rows;
    try { rows=DashBuilder.buildAssignmentRows(doc, template, startDate); if(!rows.length || rows.some(r=>!r.payload.exercises.length))throw new Error("Add exercises to each training day before assigning."); } catch(e){setErrMsg(e.message);setState("error");return;}
    // Weeks publish one at a time, so a failure partway through leaves the
    // earlier weeks LIVE. Counting them is the difference between "nothing
    // happened" and "three weeks landed and week four was held" — and only the
    // second is true.
    let landed = 0;
    let totalWeeks = 0;
    try {
      if (live) {
        // ⚠ ONE PUBLISH PER WEEK, not per session. The boundary evaluates and
        // replaces a whole client-week, so sending sessions one at a time
        // republishes the same week once per session — ~36 publishes and ~36
        // telemetry rows for a 12-week program, which skews §10.2's flag-rate
        // denominators by counting one authoring act as 36. Grouping is in
        // dashBuilderCore (pure + tested) because a session bucketed into the
        // wrong week is judged against the wrong load and lands in a replace
        // that clears a week it was never part of.
        const weekGroups = DashBuilder.groupAssignmentWeeks(rows);
        totalWeeks = weekGroups.length;
        for (const wk of weekGroups) {
          const res = await fetch("/api/trainer/workout", {
            method: "POST", credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              clientIds: ids,
              sessions: wk.rows.map((row) => ({
                title: row.title, description: template.name, kind: "template",
                scheduledDate: row.scheduledDate, payload: row.payload,
              })),
            }),
          });
          // A 409 is the progression guardrail HOLDING the week, not a fault —
          // it carries the reason in `error`, and throwing "HTTP 409" would
          // strip exactly the sentence the coach needs to act on.
          if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            throw new Error(d.error || ("HTTP " + res.status));
          }
          landed += 1;
        }
      }
      // Plan written → those clients leave the programming queue for this week.
      try {
        const m = new Date(); m.setHours(0, 0, 0, 0); m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
        const key = "shape.dashQueueDone." + m.getFullYear() + "-" + String(m.getMonth() + 1).padStart(2, "0") + "-" + String(m.getDate()).padStart(2, "0");
        const done = new Set(JSON.parse(localStorage.getItem(key) || "[]"));
        ids.forEach((id) => done.add(id));
        localStorage.setItem(key, JSON.stringify([...done]));
      } catch (e) {}
      setState("done");
      setTimeout(onClose, 1100);
    } catch (e) {
      const reason = (e && e.message ? String(e.message) : "").trim();
      // Name what actually landed. Silence here reads as "nothing was written",
      // and the coach would re-assign the whole program on top of the weeks that
      // already published.
      const partial = landed > 0
        ? "First " + landed + " of " + totalWeeks + " week" + (totalWeeks === 1 ? "" : "s") + " published. "
        : "";
      setErrMsg(partial + (reason || "Couldn't assign — try again."));
      setState("error");
    }
  };

  return (
    <DbuDialog title="Assign workout" onClose={onClose} busy={state === "working"}>
        <div style={{ fontFamily: DBU_MONO, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: DBU_RUST }}>Assign · {template.name}</div>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 23, margin: "6px 0 4px" }}>Put clients on it.</div>
        <div style={{ fontSize: 12, color: DBU_INK50, marginBottom: 14 }}>{doc.weeks.length} week{doc.weeks.length === 1 ? "" : "s"} · {dayCount} days · snapshot v{doc.version} — your later template edits won't change what they get.</div>
        <span style={dbuLabel}>Start date</span>
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ ...dbuField, marginBottom: 12 }} />
        <details style={{marginBottom:12}}><summary>Preview scheduled workouts</summary>{DashBuilder.buildAssignmentRows(doc,template,startDate || '2000-01-01').map((r,i)=><p key={i} style={{fontSize:12}}>{r.scheduledDate} · {r.title} · {r.payload.exercises.length} exercises</p>)}</details>
        <span style={dbuLabel}>Clients</span>
        <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid rgba(242,237,228,0.08)", borderRadius: 6, padding: "2px 10px", marginBottom: 14 }}>
          {clients.map((c) => {
            const id = c.profile.id;
            const qs = queueState(id);
            return (
              <label key={id} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 10, alignItems: "center", padding: "8px 0", borderTop: "1px solid rgba(242,237,228,0.05)", cursor: "pointer" }}>
                <input type="checkbox" checked={!!picked[id]} onChange={(e) => setPicked({ ...picked, [id]: e.target.checked })} />
                <span style={{ fontSize: 13 }}>{c.profile.name}</span>
                {qs && <DashPill c={qs === "ready" ? "#2ee0c4" : "#d8a23a"}>{qs === "ready" ? "Ready" : "Awaiting check-in"}</DashPill>}
              </label>
            );
          })}
          {!clients.length && <div style={{ fontSize: 12, color: DBU_INK50, padding: 8 }}>No clients loaded.</div>}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button onClick={assign} disabled={!ids.length || state === "working"} style={{ ...dbuBtn(true, DBU_RUST), color: "#fff", padding: "11px 18px", opacity: !ids.length || state === "working" ? 0.6 : 1 }}>
            {state === "working" ? "Assigning…" : state === "done" ? "Assigned ✓" : "Publish to " + (ids.length || 0) + " client" + (ids.length === 1 ? "" : "s")}
          </button>
          <button disabled={state === "working"} onClick={onClose} style={dbuBtn(false)}>Cancel</button>
          {!live && <span style={{ fontFamily: DBU_MONO, fontSize: 8.5, color: DBU_INK50 }}>DEMO · marks the queue only</span>}
        </div>
        {state === "error" && (
          // A guardrail reason is a SENTENCE, so it gets a line to be read on —
          // out of the button row, where a long one would wrap the actions apart.
          // role=alert because this is the one thing on the screen the coach must
          // not miss.
          <div role="alert" style={{ marginTop: 12, borderLeft: "3px solid " + DBU_RUST, paddingLeft: 11 }}>
            <div style={{ fontFamily: DBU_MONO, fontSize: 8.5, letterSpacing: "0.16em", textTransform: "uppercase", color: DBU_RUST }}>Publish stopped</div>
            <div style={{ fontSize: 12.5, lineHeight: 1.45, color: "#f2ede4", marginTop: 3 }}>{errMsg}</div>
          </div>
        )}
    </DbuDialog>
  );
}

// ── The builder (tree left · day editor right · always-on client preview) ───
// ── The two canvases ─────────────────────────────────────────────────────────
// ⚠ ONE DOCUMENT, TWO VIEWS, READ IN OPPOSITE DIRECTIONS — which is why this is a switch
// and not one stacked page. Grid answers WHEN (rows are weeks, columns are weekdays); Sheet
// answers HOW MUCH (rows are exercises, columns are weeks, so the progression reads left to
// right). The board measured the stacked alternative at 1,439px against the grid's 1,115px,
// showing the same session twice.
//
// Every rule below is the approved artboard's own (`.ab2 .wg`, `.ab2 .sh`, `.ab2 .seg`), not
// a re-interpretation of it.

// The two views, NAMED ONCE. The switch renders from this table and the remembered
// choice validates against its keys, so a view can never exist in one and not the other:
// `useRememberedChoice` silently ignores a stored value outside its allow-list, which on
// screen reads as "the switch forgot what I picked" rather than as a missing entry.
const DBU_VIEWS = [
  { key: "grid", glyph: "▦", label: "Grid" },
  { key: "sheet", glyph: "▤", label: "Sheet" },
];
const DBU_VIEW_KEYS = DBU_VIEWS.map((v) => v.key);

// The view switch — the board's `.seg`.
function DbuViewSwitch({ view, setView }) {
  return (
    <div className="seg" role="group" aria-label="Builder view">
      {DBU_VIEWS.map(({ key, glyph, label }) => (
        <button key={key} type="button" onClick={() => setView(key)} aria-pressed={view === key} title={label + " view"}>
          <i aria-hidden="true">{glyph}</i>{label}
        </button>
      ))}
    </div>
  );
}

// ── Grid — the calendar is the builder ───────────────────────────────────────
function DbuGrid({ doc, dates, sel, setSel, setWeeks, uploads, onWeek }) {
  const dragRef = React.useRef(null);
  const weekStart = (wi) => ((doc.weeks[wi].days || []).map((_, di) => dates[wi + ":" + di]).filter(Boolean).sort()[0] || "");
  // ⚠ A DROP SWAPS, IT DOES NOT OVERWRITE. Measured on a Mon/Wed/Fri week, dragging Mon onto
  // the POPULATED Wed cell: 3 of 3 sessions visible becomes 2 of 3, silently. That drop is
  // the ordinary same-week case and it passes the `f.wi === wi` guard, so the guard is not
  // what protects it. The retired builder could not hit this — its `moveDay` REORDERED
  // within a week (a permutation, so no collision existed); assigning a weekday is new here,
  // and so is the collision. The rule itself is `dbuAssignWeekday`, shared with the day
  // editor's Training-day select, so the two controls cannot drift into two answers.
  const moveTo = (wi, di, weekday) => setWeeks(doc.weeks.map((w, i) => (i === wi ? dbuAssignWeekday(w, di, weekday) : w)));
  const addAt = (wi, weekday) => {
    const w = doc.weeks[wi];
    setWeeks(doc.weeks.map((x, i) => (i === wi ? { ...x, days: [...x.days, { ...DashBuilder.newDay("Day " + (w.days.length + 1)), weekday }] } : x)));
    setSel({ w: wi, d: w.days.length });
  };
  return (
    <div className="scroll">
      <div className="wg" style={{ minWidth: 760 }}>
        <div />
        {DBU_DOW.map((d) => <div className="h" key={d}>{d}</div>)}
        {doc.weeks.map((w, wi) => (
          <React.Fragment key={wi}>
            <div className="wk">
              <b>Week {wi + 1}</b>
              <span>{dbuDayMonth(weekStart(wi)) || "—"}</span>
              {w.deload && <span className="dl">Deload −40%</span>}
              {/* ⚠ Every week tool the retired tree carried, kept. Losing one to a layout
                  change would be a silent regression in the engine §1.4 of the review says
                  must survive any redesign. */}
              <span className="tools">
                <button type="button" onClick={() => onWeek("duplicate", wi)} title="Copy this week unchanged">Copy</button>
                <button type="button" onClick={() => onWeek("progress", wi)} title="Copy this week with the configured load increases">Progress</button>
                <button type="button" onClick={() => onWeek("deload", wi)} aria-pressed={!!w.deload} title="Deload: −40% volume, then edit freely">Deload</button>
                {doc.weeks.length > 1 && <button type="button" onClick={() => onWeek("remove", wi)} aria-label={"Remove week " + (wi + 1)}>×</button>}
              </span>
            </div>
            {DBU_DOW.map((_, wd) => {
              const di = (w.days || []).findIndex((d) => dbuHasWeekday(d) && d.weekday === wd);
              const day = di >= 0 ? w.days[di] : null;
              const iso = di >= 0 ? dates[wi + ":" + di] : "";
              if (!day) {
                // ⚠ THE SAME `f.wi === wi` GUARD THE POPULATED CELL CARRIES, and its absence
                // here was not a no-op: `moveTo` only ever edits week `f.wi`, so dragging a
                // Week 1 session onto an empty cell under Week 3 left it in Week 1 and
                // silently changed its WEEKDAY there — the drop target the coach aimed at
                // was ignored. (CodeRabbit, #2143.) Moving a day BETWEEN weeks is a feature,
                // not this fix; registered.
                return (
                  <button type="button" key={wd} className="c rest"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => { const f = dragRef.current; if (f && !uploads && f.wi === wi) moveTo(f.wi, f.di, wd); dragRef.current = null; }}
                    onClick={() => addAt(wi, wd)}
                    aria-label={"Add a session on " + DBU_DOW[wd] + " of week " + (wi + 1)}>
                    <span className="r">Rest · ＋ Add session</span>
                  </button>
                );
              }
              const moves = (day.blocks || []).reduce((n, b) => n + (b.rows || []).length, 0);
              return (
                <button type="button" key={wd} className={"c" + (sel.w === wi && sel.d === di ? " on" : "")} draggable={!uploads}
                  onDragStart={(e) => { if (uploads) { e.preventDefault(); return; } dragRef.current = { wi, di }; }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => { const f = dragRef.current; if (f && !uploads && f.wi === wi) moveTo(f.wi, f.di, wd); dragRef.current = null; }}
                  onClick={() => setSel({ w: wi, d: di })}>
                  <span className="d">{dbuDayMonth(iso) || "—"}</span>
                  <span className="s">
                    <b>{day.name}</b>
                    <span>{moves} moves{day.playlist ? " · ♪" : ""}</span>
                  </span>
                </button>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// ── Sheet — exercises down, weeks across ─────────────────────────────────────
// ⚠ ROWS ARE KEYED BY POSITION (day · block · row), NOT BY EXERCISE NAME. The document is a
// grid by construction whenever a week was made with Copy or Progress, which is the normal
// flow; matching by name would silently merge two different moves sharing a name and split
// one that was renamed. Where a later week genuinely holds a DIFFERENT move at the same
// position, the cell prints that week's own name — the divergence is drawn, not hidden.
function DbuSheet({ doc, dates, setSel, setWeeks }) {
  const weeks = doc.weeks || [];
  const dayCount = weeks.reduce((n, w) => Math.max(n, (w.days || []).length), 0);
  const editRow = (di, bi, ri, wi, value) => setWeeks(weeks.map((w, i) => {
    if (i !== wi) return w;
    const day = (w.days || [])[di];
    if (!day || !(day.blocks || [])[bi] || !(day.blocks[bi].rows || [])[ri]) return w;
    return { ...w, days: w.days.map((d, j) => (j !== di ? d : { ...d, blocks: d.blocks.map((b, k) => (k !== bi ? b : { ...b, rows: b.rows.map((r, m) => (m !== ri ? r : { ...r, ...value })) })) })) };
  }));
  return (
    <div className="scroll">
      <table className="sh" style={{ minWidth: 300 + weeks.length * 130 }}>
        <colgroup><col style={{ width: 300 }} />{weeks.map((_, i) => <col key={i} />)}</colgroup>
        <thead>
          <tr>
            <th>Exercise</th>
            {weeks.map((w, wi) => (
              <th key={wi}>
                Week {wi + 1}
                <small>{dbuShortDate(dates[wi + ":0"]) || "—"}</small>
                {w.deload && <span className="dl">Deload −40%</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: dayCount }, (_, di) => {
            const base = weeks.find((w) => (w.days || [])[di]);
            const day = base ? base.days[di] : null;
            if (!day) return null;
            const moves = (day.blocks || []).reduce((n, b) => n + (b.rows || []).length, 0);
            const names = new Set(weeks.map((w) => ((w.days || [])[di] || {}).name).filter(Boolean));
            return (
              <React.Fragment key={di}>
                <tr className="band">
                  <td colSpan={weeks.length + 1}>
                    <div className="bn">
                      <button type="button" onClick={() => setSel({ w: 0, d: di })} title={"Open " + day.name}>
                        <b>{day.name}</b>
                      </button>
                      <span className="chip rust">{dbuHasWeekday(day) ? DBU_DOW[day.weekday] : "No weekday"}</span>
                      <span className="hint">
                        {moves} moves{day.playlist ? " · ♪ " + day.playlist.name : ""}
                        {names.size > 1 ? " · renamed in a later week" : ""}
                        {" · "}{weeks.map((_, wi) => dbuDayMonth(dates[wi + ":" + di])).filter(Boolean).join(" · ") || "—"}
                      </span>
                    </div>
                  </td>
                </tr>
                {(day.blocks || []).map((block, bi) => (block.rows || []).map((row, ri) => (
                  <tr key={bi + ":" + ri}>
                    <td className="en">
                      <b>{row.name || "Unnamed move"}</b>
                      <span>{block.kind}{row.tempo ? " · " + row.tempo : ""}{row.group ? " · " + row.group : ""}{row.rest ? " · rest " + row.rest : ""}</span>
                    </td>
                    {weeks.map((w, wi) => {
                      const wBlock = (((w.days || [])[di] || {}).blocks || [])[bi];
                      const cellRow = wBlock && (wBlock.rows || [])[ri];
                      if (!cellRow) return <td key={wi}><span className="none">—</span></td>;
                      const diverged = cellRow.name && row.name && cellRow.name !== row.name;
                      return (
                        <td key={wi}>
                          <span className={"cell" + (w.deload ? " dl" : "")}>
                            {diverged && <span className="div" title={cellRow.name}>{cellRow.name}</span>}
                            <input className="a" aria-label={"Sets and reps, " + (cellRow.name || row.name) + ", week " + (wi + 1)}
                              value={(cellRow.sets ?? "") + " × " + (cellRow.reps ?? "")}
                              onChange={(e) => { const m = String(e.target.value).split(/[×x]/); editRow(di, bi, ri, wi, { sets: (m[0] || "").trim(), reps: (m[1] || "").trim() }); }} />
                            <input className="b" aria-label={"Load, " + (cellRow.name || row.name) + ", week " + (wi + 1)}
                              value={cellRow.load ?? ""} onChange={(e) => editRow(di, bi, ri, wi, { load: e.target.value })} />
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                )))}
                <tr className="add">
                  <td colSpan={weeks.length + 1}>
                    <button type="button" onClick={() => setSel({ w: 0, d: di })}>＋ Add exercise to {day.name}</button>
                  </td>
                </tr>
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
      <button type="button" className="addday" onClick={() => setWeeks(weeks.map((w, i) => (i !== 0 ? w : { ...w, days: [...w.days, { ...DashBuilder.newDay("Day " + (w.days.length + 1)), weekday: dbuNextFreeWeekday(w) }] })))}>
        ＋ Add a day
      </button>
    </div>
  );
}

function DbuBuilder({ template, clients, queue, live, playlists, ownerId, clips, dayTemplates, onBack, onSaved }) {
  const ownerRef = React.useRef(ownerId);
  const initial = React.useRef(template.recovered || {name:template.name,doc:template.detail.builder,revision:template.detail.revision || 0});
  const [name, setName] = React.useState(initial.current.name);
  // ⚠ The weekday backfill runs INSIDE the initializer, so it is part of the baseline
  // `saved.current` below and opening a legacy program does not mark it dirty or spend a
  // revision. The dates drawn and the dates assigned both use it either way.
  const [doc, setDoc] = React.useState(() => dbuWithWeekdays(JSON.parse(JSON.stringify(initial.current.doc))));
  const [sel, setSel] = React.useState({w:0,d:0});
  // ⚠ REMEMBERED PER COACH, which the board's G tab asks for in as many words: "the
  // switch is remembered per coach, so whoever thinks in calendars opens to the grid and
  // whoever programs in spreadsheets opens to the sheet". It rides the dashboard's own
  // `dashboard_prefs` store rather than a second mechanism — same account binding, same
  // serial write lane, same three read states, no migration and no route.
  //
  // ⚠ THE STORE OPENS ONLY WHEN THE BUILDER IS LIVE. In the signed-out preview there is
  // no account to remember against, and `useRememberedChoices` declines to open a
  // per-account document without one; the switch still works, it just does not persist.
  const prefs = useRememberedChoices(!!live);
  const [view, setViewRaw] = useRememberedChoice(prefs, "builderView", DBU_VIEW_KEYS, "grid");
  // ⚠ SWITCHING TO SHEET CLOSES THE DAY PANEL. The panel floats over the canvas, and in Sheet
  // that covers the week columns the view exists to read left to right — measured: the drawer
  // sits at x 978 over a 1,056px table, hiding Week 2 entirely. In Grid it covers three rest
  // cells, which is the board's own `G-grid` artboard. So the panel is Grid's editing surface
  // and the sheet's cells are Sheet's; opening a day from a band still works and still floats.
  const setView = (next) => { if (next === "sheet") setSel({ w: -1, d: -1 }); setViewRaw(next); };
  const [preview, setPreview] = React.useState(false);
  const [saveState, setSaveState] = React.useState(template.recovered ? 'dirty' : 'saved');
  const [error,setError] = React.useState('');
  const [saveConflict,setSaveConflict] = React.useState(false);
  const [assigning,setAssigning] = React.useState(false);
  const [uploads,setUploads] = React.useState(0);
  const idRef = React.useRef(template.draftId || (template.id && !String(template.id).startsWith('demo-') ? template.id : crypto.randomUUID()));
  const persisted = React.useRef(template.recovered ? !!template.recovered.persisted : !!template.id && !String(template.id).startsWith('demo-'));
  const revision = React.useRef(initial.current.revision);
  const published = React.useRef(!!template.published);
  const copiedFrom = React.useRef(null);
  const active=React.useRef(true), flight=React.useRef(null);
  const latest = React.useRef({name,doc}); latest.current={name,doc};
  const saved = React.useRef(template.recovered ? '' : JSON.stringify({name,doc}));
  const draft = value => dbuWriteDraft(ownerRef.current,idRef.current,{...value,detail:{...(template.detail || {}),builder:value.doc},published:published.current,revision:revision.current,persisted:persisted.current,at:Date.now()});
  const flush = async (publish=false) => {
    if (uploads) {setError('Wait for the demonstration upload to finish.');return false;}
    if (flight.current) {const ok=await flight.current; if(!ok)return false; if(saved.current!==JSON.stringify(latest.current)||publish)return flush(publish);return true;}
    const value=latest.current, serial=JSON.stringify(value);
    if(persisted.current && serial===saved.current && !publish)return true;
    if(!value.name.trim()){setError('Give this workout a name.');return false;}
    setError('');setSaveConflict(false);setSaveState('saving');
    flight.current=(async()=>{
      try{
        let plan={id:idRef.current,name:value.name,detail:{...(template.detail||{}),builder:value.doc,revision:revision.current}};
        if(live){
          if(!ownerRef.current)throw new Error('Sign in before saving this draft.');
          const res=await fetch('/api/coach/plans',{method:persisted.current?'PATCH':'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:idRef.current,kind:'program',name:value.name,meta:value.doc.weeks.length+' weeks',published:publish?true:published.current,expectedOwnerId:ownerRef.current,expectedRevision:revision.current,detail:plan.detail})});
          const data=await res.json();
          if(!res.ok || !data.plan?.id){const failure=new Error(data.error || 'Save failed. Your draft is still on this device.');failure.saveConflict=res.status===409 || data.code==='revision_conflict';throw failure;}
          plan=data.plan;revision.current=Number(plan.detail?.revision)||0;persisted.current=true;published.current=!!plan.published;
        }else if(!draft(value))throw new Error('This browser could not retain your draft. Keep this page open.');
        saved.current=serial;
        if(live && copiedFrom.current){dbuWriteDraft(ownerRef.current,copiedFrom.current,null);copiedFrom.current=null;}
        if(live && serial===JSON.stringify(latest.current))dbuWriteDraft(ownerRef.current,idRef.current,null);
        else draft(latest.current);
        if(active.current){setSaveState('saved');onSaved?.({id:plan.id,name:plan.name,doc:plan.detail.builder,plan});}
        return true;
      }catch(e){if(active.current){setSaveState('error');setSaveConflict(!!e.saveConflict);setError(e.message || 'Save failed. Retry.');}return false;}
      finally{flight.current=null;}
    })();
    return flight.current;
  };
  React.useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  React.useEffect(()=>{
    if(JSON.stringify({name,doc})===saved.current)return;
    if(!draft({name,doc}))setError('Local recovery is unavailable. Save before leaving.');
    setSaveState('dirty');
    const timer=setTimeout(()=>flush(),900);
    return()=>clearTimeout(timer);
  },[name,doc,ownerId]);
  React.useEffect(()=>{
    const guard=e=>{if(saved.current!==JSON.stringify(latest.current)||uploads){e.preventDefault();e.returnValue='';}};
    const beforeLink=e=>{if(uploads && e.target.closest?.('a[href]')){e.preventDefault();e.stopPropagation();setError('Wait for the demonstration upload to finish before leaving.');}};
    window.addEventListener('beforeunload',guard);document.addEventListener('click',beforeLink,true);
    return()=>{window.removeEventListener('beforeunload',guard);document.removeEventListener('click',beforeLink,true);};
  },[uploads]);
  const leave=async()=>{if(await flush())onBack();};
  const saveAsCopy=async()=>{
    if(uploads || flight.current)return;
    copiedFrom.current=idRef.current;
    idRef.current=crypto.randomUUID();persisted.current=false;revision.current=0;published.current=false;
    const next={...latest.current,name:latest.current.name+' (copy)'};
    latest.current=next;setName(next.name);saved.current='';draft(next);
    await flush();
  };
  const uploadCount=delta=>setUploads(n=>Math.max(0,n+delta));

  const week = doc.weeks[sel.w];
  const day = week && week.days[sel.d];
  const setWeeks = (weeks) => setDoc({ ...doc, weeks });
  const setDay = (next) => setWeeks(doc.weeks.map((w, wi) => (wi === sel.w ? { ...w, days: w.days.map((d, di) => (di === sel.d ? next : d)) } : w)));
  // ⚠ THE DAY EDITOR'S TRAINING-DAY SELECT DOES NOT GO THROUGH `setDay`, which is a blind
  // positional replace with no collision check — picking a weekday another day in the week
  // already held put two days on one weekday, and the Grid finds a day BY weekday, so the
  // second became unreachable while the document still held it. `dbuAssignWeekday` is the
  // same rule the Grid's drag uses, so the two controls cannot answer differently.
  // Clearing a weekday needs no separate branch: no day can equal `undefined`, so it moves
  // this day and displaces nothing.
  const setDayWeekday = (n) => setWeeks(doc.weeks.map((w, wi) => (wi === sel.w ? dbuAssignWeekday(w, sel.d, n) : w)));

  const duplicateWeek = (wi) => {
    const next = JSON.parse(JSON.stringify(doc.weeks[wi]));
    setWeeks([...doc.weeks.slice(0, wi + 1), next, ...doc.weeks.slice(wi + 1)]);
  };
  // Every per-week action in one place, so the grid's gutter and any later caller
  // cannot drift into two versions of "duplicate a week".
  const onWeek = (action, wi) => {
    if (action === "duplicate") return duplicateWeek(wi);
    if (action === "deload") return toggleDeload(wi);
    if (action === "progress") {
      const next = DashBuilder.applyProgression(doc.weeks[wi]);
      return setWeeks([...doc.weeks.slice(0, wi + 1), next, ...doc.weeks.slice(wi + 1)]);
    }
    if (action === "remove" && doc.weeks.length > 1) {
      setWeeks(doc.weeks.filter((_, i) => i !== wi));
      setSel({ w: -1, d: -1 });
    }
  };
  const toggleDeload = (wi) => {
    const w = doc.weeks[wi];
    if (w.deload) setWeeks(doc.weeks.map((x, i) => (i === wi ? { ...x, deload: false } : x))); // unflag; sets stay as edited
    else setWeeks(doc.weeks.map((x, i) => (i === wi ? DashBuilder.deloadWeek(x) : x)));
  };

  const previewCard = day ? DashBuilder.dayToClientCard(day, { coach: "you" }) : null;
  const saveLabel = saveState === "saving" ? "Saving…" : saveState === "dirty" ? "Draft on this device" : saveState === "error" ? "Save failed · draft retained" : live ? "Saved" : "Draft saved locally";

  // The reference Monday the dates on this page are drawn for. It lives ON the document
  // (`detail.builder.previewStart`) so it survives a reload, and it is a REFERENCE only —
  // ⚠ each client's real start is still chosen per client at assign, which is why the
  // header says so in as many words rather than letting a coach read it as the start.
  const startISO = doc.previewStart || dbuNextMonday();
  const setStart = (iso) => setDoc({ ...doc, previewStart: iso });
  const dates = React.useMemo(() => dbuDateMap(doc, startISO), [doc, startISO]);
  const summary = React.useMemo(() => dbuSummary(doc, dates), [doc, dates]);
  const weekdayLabel = summary.weekdays.length ? summary.weekdays.map((i) => DBU_DOW[i]).join(" ") : "no weekdays set";

  return (
    <fieldset disabled={!!uploads} style={{border:0,padding:0,margin:0,minWidth:0}}>
      {/* ⚠ INLINE, NOT A NAMED CONSTANT. `tests/site-nav.test.mjs` requires every <style>
          child to be a plain template literal: a stray backtick in a CSS comment closes the
          template early and builds an EXPRESSION that parses, builds, tests green and throws
          at render — it cost ~70 pages their chrome once. Behind an identifier this
          stylesheet would be invisible to the one sweep that catches that. */}
      <style>{`
.dbu2{background:${DBU_PG};color:${DBU_INK};font-family:${DBU_BODY};font-size:14px;line-height:1.45;border-radius:14px;padding:22px 24px 30px}
.dbu2 *{box-sizing:border-box}
.dbu2 button{font-family:inherit}
.dbu2 input,.dbu2 select,.dbu2 textarea{font-family:inherit;color:${DBU_INK}}
.dbu2 :focus-visible{outline:2px solid ${DBU_TEAL};outline-offset:2px}
.dbu2 h1{font-family:${DBU_DISPLAY};font-weight:600;font-variation-settings:'wdth' 112;font-size:34px;letter-spacing:-.01em;margin:0;line-height:1.05;color:${DBU_INK}}
.dbu2 .hd{display:flex;align-items:flex-start;gap:18px;flex-wrap:wrap;margin-bottom:18px}
.dbu2 .meta{font-size:14px;color:${DBU_INK2};margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.dbu2 .chip{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border-radius:7px;font-size:13px;font-weight:600;background:${DBU_WH};border:1px solid ${DBU_LINE2};color:${DBU_INK};white-space:nowrap}
.dbu2 .chip.rust{background:${DBU_RUSTBG};border-color:transparent;color:${DBU_RUST}}
.dbu2 .chip.gold{background:${DBU_GOLDBG};border-color:transparent;color:${DBU_GOLD}}
.dbu2 .chip.q{background:transparent;border-color:transparent;color:${DBU_INK2};font-weight:500;padding:0 2px}
.dbu2 .acts{margin-left:auto;display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding-top:2px}
.dbu2 .saved{font-size:13px;color:${DBU_INK3}}
.dbu2 .tog{display:inline-flex;align-items:center;gap:8px;font-size:14px;color:${DBU_INK2};font-weight:500;background:transparent;border:0;cursor:pointer;height:40px;padding:0}
.dbu2 .tog i{width:36px;height:20px;border-radius:10px;background:${DBU_LINE2};position:relative;display:inline-block}
.dbu2 .tog[aria-pressed="true"]{color:${DBU_INK}}
.dbu2 .tog[aria-pressed="true"] i{background:${DBU_TEAL}}
.dbu2 .tog i::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:left .14s}
.dbu2 .tog[aria-pressed="true"] i::after{left:18px}
.dbu2 .seg{display:inline-flex;gap:3px;background:${DBU_PG};border:1px solid ${DBU_LINE2};border-radius:9px;padding:3px;height:40px;align-items:center}
.dbu2 .seg button{display:inline-flex;align-items:center;gap:7px;height:32px;padding:0 13px;border:0;border-radius:7px;font-size:13.5px;font-weight:600;color:${DBU_INK2};white-space:nowrap;background:transparent;cursor:pointer}
.dbu2 .seg button[aria-pressed="true"]{background:${DBU_WH};color:${DBU_INK};box-shadow:0 1px 2px rgba(0,0,0,.14)}
.dbu2 .seg button i{font-style:normal;font-size:13px;line-height:1;opacity:.85}
.dbu2 .tb{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px}
.dbu2 .wg{display:grid;grid-template-columns:150px repeat(7,minmax(0,1fr));gap:8px}
.dbu2 .wg .h{font-size:12px;font-weight:700;color:${DBU_INK3};text-transform:uppercase;letter-spacing:.06em;padding:0 0 4px 10px}
.dbu2 .wg .wk{padding:10px 8px 10px 0}
.dbu2 .wg .wk b{display:block;font-size:15px;font-weight:700}
.dbu2 .wg .wk span{display:block;font-size:13px;color:${DBU_INK2};margin-top:2px}
.dbu2 .wg .wk .dl{display:inline-block;margin-top:8px;font-size:12px;padding:3px 8px;border-radius:6px;background:${DBU_GOLDBG};color:${DBU_GOLD};font-weight:600}
.dbu2 .wg .wk .tools{display:flex;gap:4px;flex-wrap:wrap;margin-top:8px}
.dbu2 .wg .wk .tools button{height:26px;padding:0 8px;border-radius:6px;border:1px solid ${DBU_LINE2};background:${DBU_WH};font-size:12px;font-weight:600;color:${DBU_INK2};cursor:pointer}
.dbu2 .wg .wk .tools button[aria-pressed="true"]{background:${DBU_GOLDBG};border-color:transparent;color:${DBU_GOLD}}
.dbu2 .wg .c{background:${DBU_WH};border:1px solid ${DBU_LINE};border-radius:10px;min-height:112px;padding:9px 10px;position:relative;text-align:left;width:100%;cursor:pointer;display:block}
.dbu2 .wg .c .d{display:block;font-size:13px;color:${DBU_INK3};font-variant-numeric:tabular-nums}
.dbu2 .wg .c.rest{background:${DBU_REST};border-color:transparent}
.dbu2 .wg .c.rest .r{display:block;position:absolute;left:10px;bottom:9px;font-size:12.5px;color:${DBU_INK3}}
.dbu2 .wg .c.rest:hover,.dbu2 .wg .c.rest:focus-visible{border:1.5px dashed ${DBU_TEAL};background:${DBU_TEALBG}}
.dbu2 .wg .c.rest:hover .r,.dbu2 .wg .c.rest:focus-visible .r{color:${DBU_TEAL};font-weight:700}
.dbu2 .wg .s{display:block;margin-top:8px;border-left:3px solid ${DBU_RUST};background:${DBU_RUSTBG};border-radius:6px;padding:7px 9px}
.dbu2 .wg .s b{display:block;font-size:14px;font-weight:700;line-height:1.2}
.dbu2 .wg .s span{display:block;font-size:12px;color:${DBU_INK2};margin-top:3px}
.dbu2 .wg .c.on{outline:2px solid ${DBU_TEAL};border-color:transparent}
.dbu2 .sh{width:100%;border-collapse:separate;border-spacing:0;background:${DBU_WH};border:1px solid ${DBU_LINE};border-radius:12px;overflow:hidden;table-layout:fixed}
.dbu2 .sh th{text-align:left;padding:12px 12px 10px;border-bottom:1px solid ${DBU_LINE};vertical-align:top;font-weight:600;font-size:14px;background:${DBU_PG}}
.dbu2 .sh th small{display:block;font-size:12.5px;color:${DBU_INK2};font-weight:500;margin-top:2px}
.dbu2 .sh th .dl{display:inline-block;margin-top:5px;font-size:11.5px;padding:2px 7px;border-radius:5px;background:${DBU_GOLDBG};color:${DBU_GOLD};font-weight:700}
.dbu2 .sh td{padding:8px 12px;border-bottom:1px solid ${DBU_LINE};vertical-align:middle;font-size:14px}
.dbu2 .sh tr.band td{background:${DBU_RUSTBG};padding:11px 12px}
.dbu2 .sh tr.band .bn{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.dbu2 .sh tr.band .bn b{font-size:15px;font-weight:700}
.dbu2 .sh tr.band .bn button{background:transparent;border:0;padding:0;min-height:24px;cursor:pointer;font:inherit;color:inherit;text-align:left}
.dbu2 .sh tr.band .hint{margin-left:auto;font-size:13px;color:${DBU_INK2}}
.dbu2 .sh .en b{display:block;font-size:14.5px;font-weight:600}
.dbu2 .sh .en span{display:block;font-size:12px;color:${DBU_INK3};margin-top:1px}
.dbu2 .sh .cell{display:inline-flex;flex-direction:column;justify-content:center;width:100%;min-width:0;height:52px;padding:0 10px;border:1px solid ${DBU_LINE2};border-radius:8px;background:${DBU_WH};font-variant-numeric:tabular-nums;line-height:1.15}
.dbu2 .sh .cell input{border:0;background:transparent;padding:0;width:100%;height:24px;font-variant-numeric:tabular-nums;outline:none}
.dbu2 .sh .cell input.a{font-size:14px;font-weight:600;color:${DBU_INK}}
.dbu2 .sh .cell input.b{font-size:12px;color:${DBU_INK2}}
.dbu2 .sh .cell.dl{background:${DBU_PG}}
.dbu2 .sh .cell.dl input.b{color:${DBU_GOLD};font-weight:600}
.dbu2 .sh .cell .div{font-size:12px;color:${DBU_GOLD};font-weight:600}
.dbu2 .sh tr.add td{padding:9px 12px}
.dbu2 .sh tr.add button{color:${DBU_TEAL};font-weight:600;font-size:13.5px;background:transparent;border:0;cursor:pointer;padding:0;min-height:24px}
.dbu2 .back{background:transparent;border:0;padding:4px 0;min-height:24px;cursor:pointer;font-size:13.5px;color:${DBU_INK2}}
.dbu2 .chip input[type="date"]{border:0;background:transparent;font:inherit;color:inherit;padding:0;height:26px;outline:none}
.dbu2 input[type="checkbox"]{width:24px;height:24px;accent-color:${DBU_TEAL}}
.dbu2 .sh .none{color:${DBU_INK3};text-align:center;display:block}
.dbu2 .addday{display:inline-flex;align-items:center;gap:8px;height:40px;padding:0 14px;border:1.5px dashed ${DBU_LINE2};border-radius:9px;justify-content:center;font-size:14px;font-weight:600;color:${DBU_TEAL};background:transparent;cursor:pointer;margin-top:14px}
.dbu2 .stage{position:relative}
.dbu2 .drawer{background:${DBU_WH};border:1px solid ${DBU_LINE};border-radius:14px;box-shadow:0 18px 50px rgba(21,33,30,.16);padding:20px 22px 18px}
.dbu2 .drawer.float{position:absolute;top:-8px;right:-10px;width:400px;max-height:calc(100vh - 140px);overflow-y:auto;z-index:40}
@media(max-width:1100px){.dbu2 .drawer.float{position:static;width:auto;max-height:none;margin-top:16px}}
.dbu2 .drawer .dh{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:6px;flex-wrap:wrap}
.dbu2 .drawer .dh b{font-size:19px;font-weight:700;letter-spacing:-.01em}
.dbu2 .drawer .when{font-size:13.5px;color:${DBU_INK2};margin-bottom:14px}
.dbu2 .drawer .when b{color:${DBU_RUST};font-weight:700}
.dbu2 .pop{position:fixed;right:20px;bottom:20px;width:344px;max-width:calc(100vw - 40px);max-height:calc(100vh - 120px);overflow-y:auto;z-index:60;background:${DBU_WH};border:1px solid ${DBU_LINE};border-radius:14px;box-shadow:0 18px 50px rgba(21,33,30,.16);padding:16px 18px 18px}
.dbu2 .pop .ph2{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
.dbu2 .pop .ph2 b{font-size:15px;font-weight:700}
.dbu2 .x{height:32px;padding:0 11px;border-radius:8px;border:1px solid ${DBU_LINE};background:${DBU_WH};color:${DBU_INK2};font-size:13px;font-weight:600;cursor:pointer}
.dbu2 .scroll{overflow-x:auto}
`}</style>
      <div className="dbu2">
        {/* ── Header ──────────────────────────────────────────────────────────
            One row that never moves between the two views: who this is, when it is
            drawn for, what it adds up to, and the one primary action. */}
        <div className="hd">
          <div style={{ minWidth: 260, flex: "1 1 320px" }}>
            <button type="button" className="back" onClick={leave} disabled={!!uploads} style={{ marginBottom: 6 }}>← Library</button>
            <input aria-label="Workout or program name" value={name} onChange={(e) => setName(e.target.value)}
              style={{ fontFamily: DBU_DISPLAY, fontWeight: 600, fontVariationSettings: "'wdth' 112", fontSize: 34, letterSpacing: "-.01em", lineHeight: 1.05, color: DBU_INK,
                background: "transparent", border: 0, borderBottom: "1px solid transparent", padding: 0, width: "100%", outline: "none" }}
              onFocus={(e) => { e.target.style.borderBottomColor = DBU_LINE2; }}
              onBlur={(e) => { e.target.style.borderBottomColor = "transparent"; }} />
            <div className="meta">
              <span className="chip rust">{dbuGoalTag(doc.goalTag).label}</span>
              <span className="chip">
                Starts
                <input type="date" aria-label="Reference start Monday the dates on this page are drawn for"
                  value={startISO} onChange={(e) => setStart(dbuMondayOf(e.target.value) || startISO)} />
              </span>
              <span className="chip q">{summary.weeks} {summary.weeks === 1 ? "week" : "weeks"} · {weekdayLabel} · {summary.sessions} {summary.sessions === 1 ? "session" : "sessions"}{summary.last ? " · last " + dbuShortDate(summary.last) : ""}</span>
              <span className="saved">v{doc.version} · {saveLabel}</span>
            </div>
            {/* ⚠ The reference Monday is a REFERENCE. Each client's real start is chosen per
                client at assign, so the page says so rather than letting a coach read this
                as the start date their clients get. */}
            <div className="saved" style={{ marginTop: 6 }}>Each client's own start is chosen at assign.</div>
          </div>
          <div className="acts">
            <button type="button" className="tog" onClick={() => setPreview(!preview)} aria-pressed={preview}>
              <i aria-hidden="true" />Preview as client
            </button>
            <button type="button" disabled={!!uploads || saveState === "saving"} onClick={() => flush(true)} style={dbuBtn(false)}>Publish</button>
            <button type="button" disabled={!!uploads} onClick={async () => { if (await flush()) setAssigning(true); }} style={dbuBtn(true, DBU_RUST)}>Assign to clients →</button>
          </div>
        </div>

        {/* ⚠ F6 retires *Save draft* and *Publish template* into autosave + Publish — but the
            header's button was ALSO the retry (it re-labelled itself "Retry save" on failure),
            so removing it outright would have left a coach whose save failed with no way to
            try again short of editing something else. The retry moves here, beside the other
            two recovery actions, rather than disappearing with the verb. */}
        {error && (
          <div role="alert" style={{ fontSize: 13.5, color: DBU_RUST, background: DBU_RUSTBG, borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
            <p style={{ margin: "0 0 10px" }}>{error}</p>
            <button type="button" disabled={!!uploads || saveState === "saving"} style={{ ...dbuBtn(false), marginRight: 8 }} onClick={() => flush()}>Retry save</button>
            <button type="button" style={{ ...dbuBtn(false), marginRight: 8 }} onClick={() => { if (draft(latest.current)) onBack(); else setError("This browser could not retain your draft. Keep this page open and retry saving."); }}>Keep draft &amp; return to library</button>
            {saveConflict && <button type="button" disabled={!!uploads || saveState === "saving"} style={dbuBtn(false)} onClick={saveAsCopy}>Save as new copy</button>}
          </div>
        )}
        {doc.outlineOnly && <p style={{ fontSize: 13.5, color: DBU_INK2 }}>This imported outline has day or week titles only. Add exercises before assigning it as a structured workout.</p>}

        {/* ── Toolbar ─────────────────────────────────────────────────────── */}
        <div className="tb">
          <DbuViewSwitch view={view} setView={setView} />
          <div style={{ flex: 1 }} />
          {/* ⚠ "Reuse a saved day" survives the retired tree. It is the one control there with
              no home in either canvas, and dropping it would have removed a shipped feature in
              a layout PR. Its developer-voice label (F10) is what changed, not its behaviour. */}
          {!!dayTemplates?.length && (
            <select aria-label="Add a saved day to week 1" value="" style={{ ...dbuField, cursor: "pointer" }}
              onChange={(e) => {
                const savedDay = dayTemplates[Number(e.target.value)];
                if (!savedDay) return;
                const next = JSON.parse(JSON.stringify(savedDay.day));
                next.id = crypto.randomUUID();
                const target = Math.max(0, sel.w);
                if (!dbuHasWeekday(next)) next.weekday = dbuNextFreeWeekday(doc.weeks[target]);
                setWeeks(doc.weeks.map((w, i) => (i === target ? { ...w, days: [...w.days, next] } : w)));
              }}>
              <option value="">Add a saved day…</option>
              {dayTemplates.map((x, i) => <option key={i} value={i}>{x.name}</option>)}
            </select>
          )}
          <button type="button" style={dbuBtn(false)} onClick={() => setWeeks([...doc.weeks, { ...DashBuilder.newWeek(), days: [{ ...DashBuilder.newDay("Day 1"), weekday: 0 }] }])}>＋ Week</button>
        </div>

        {/* ⚠ F1 (P0): `.dbu-layout` DECLARED TWO COLUMNS AND HAD THREE CHILDREN, so the client
            preview wrapped into the second grid row — inside the 210px tree column, measured at
            1,413px below the fold, where `position:sticky` cannot lift it because the cell it
            sticks inside IS that row. A coach ticked the box, saw nothing change, and concluded
            the control did nothing.
            ⚠ AND NEVER THREE COLUMNS, which is measured rather than preferred: at 1440 the
            content area is 1,104px, so a canvas beside BOTH a 400px editor and a 340px preview
            is 332px — at which the grid clips Sunday and the sheet clips the very week columns
            it exists to read left to right. So the preview takes the panel slot in Sheet (where
            cells are edited inline anyway) and floats as a popover in Grid (where the panel IS
            how you edit). Both views keep a ~690px canvas with the preview open. */}
        <div className="stage">
          {view === "grid"
            ? <DbuGrid doc={doc} dates={dates} sel={sel} setSel={setSel} setWeeks={setWeeks} uploads={uploads} onWeek={onWeek} />
            : <DbuSheet doc={doc} dates={dates} setSel={setSel} setWeeks={setWeeks} />}

          {/* The day editor, unchanged — every engine control it carries survives the redesign.
              ⚠ IT FLOATS OVER THE CANVAS rather than sitting beside it, which is the board's own
              `.drawer` and is what keeps the canvas full width: as a column it left the grid
              640px — measured — at which "Rest · ＋ Add session" wraps to three lines and the
              sheet's week columns are clipped. Below 1100px it drops back into the flow. */}
          {day && (
            <div className="drawer float">
              <div className="dh">
                <b>{day.name}</b>
                {view === "grid" && <button type="button" className="x" onClick={() => setView("sheet")} title="See this move across every week">Edit all {doc.weeks.length} weeks in the sheet</button>}
                {/* ⚠ The tree carried a per-day Copy button; the grid moves a day by dragging it
                    to another weekday, which is a different action. Duplication would have been
                    lost with the tree, so it lands here — on the day it is about. */}
                <button type="button" className="x" aria-label={"Duplicate " + day.name} onClick={() => {
                  const next = JSON.parse(JSON.stringify(day));
                  next.name += " (copy)";
                  next.id = crypto.randomUUID();
                  next.weekday = dbuNextFreeWeekday(doc.weeks[sel.w]);
                  setWeeks(doc.weeks.map((x, i) => (i === sel.w ? { ...x, days: [...x.days.slice(0, sel.d + 1), next, ...x.days.slice(sel.d + 1)] } : x)));
                  setSel({ w: sel.w, d: sel.d + 1 });
                }}>Duplicate day</button>
                <button type="button" className="x" aria-label="Close the day editor" onClick={() => setSel({ w: -1, d: -1 })}>Done</button>
              </div>
              <div className="when">Week {sel.w + 1}{dates[sel.w + ":" + sel.d] ? <> · <b>{dbuShortDate(dates[sel.w + ":" + sel.d])}</b></> : null}</div>
              <DbuDayEditor
                day={day}
                onChange={setDay}
                onWeekday={setDayWeekday}
                takenBy={dbuTakenByWeekday(week, sel.d)}
                playlists={playlists}
                clips={clips}
                onUploading={uploadCount}
              />
            </div>
          )}

        </div>

        {/* Client preview — the EXACT card the client dashboard renders, as the board's `.pop`. */}
        {preview && (
          <div className="pop" role="dialog" aria-label="Client preview">
            <div className="ph2">
              <b>Client preview</b>
              <button type="button" className="x" onClick={() => setPreview(false)} aria-label="Close the client preview">Close</button>
            </div>
            {previewCard
              ? <DashWorkoutCard workout={previewCard} interactive={false} maxRows={99} />
              : <div style={{ color: DBU_INK3, fontSize: 13.5 }}>Pick a session to see what the client gets.</div>}
          </div>
        )}
      </div>

      {assigning && <DbuAssignModal template={{ id: idRef.current, name, revision: revision.current }} doc={doc} clients={clients} queue={queue} live={live} onClose={() => setAssigning(false)} />}
    </fieldset>
  );
}

// ── Performance zone ─────────────────────────────────────────────────────────
function DbuPerformance({ template, live }) {
  const perf = live ? null : DashBuilder.demoPerformance(template.id);
  if (!perf) {
    return <div style={{ fontSize: 12.5, color: DBU_INK50, lineHeight: 1.55 }}>Performance tracks from your first assignment of this template — subscriber, completion, and drop-off data appear once clients run it.</div>;
  }
  const max = Math.max(...perf.retention, 1);
  return (
    <div>
      <div style={{ display: "flex", gap: 22, marginBottom: 12 }}>
        <div><div style={{ fontFamily: "'Fraunces', serif", fontSize: 24, lineHeight: 1 }}>{perf.subscribers}</div><div style={{ fontFamily: DBU_MONO, fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: DBU_INK50, marginTop: 4 }}>Active subscribers</div></div>
        <div><div style={{ fontFamily: "'Fraunces', serif", fontSize: 24, lineHeight: 1 }}>{perf.completion}%</div><div style={{ fontFamily: DBU_MONO, fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: DBU_INK50, marginTop: 4 }}>Completion rate</div></div>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 64 }}>
        {perf.retention.map((v, i) => (
          <div key={i} title={"Week " + (i + 1) + " · " + v + "% retained"} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, height: "100%", justifyContent: "flex-end" }}>
            <div style={{ width: "100%", height: Math.round((v / max) * 100) + "%", background: v >= 70 ? "#2ee0c4" : v >= 50 ? "#d8a23a" : "#e0644b", borderRadius: 1, opacity: 0.85 }} />
            <span style={{ fontFamily: DBU_MONO, fontSize: 7, color: DBU_INK50 }}>W{i + 1}</span>
          </div>
        ))}
      </div>
      <div style={{ fontFamily: DBU_MONO, fontSize: 8.5, letterSpacing: "0.08em", color: DBU_INK50, marginTop: 8 }}>
        Per-week retention · drop-off at {(() => { let worst = 1, drop = 0; for (let i = 1; i < perf.retention.length; i++) { const d = perf.retention[i - 1] - perf.retention[i]; if (d > drop) { drop = d; worst = i + 1; } } return "week " + worst + " (−" + drop + " pts)"; })()}
      </div>
    </div>
  );
}

// ── The page ─────────────────────────────────────────────────────────────────
function TrainerProgramsPage() {
  const {clients,queue,today:live,source}=useDashboard('trainer');
  const [templates,setTemplates]=React.useState(null),[view,setView]=React.useState(null);
  const [tagFilter,setTagFilter]=React.useState('all'),[error,setError]=React.useState('');
  const [ownerId,setOwnerId]=React.useState(null),[refresh,setRefresh]=React.useState(0);
  const libraryOwner = React.useRef(null);
  const [playlists,setPlaylists]=React.useState([]),[assignFor,setAssignFor]=React.useState(null),[updateFor,setUpdateFor]=React.useState(null);
  const [recoveries,setRecoveries]=React.useState([]);
  const isLive=!!ownerId;
  React.useEffect(()=>{
    let on=true;
    (async()=>{
      try{
        const res=await fetch('/api/coach/plans?kind=program',{credentials:'same-origin'});
        const data=await res.json().catch(()=>null);
        if(!res.ok || !data)throw new Error(data?.error || 'Could not load your workouts. Check your connection and retry.');
        if(on){if(libraryOwner.current!==data.ownerId){setView(null);setAssignFor(null);setUpdateFor(null);}libraryOwner.current=data.ownerId;setOwnerId(data.ownerId);setTemplates((data.plans||[]).map(ShapeWorkoutDocument.normalizeWorkoutPlan));setError('');setRecoveries(Object.entries(dbuReadDrafts(data.ownerId)));}
      }catch(e){if(on){if(source==='demo' && !libraryOwner.current){setTemplates(DashBuilder.demoTemplates());setRecoveries(Object.entries(dbuReadDrafts(null)));setError('');}else{setError(e.message || 'Could not load your workouts. Check your connection and retry.');setTemplates(null);}}}
      try{const res=await fetch('/api/coach/soundtracks',{credentials:'same-origin'});if(!res.ok)return;const data=await res.json();if(on)setPlaylists((data.soundtracks||data.playlists||[]).map(x=>({name:x.name,meta:x.track_count?x.track_count+' tracks':''})));}catch(e){}
    })();
    return()=>{on=false;};
  },[source,refresh]);
  React.useEffect(()=>{const update=()=>{if(!document.hidden)setRefresh(n=>n+1);};window.addEventListener('focus',update);document.addEventListener('visibilitychange',update);return()=>{window.removeEventListener('focus',update);document.removeEventListener('visibilitychange',update);};},[]);
  const list=(templates||[]).filter(t=>tagFilter==='all'||t.detail.builder.goalTag===tagFilter);
  const days=(templates||[]).flatMap(t=>t.detail.builder.weeks.flatMap(w=>w.days.map(day=>({name:t.name+' · '+day.name,day}))));
  const clips=[...new Map((templates||[]).flatMap(t=>[
    ...(t.detail.media||[]).filter(m=>m.type==='video').map(m=>({name:m.name||t.name,url:ShapeWorkoutDocument.videoUrl(m.url)})),
    ...t.detail.builder.weeks.flatMap(w=>w.days.flatMap(d=>d.blocks.flatMap(b=>b.rows.filter(r=>r.video).map(r=>({name:r.name,url:ShapeWorkoutDocument.videoUrl(r.video)}))))),
  ]).filter(c=>c.url).map(c=>[c.url,c])).values()];
  const create=type=>{const builder=DashBuilder.newProgram();builder.weeks[0].days[0].name=type==='workout'?'Upper':'Day 1';setView({name:type==='workout'?'Upper':'New program',published:false,detail:{buildType:type,builder}});};
  const saved=({plan})=>{setTemplates(prev=>[plan,...(prev||[]).filter(t=>t.id!==plan.id)]);setRecoveries(Object.entries(dbuReadDrafts(ownerId)));};
  return <React.Fragment>
    {source==='demo'&&<DashDemoBand/>}
    <DashPage tourHero="hero-programs" navItems={trainerNavItems('programs')} payoutCard={live?{label:'MONTHLY · NET',amount:live.kpis.monthlyNetCents!=null?dashMoney(live.kpis.monthlyNetCents):'—',sub:live.kpis.activeClients+' active clients'}:trainerPayoutCard}
      eyebrow="WORKOUT LIBRARY" title={<>Workouts <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 500, fontSize: "0.86em", letterSpacing: 0 }}>&amp;</span> programs</>} subtitle={view?'Build once. Use the same workout on the website and app.':'Reusable single days and programs, with demonstrations attached to each exercise.'}>
      {view?<DbuBuilder key={view.id||view.name} template={view} clients={clients} queue={queue} live={isLive} ownerId={ownerId} playlists={playlists} clips={clips} dayTemplates={days} onBack={()=>{setView(null);setRefresh(n=>n+1);}} onSaved={saved}/>:<>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:16}}><button style={dbuBtn(true)} onClick={()=>create('workout')}>+ Single workout day</button><button style={dbuBtn(false)} onClick={()=>create('program')}>+ Program</button><button style={dbuBtn(false)} onClick={()=>setRefresh(n=>n+1)}>Refresh</button></div>
        {!!recoveries.length&&<div role="status" style={{padding:14,border:'1px solid #d8a23a',marginBottom:16}}><strong>Recover your work</strong>{recoveries.map(([id,draft])=><div key={id} style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',marginTop:8}}><span>{draft.name} · draft on this device</span><button style={dbuBtn(false)} onClick={()=>setView(dbuRecoveredTemplate(id,draft,templates))}>Resume draft</button></div>)}</div>}
        {error&&<p role="alert">{error} <button style={dbuBtn(false)} onClick={()=>setRefresh(n=>n+1)}>Retry</button></p>}
        <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:14}}>{[['all','All'],...DashBuilder.GOAL_TAGS.map(g=>[g.key,g.label])].map(([k,l])=><button key={k} aria-pressed={tagFilter===k} onClick={()=>setTagFilter(k)} style={dbuBtn(tagFilter===k)}>{l}</button>)}</div>
        {templates===null&&!error&&<p role="status">Loading workouts…</p>}
        {templates?.length===0&&<p>No workouts yet. Create a single day or program to start your library.</p>}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(290px,100%),1fr))',gap:14}}>{list.map(t=>{const b=t.detail.builder;return <div key={t.id} className="dash-plate" style={{'--dac':DBU_RUST}}><div style={dbuLabel}>{t.detail.buildType==='workout'?'Single day':'Program'} · {t.published?'Published':'Draft'}</div><h2 style={{fontFamily:"'Fraunces',serif",fontSize:23}}>{t.name}</h2><p style={{fontSize:13,color:DBU_INK50}}>{b.weeks.length} weeks · {b.weeks.reduce((n,w)=>n+w.days.length,0)} days</p><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button style={dbuBtn(true)} onClick={()=>setView(t)}>Edit workout</button><button style={dbuBtn(false)} onClick={()=>setAssignFor(t)}>Assign</button>{isLive&&<button style={dbuBtn(false)} onClick={()=>setUpdateFor(t)}>Update future assignments</button>}<button style={dbuBtn(false)} onClick={()=>setView({...JSON.parse(JSON.stringify(t)),id:undefined,published:false,name:t.name+' (copy)',detail:{...t.detail,revision:0}})}>Duplicate</button></div></div>;})}</div>
      </>}
    </DashPage>
    {updateFor&&<DbuFutureUpdates template={updateFor} clients={clients} onClose={()=>setUpdateFor(null)}/>}
    {assignFor&&<DbuAssignModal template={{id:assignFor.id,name:assignFor.name,revision:assignFor.detail.revision}} doc={assignFor.detail.builder} clients={clients} queue={queue} live={isLive} onClose={()=>setAssignFor(null)}/>}
  </React.Fragment>;
}

Object.assign(window, { TrainerProgramsPage, DbuBuilder, DbuAssignModal, DbuPerformance });
