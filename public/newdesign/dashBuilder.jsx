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

const DBU_INK50 = "rgba(242,237,228,0.55)";
const DBU_MONO = "'JetBrains Mono', monospace";
const DBU_RUST = "#c0533b";

function dbuBtn(primary, c) {
  const col = c || "#2ee0c4";
  return primary
    ? { fontFamily: DBU_MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#06231f", background: col, border: 0, borderRadius: 4, padding: "9px 13px", minHeight: 40, cursor: "pointer" }
    : { fontFamily: DBU_MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(242,237,228,0.7)", background: "transparent", border: "1px solid rgba(242,237,228,0.18)", borderRadius: 4, padding: "9px 13px", minHeight: 40, cursor: "pointer" };
}
const dbuField = { boxSizing: "border-box", padding: "7px 9px", borderRadius: 4, border: "1px solid rgba(242,237,228,0.16)", background: "rgba(242,237,228,0.04)", color: "#f2ede4", fontFamily: "'Space Grotesk', sans-serif", fontSize: 12.5, outline: "none" };
const dbuLabel = { fontFamily: DBU_MONO, fontSize: 10, letterSpacing: "0.05em", textTransform: "uppercase", color: DBU_INK50, display: "block", marginBottom: 3 };

function dbuGoalTag(key) {
  return DashBuilder.GOAL_TAGS.find((g) => g.key === key) || DashBuilder.GOAL_TAGS[1];
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
function DbuDayEditor({ day, onChange, playlists, clips, onUploading }) {
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
        <label><span style={dbuLabel}>Training day</span><select value={day.weekday ?? ''} onChange={e=>onChange({...day,weekday:e.target.value===''?undefined:Number(e.target.value)})} style={dbuField}><option value="">In sequence from start</option>{['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map((d,i)=><option key={d} value={i}>{d}</option>)}</select></label>
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
function DbuBuilder({ template, clients, queue, live, playlists, ownerId, clips, dayTemplates, onBack, onSaved }) {
  const ownerRef = React.useRef(ownerId);
  const initial = React.useRef(template.recovered || {name:template.name,doc:template.detail.builder,revision:template.detail.revision || 0});
  const [name, setName] = React.useState(initial.current.name);
  const [doc, setDoc] = React.useState(() => JSON.parse(JSON.stringify(initial.current.doc)));
  const [sel, setSel] = React.useState({w:0,d:0});
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
  const dragRef = React.useRef(null), active=React.useRef(true), flight=React.useRef(null);
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

  const duplicateWeek = (wi) => {
    const next = JSON.parse(JSON.stringify(doc.weeks[wi]));
    setWeeks([...doc.weeks.slice(0, wi + 1), next, ...doc.weeks.slice(wi + 1)]);
  };
  const toggleDeload = (wi) => {
    const w = doc.weeks[wi];
    if (w.deload) setWeeks(doc.weeks.map((x, i) => (i === wi ? { ...x, deload: false } : x))); // unflag; sets stay as edited
    else setWeeks(doc.weeks.map((x, i) => (i === wi ? DashBuilder.deloadWeek(x) : x)));
  };
  const moveDay = (wi, di, to) => {
    if (to < 0 || to >= doc.weeks[wi].days.length) return;
    const days = [...doc.weeks[wi].days];
    const [d] = days.splice(di, 1);
    days.splice(to, 0, d);
    setWeeks(doc.weeks.map((w, i) => (i === wi ? { ...w, days } : w)));
    if (sel.w === wi && sel.d === di) setSel({ w: wi, d: to });
  };

  const previewCard = day ? DashBuilder.dayToClientCard(day, { coach: "you" }) : null;
  const saveLabel = saveState === "saving" ? "Saving…" : saveState === "dirty" ? "Draft on this device" : saveState === "error" ? "Save failed · draft retained" : live ? "Saved" : "Draft saved locally";

  return (
    <fieldset disabled={!!uploads} style={{border:0,padding:0,margin:0,minWidth:0}}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <button disabled={!!uploads} onClick={leave} style={dbuBtn(false)}>← Library</button>
        <input aria-label="Workout or program name" value={name} onChange={(e) => setName(e.target.value)} style={{ ...dbuField, fontSize: 16, fontWeight: 500, minWidth: 240 }} />
        <DashPill c={dbuGoalTag(doc.goalTag).c}>{dbuGoalTag(doc.goalTag).label}</DashPill>
        <span style={{ fontFamily: DBU_MONO, fontSize: 8.5, color: DBU_INK50 }}>v{doc.version} · {saveLabel}</span>
        <div style={{ flex: 1 }} />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: DBU_MONO, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: preview ? "#2ee0c4" : DBU_INK50, cursor: "pointer" }}>
          <input type="checkbox" checked={preview} onChange={(e) => setPreview(e.target.checked)} /> Client preview
        </label>
        <button disabled={!!uploads || saveState==='saving'} onClick={()=>flush()} style={dbuBtn(false)}>{saveState==='error'?'Retry save':'Save draft'}</button>
        <button disabled={!!uploads || saveState==='saving'} onClick={()=>flush(true)} style={dbuBtn(false)}>Publish template</button>
        <button disabled={!!uploads} onClick={async()=>{if(await flush())setAssigning(true);}} style={{ ...dbuBtn(true, DBU_RUST), color: "#fff" }}>Assign to clients →</button>
      </div>

      {error && <div role="alert" style={{fontSize:13,color:'#e0644b'}}><p>{error}</p><button style={dbuBtn(false)} onClick={()=>{if(draft(latest.current))onBack();else setError('This browser could not retain your draft. Keep this page open and retry saving.');}}>Keep draft & return to library</button>{saveConflict && <button disabled={!!uploads || saveState==='saving'} style={{...dbuBtn(false),marginLeft:8}} onClick={saveAsCopy}>Save as new copy</button>}</div>}
      {doc.outlineOnly && <p style={{fontSize:13,color:DBU_INK50}}>This imported outline has day or week titles only. Add exercises before assigning it as a structured workout.</p>}
      <style>{`.dbu-layout{display:grid;grid-template-columns:210px minmax(0,1fr);gap:16;align-items:start}.dbu-layout>*{min-width:0}.dbu-layout input:focus-visible,.dbu-layout select:focus-visible,.dbu-layout button:focus-visible{outline:2px solid #2ee0c4;outline-offset:2px}@media(max-width:1000px){.dbu-layout{grid-template-columns:minmax(0,1fr)}}`}</style>
      <div className="dbu-layout">
        {/* Tree */}
        <div className="dash-plate" style={{ "--dac": DBU_RUST, padding: "14px 14px" }}>
          {doc.weeks.map((w, wi) => (
            <div key={wi} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontFamily: DBU_MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: DBU_RUST }}>Week {wi + 1}</span>
                {w.deload && <DashPill c="#7bbf5a">Deload</DashPill>}
              </div>
              <div style={{ display: "flex", gap: 5, margin: "6px 0 7px" }}>
                <button onClick={() => duplicateWeek(wi)} title="Copy this week unchanged" style={{ ...dbuBtn(false), padding: "3px 7px", fontSize: 8 }}>Duplicate</button>
                <button onClick={()=>{const next=DashBuilder.applyProgression(doc.weeks[wi]);setWeeks([...doc.weeks.slice(0,wi+1),next,...doc.weeks.slice(wi+1)]);}} title="Copy week with the configured load increases" style={{...dbuBtn(false),padding:'3px 7px',fontSize:8}}>Progress</button>
                <button onClick={() => toggleDeload(wi)} title="Deload: −40% volume, then edit freely" style={{ ...dbuBtn(false), padding: "3px 7px", fontSize: 8, color: w.deload ? "#7bbf5a" : undefined }}>Deload</button>
                {doc.weeks.length > 1 && <button onClick={() => { setWeeks(doc.weeks.filter((_, i) => i !== wi)); setSel({ w: 0, d: 0 }); }} style={{ ...dbuBtn(false), padding: "3px 7px", fontSize: 8, color: "#e0644b" }}>×</button>}
              </div>
              {w.days.map((d, di) => {
                const on = sel.w === wi && sel.d === di;
                return (
                  <div key={di} draggable={!uploads}
                    onDragStart={(e) => { if(uploads){e.preventDefault();return;} dragRef.current = { wi, di }; }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => { if(uploads)return;const f = dragRef.current; if (f && f.wi === wi) moveDay(wi, f.di, di); dragRef.current = null; }}
                    style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <button onClick={() => setSel({ w: wi, d: di })} style={{ flex: 1, textAlign: "left", cursor: "pointer", border: "1px solid " + (on ? DBU_RUST : "rgba(242,237,228,0.1)"), borderLeft: "3px solid " + (on ? DBU_RUST : "rgba(242,237,228,0.18)"), background: on ? "rgba(192,83,59,0.12)" : "transparent", color: "#f2ede4", borderRadius: 4, padding: "7px 9px", fontSize: 12.5 }}>
                      {d.name}
                      <span style={{ display: "block", fontFamily: DBU_MONO, fontSize: 8, color: DBU_INK50, marginTop: 2 }}>{d.blocks.reduce((s, b) => s + b.rows.length, 0)} moves{d.playlist ? " · ♪" : ""}</span>
                    </button>
                    <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <button onClick={() => moveDay(wi, di, di - 1)} aria-label="Move day up" style={{ ...dbuBtn(false), padding: "1px 5px", fontSize: 8 }}>▲</button>
                      <button onClick={()=>{const next=JSON.parse(JSON.stringify(d));next.name+=' (copy)';next.id=crypto.randomUUID();setWeeks(doc.weeks.map((x,i)=>i===wi?{...x,days:[...x.days.slice(0,di+1),next,...x.days.slice(di+1)]}:x));}} aria-label={'Duplicate '+d.name} style={{...dbuBtn(false),padding:'1px 5px',fontSize:8}}>Copy</button>
                      <button onClick={() => moveDay(wi, di, di + 1)} aria-label="Move day down" style={{ ...dbuBtn(false), padding: "1px 5px", fontSize: 8 }}>▼</button>
                    </span>
                  </div>
                );
              })}
              <button onClick={() => { setWeeks(doc.weeks.map((x, i) => (i === wi ? { ...x, days: [...x.days, DashBuilder.newDay("Day " + (x.days.length + 1))] } : x))); }} style={{ ...dbuBtn(false), padding: "3px 8px", fontSize: 8 }}>+ Day</button>
            </div>
          ))}
          <button onClick={() => setWeeks([...doc.weeks, DashBuilder.newWeek()])} style={dbuBtn(false)}>+ Week</button>
          {!!dayTemplates?.length && <label style={{display:'block',marginTop:12}}><span style={dbuLabel}>Reuse a saved day</span><select value="" style={{...dbuField,width:'100%'}} onChange={e=>{const savedDay=dayTemplates[Number(e.target.value)];if(!savedDay)return;const next=JSON.parse(JSON.stringify(savedDay.day));next.id=crypto.randomUUID();setWeeks(doc.weeks.map((w,i)=>i===sel.w?{...w,days:[...w.days,next]}:w));}}><option value="">Choose day…</option>{dayTemplates.map((x,i)=><option key={i} value={i}>{x.name}</option>)}</select></label>}
        </div>

        {/* Day editor */}
        <div className="dash-plate dash-plate--tick" style={{ "--dac": DBU_RUST, paddingLeft: 24 }}>
          {day ? <DbuDayEditor day={day} onChange={setDay} playlists={playlists} clips={clips} onUploading={uploadCount} /> : <div style={{ color: DBU_INK50, fontSize: 13 }}>Pick a day on the left.</div>}
        </div>

        {/* Client preview — the EXACT card the client dashboard renders */}
        {preview && (
          <div style={{ position: "sticky", top: 90 }}>
            <div style={{ fontFamily: DBU_MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: DBU_INK50, marginBottom: 8 }}>Client preview · their workout card</div>
            <div className="dash-plate dash-plate--tick dash-plate--bracket" style={{ "--dac": DBU_RUST, paddingLeft: 24 }}>
              <DashWorkoutCard workout={previewCard} interactive={false} maxRows={99} />
            </div>
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
      eyebrow="WORKOUT LIBRARY" title="Workouts & programs" subtitle={view?'Build once. Use the same workout on the website and app.':'Reusable single days and programs, with demonstrations attached to each exercise.'}>
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
