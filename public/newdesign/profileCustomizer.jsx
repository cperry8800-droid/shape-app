// LivingProfileCustomizer — website editor for the LIVING public profile
// (MemberProfile.html: Signal for coaches, Terrain for members). Reads/writes
// the SAME user_goals('profile_custom') document as the mobile Customizer, so
// edits made on either surface show on both. Used by TrainerProfile.html,
// NutritionistProfile.html and ClientMe.html (all account types).

const LPC_PROMPTS = ['Never skip', 'Pre-workout fuel', 'Currently chasing', 'Form check I love', 'My non-negotiable', 'Rest day looks like', 'A win this month', 'Training motto'];
const LPC_ACCENTS = ['#34d6c5', '#5ec8e0', '#7bbf5a', '#d8a23a', '#e0644b', '#e0518a', '#8a5cf6'];
const LPC_CLIMB_BGS = [
  { key: '', label: 'Paper', css: null },
  { key: 'dawn', label: 'Dawn', css: 'linear-gradient(165deg, rgba(224,165,68,0.30), rgba(224,100,75,0.12) 55%, rgba(224,165,68,0.04) 92%)' },
  { key: 'dusk', label: 'Dusk', css: 'linear-gradient(165deg, rgba(138,92,246,0.30), rgba(46,111,160,0.14) 60%, rgba(138,92,246,0.04) 92%)' },
  { key: 'alpine', label: 'Alpine', css: 'linear-gradient(180deg, rgba(94,200,224,0.28), rgba(52,214,197,0.10) 55%, rgba(94,200,224,0.04) 92%)' },
  { key: 'forest', label: 'Forest', css: 'linear-gradient(165deg, rgba(123,191,90,0.28), rgba(47,107,58,0.12) 60%, rgba(123,191,90,0.04) 92%)' },
  { key: 'ember', label: 'Ember', css: 'linear-gradient(165deg, rgba(224,81,138,0.26), rgba(224,100,75,0.14) 55%, rgba(224,81,138,0.04) 92%)' },
  { key: 'storm', label: 'Storm', css: 'linear-gradient(165deg, rgba(91,141,249,0.28), rgba(33,40,52,0.16) 60%, rgba(91,141,249,0.05) 92%)' },
];
const LPC_PIN_KINDS = ['PR', 'Workout', 'Meal', 'Post', 'Win'];
const LPC_STAT_OPTIONS = [
  { key: 'score', label: 'Shape Score' }, { key: 'tier', label: 'Tier' }, { key: 'streak', label: 'Day streak' },
  { key: 'since', label: 'Member since' }, { key: 'lift', label: 'Top lift' }, { key: 'rating', label: 'Rating' }, { key: 'reviews', label: 'Reviews' },
];
const LPC_LINKS = [
  { key: 'instagram', label: 'Instagram', pre: 'instagram.com/' },
  { key: 'tiktok', label: 'TikTok', pre: 'tiktok.com/@' },
  { key: 'youtube', label: 'YouTube', pre: 'youtube.com/@' },
  { key: 'website', label: 'Website', pre: '' },
];

function LivingProfileCustomizer({ role = 'client' }) {
  const TEAL2 = '#0ac5a8';
  const [uid, setUid] = React.useState(null);
  const [loaded, setLoaded] = React.useState(false);
  const [init, setInit] = React.useState({});
  const [bio, setBio] = React.useState('');
  const [coverUrl, setCoverUrl] = React.useState('');
  const [accent, setAccent] = React.useState('');
  const [climbBg, setClimbBg] = React.useState('');
  const [heroStats, setHeroStats] = React.useState(['score', 'tier', 'streak']);
  const [pin, setPin] = React.useState({ kind: 'PR', title: '', note: '', metric: '' });
  const [songUrl, setSongUrl] = React.useState('');
  const [songLabel, setSongLabel] = React.useState('');
  const [prompts, setPrompts] = React.useState([{ q: LPC_PROMPTS[0], a: '' }]);
  const [links, setLinks] = React.useState({});
  const [busy, setBusy] = React.useState(false);
  const [coverBusy, setCoverBusy] = React.useState(false);
  const [note, setNote] = React.useState('');
  const coverRef = React.useRef(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = window.shapeDb && window.shapeDb.getUser ? await window.shapeDb.getUser() : null;
        if (cancelled) return;
        if (!user) { setLoaded(true); return; }
        setUid(user.id);
        const d = (await window.shapeDb.getUserGoals('profile_custom')) || {};
        if (cancelled) return;
        setInit(d);
        setBio(d.bio || '');
        setCoverUrl((d.cover && d.cover.image) || '');
        setAccent(d.accent || '');
        setClimbBg(d.climbBg || '');
        if (Array.isArray(d.heroStats) && d.heroStats.length) setHeroStats(d.heroStats.slice(0, 3));
        if (d.pinned) setPin({ kind: d.pinned.kind || 'PR', title: d.pinned.title || '', note: d.pinned.note || '', metric: d.pinned.metric || '' });
        if (d.song) { setSongUrl(d.song.url || ''); setSongLabel(d.song.label || ''); }
        if (Array.isArray(d.prompts) && d.prompts.length) setPrompts(d.prompts.slice(0, 4));
        if (d.links) setLinks({ ...d.links });
      } catch (e) { /* show signed-out note */ }
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, []);

  const toggleStat = (k) => setHeroStats((prev) => {
    if (prev.includes(k)) return prev.length > 1 ? prev.filter((x) => x !== k) : prev;
    return prev.length >= 3 ? [...prev.slice(1), k] : [...prev, k];
  });

  const onCoverFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file || !uid || !(window.shapeDb && window.shapeDb.client)) return;
    setCoverBusy(true);
    try {
      const ext = (file.type.split('/')[1] || 'jpg').replace(/[^a-z0-9]/gi, '') || 'jpg';
      const path = uid + '/cover-' + Date.now() + '.' + ext;
      const up = await window.shapeDb.client.storage.from('community-photos').upload(path, file, { contentType: file.type || 'image/jpeg' });
      if (up.error) throw up.error;
      const pub = window.shapeDb.client.storage.from('community-photos').getPublicUrl(path);
      setCoverUrl((pub.data && pub.data.publicUrl) || '');
    } catch (err) { setNote((err && err.message) || 'Cover upload failed.'); }
    finally { setCoverBusy(false); }
  };

  const save = async () => {
    if (!uid || busy) return;
    setBusy(true); setNote('');
    const doc = {
      ...init,
      bio: bio.trim(),
      song: songUrl.trim() ? { url: songUrl.trim(), label: songLabel.trim() } : null,
      links: Object.fromEntries(LPC_LINKS.map((l) => [l.key, String(links[l.key] || '').trim()]).filter(([, v]) => v)),
      prompts: prompts.filter((p) => p && p.q && String(p.a).trim()).map((p) => ({ q: p.q, a: String(p.a).trim() })).slice(0, 4),
      cover: coverUrl.trim() ? { image: coverUrl.trim() } : null,
      accent: accent || null,
      climbBg: climbBg || null,
      pinned: pin.title.trim() ? { kind: pin.kind, title: pin.title.trim(), note: pin.note.trim(), metric: pin.metric.trim() } : null,
      heroStats: heroStats.slice(0, 3),
    };
    try {
      await window.shapeDb.saveUserGoals('profile_custom', doc);
      setInit(doc);
      setNote('Saved — your public page is updated.');
    } catch (e) { setNote('Could not save. Try again.'); }
    finally { setBusy(false); }
  };

  const lbl = { fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: TEAL_BRIGHT, marginBottom: 10 };
  const field = { width: '100%', boxSizing: 'border-box', padding: '11px 13px', borderRadius: 8, border: '1px solid rgba(242,237,228,0.14)', background: 'rgba(242,237,228,0.04)', color: INK, fontFamily: sans, fontSize: 13.5, outline: 'none' };
  const chip = (on, c) => ({ padding: '7px 13px', borderRadius: 6, cursor: 'pointer', border: '1px solid ' + (on ? c : 'rgba(242,237,228,0.16)'), borderLeft: on ? '3px solid ' + c : '1px solid rgba(242,237,228,0.16)', background: on ? 'rgba(10,197,168,0.12)' : 'transparent', color: on ? c : 'rgba(242,237,228,0.55)', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' });

  if (!loaded) return null;
  if (!uid) {
    return (
      <Card style={{ marginBottom: 20 }}>
        <SectionTitle>Your living profile</SectionTitle>
        <div style={{ fontSize: 13, color: 'rgba(242,237,228,0.6)', lineHeight: 1.6 }}>Sign in to customize your public page — bio, cover, accent, prompts, pinned highlight and links.</div>
      </Card>
    );
  }

  return (
    <Card style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <SectionTitle>Your living profile</SectionTitle>
        <a href="MemberProfile.html" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: '0.08em', color: TEAL_BRIGHT, textTransform: 'uppercase' }}>Preview public page →</a>
      </div>
      <div style={{ fontSize: 12.5, color: 'rgba(242,237,228,0.55)', lineHeight: 1.6, margin: '4px 0 18px' }}>
        Everything here renders on your public {role === 'client' ? 'Terrain' : 'Signal'} page — the same profile the app shows. Edits sync across web and mobile.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 22 }}>
        <div>
          <div style={lbl}>Bio</div>
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={280} rows={3} placeholder="A line about you, your training, your why…" style={{ ...field, resize: 'vertical', minHeight: 70 }} />
          <div style={{ ...lbl, marginTop: 16 }}>Profile song · Spotify link</div>
          <input value={songUrl} onChange={(e) => setSongUrl(e.target.value)} placeholder="https://open.spotify.com/track/…" style={field} />
          <input value={songLabel} onChange={(e) => setSongLabel(e.target.value)} placeholder="Label (optional) — e.g. Lift anthem" style={{ ...field, marginTop: 8 }} />
          <div style={{ ...lbl, marginTop: 16 }}>Pin a highlight</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {LPC_PIN_KINDS.map((k) => <button key={k} onClick={() => setPin((p) => ({ ...p, kind: k }))} style={chip(pin.kind === k, TEAL_BRIGHT)}>{k}</button>)}
          </div>
          <input value={pin.title} onChange={(e) => setPin((p) => ({ ...p, title: e.target.value }))} maxLength={80} placeholder="Headline — e.g. Pulled 2× bodyweight" style={field} />
          <input value={pin.note} onChange={(e) => setPin((p) => ({ ...p, note: e.target.value }))} maxLength={160} placeholder="A line of context (optional)" style={{ ...field, marginTop: 8 }} />
          <input value={pin.metric} onChange={(e) => setPin((p) => ({ ...p, metric: e.target.value }))} maxLength={24} placeholder="Metric (optional) — e.g. 2×BW" style={{ ...field, marginTop: 8 }} />
        </div>
        <div>
          <div style={lbl}>Cover image</div>
          <div style={{ position: 'relative', height: 110, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(242,237,228,0.14)', background: coverUrl ? '#000' : 'linear-gradient(135deg, rgba(10,197,168,0.35), rgba(10,197,168,0.06))' }}>
            {coverUrl ? <img src={coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
            <input ref={coverRef} type="file" accept="image/*" onChange={onCoverFile} style={{ display: 'none' }} />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <button onClick={() => !coverBusy && coverRef.current && coverRef.current.click()} style={{ padding: '7px 13px', borderRadius: 6, border: '1px solid rgba(242,237,228,0.5)', background: 'rgba(0,0,0,0.5)', color: INK, cursor: coverBusy ? 'wait' : 'pointer', fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{coverBusy ? 'Uploading…' : coverUrl ? 'Replace' : 'Upload cover'}</button>
              {coverUrl ? <button onClick={() => setCoverUrl('')} style={{ padding: '7px 11px', borderRadius: 6, border: '1px solid rgba(242,237,228,0.35)', background: 'rgba(0,0,0,0.5)', color: 'rgba(242,237,228,0.85)', cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Remove</button> : null}
            </div>
          </div>
          <div style={{ ...lbl, marginTop: 16 }}>Accent color</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <button onClick={() => setAccent('')} title="Tier default" style={{ width: 26, height: 26, borderRadius: 6, cursor: 'pointer', border: '2px solid ' + (!accent ? INK : 'rgba(242,237,228,0.25)'), background: 'linear-gradient(135deg, #0ac5a8, #066a5a)', color: '#fff', fontSize: 10 }}>{!accent ? '✓' : ''}</button>
            {LPC_ACCENTS.map((a) => (
              <button key={a} onClick={() => setAccent(a)} style={{ width: 26, height: 26, borderRadius: 6, cursor: 'pointer', border: '2px solid ' + (accent === a ? INK : 'transparent'), background: a, color: '#fff', fontSize: 10 }}>{accent === a ? '✓' : ''}</button>
            ))}
          </div>
          <div style={{ ...lbl, marginTop: 16 }}>Climb background</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {LPC_CLIMB_BGS.map((b) => {
              const on = (climbBg || '') === b.key;
              return (
                <button key={b.key || 'paper'} onClick={() => setClimbBg(b.key)} style={{ width: 58, borderRadius: 6, cursor: 'pointer', border: '2px solid ' + (on ? INK : 'rgba(242,237,228,0.18)'), background: 'transparent', padding: 3 }}>
                  <span style={{ display: 'block', height: 26, borderRadius: 3, background: b.css || 'rgba(242,237,228,0.06)', border: b.css ? 'none' : '1px dashed rgba(242,237,228,0.25)' }} />
                  <span style={{ display: 'block', marginTop: 4, fontFamily: "'JetBrains Mono', monospace", fontSize: 7.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: on ? INK : 'rgba(242,237,228,0.5)' }}>{b.label}</span>
                </button>
              );
            })}
          </div>
          <div style={{ ...lbl, marginTop: 16 }}>Headline stats · up to 3</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {LPC_STAT_OPTIONS.map((s) => <button key={s.key} onClick={() => toggleStat(s.key)} style={chip(heroStats.includes(s.key), TEAL_BRIGHT)}>{heroStats.includes(s.key) ? '✓ ' : ''}{s.label}</button>)}
          </div>
        </div>
      </div>

      <div style={{ ...lbl, marginTop: 20 }}>Prompts · up to 4</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {prompts.map((p, i) => (
          <div key={i} style={{ border: '1px solid rgba(242,237,228,0.1)', borderRadius: 8, padding: 10 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <select value={p.q} onChange={(e) => setPrompts((prev) => prev.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)))} style={{ ...field, padding: '8px 10px', fontSize: 11.5, fontFamily: "'JetBrains Mono', monospace", color: TEAL_BRIGHT }}>
              {LPC_PROMPTS.map((q) => <option key={q} value={q} style={{ color: '#111' }}>{q}</option>)}
              </select>
              <button onClick={() => setPrompts((prev) => prev.filter((_, j) => j !== i))} style={{ flex: 'none', width: 32, borderRadius: 6, border: '1px solid rgba(242,237,228,0.16)', background: 'transparent', color: 'rgba(242,237,228,0.6)', cursor: 'pointer', fontSize: 15 }}>×</button>
            </div>
            <input value={p.a} onChange={(e) => setPrompts((prev) => prev.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))} maxLength={120} placeholder="Your answer…" style={field} />
          </div>
        ))}
      </div>
      {prompts.length < 4 && <button onClick={() => setPrompts((prev) => [...prev, { q: LPC_PROMPTS[prev.length % LPC_PROMPTS.length], a: '' }])} style={{ marginTop: 10, background: 'transparent', border: '1px dashed rgba(10,197,168,0.5)', color: TEAL_BRIGHT, borderRadius: 6, padding: '7px 13px', cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase' }}>+ Add prompt</button>}

      <div style={{ ...lbl, marginTop: 20 }}>Social links</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {LPC_LINKS.map((l) => (
          <div key={l.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ flex: '0 0 76px', fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(242,237,228,0.55)' }}>{l.label}</span>
            <input value={links[l.key] || ''} onChange={(e) => setLinks((prev) => ({ ...prev, [l.key]: e.target.value }))} placeholder={l.pre ? l.pre + 'you' : 'yoursite.com'} style={{ ...field, flex: 1 }} />
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 20 }}>
        <button onClick={save} disabled={busy} style={{ background: TEAL2, color: '#1a1612', border: 0, padding: '12px 26px', borderRadius: 999, fontFamily: sans, fontSize: 13.5, fontWeight: 500, cursor: busy ? 'wait' : 'pointer' }}>{busy ? 'Saving…' : 'Save profile'}</button>
        {note && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: '0.06em', color: 'rgba(242,237,228,0.65)' }}>{note}</span>}
      </div>
    </Card>
  );
}
Object.assign(window, { LivingProfileCustomizer });
