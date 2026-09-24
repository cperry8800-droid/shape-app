// Shared browser/mobile video policy and React components. Never embed arbitrary HTML.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) {
    root.ShapeVideo = api;
    if (root.React) Object.assign(root, api.createComponents(root.React));
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const ACCEPT = '.mp4,.mov,.m4v,.webm,video/mp4,video/quicktime,video/x-m4v,video/webm';
  const HELP = 'YouTube, Vimeo, Loom, or a direct MP4, MOV, M4V or WebM link.';
  const problem = (code, message, values = {}) => Object.assign(new Error(message.replace(/\{(\w+)\}/g, (_,name)=>values[name] ?? name)), {code, values});
  function resolve(value) {
    const raw = typeof value === 'string' ? value : value && value.url;
    if (!raw || typeof raw !== 'string') return null;
    let u;
    try { u = new URL(raw.trim()); } catch (_) { return null; }
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) return null;
    const host = u.hostname.toLowerCase(), parts = u.pathname.split('/').filter(Boolean);
    const result = (provider, src, extra = {}) => ({ url: u.href, provider, src, kind: 'embed', ...extra });
    if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com', 'youtu.be'].includes(host)) {
      const id = host === 'youtu.be' ? parts[0] : parts[0] === 'watch' ? u.searchParams.get('v') : ['embed','shorts','live'].includes(parts[0]) ? parts[1] : '';
      if (!/^[\w-]{11}$/.test(id || '')) return null;
      const rawStart = u.searchParams.get('start') || u.searchParams.get('t') || u.hash.replace(/^#t=/, '');
      let start = /^\d+$/.test(rawStart) ? Number(rawStart) : 0;
      const time = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(rawStart);
      if (time && rawStart) start = Number(time[1] || 0)*3600 + Number(time[2] || 0)*60 + Number(time[3] || 0);
      return result('YouTube', 'https://www.youtube-nocookie.com/embed/' + id + '?playsinline=1&rel=0' + (start > 0 ? '&start=' + Math.min(start, 86400) : ''));
    }
    if (['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'].includes(host)) {
      const match = /^\/(?:video\/|channels\/[^/]+\/|groups\/[^/]+\/videos\/)?(\d+)(?:\/([a-zA-Z0-9]+))?\/?$/.exec(u.pathname);
      if (!match) return null;
      const hash = u.searchParams.get('h') || match[2] || '';
      if (hash && !/^[a-zA-Z0-9]+$/.test(hash)) return null;
      return result('Vimeo', 'https://player.vimeo.com/video/' + match[1] + '?playsinline=1' + (hash ? '&h=' + encodeURIComponent(hash) : ''));
    }
    if (['loom.com', 'www.loom.com'].includes(host)) {
      if (!['share','embed'].includes(parts[0]) || !/^[a-f0-9]{32}$/i.test(parts[1] || '')) return null;
      return result('Loom', 'https://www.loom.com/embed/' + parts[1]);
    }
    if (/\.(mp4|m4v|mov|webm)(?:$)/i.test(u.pathname)) return result('Video file', u.href, { kind: 'file' });
    // Retain old links for a clearly labelled fallback, never iframe random websites.
    return result('External link', u.href, { kind: 'link' });
  }
  function validateLink(value) {
    const source = resolve(value);
    if (!source || source.kind === 'link') throw problem('invalidLink', 'Use a supported video link. ' + HELP);
    if (!source.url.startsWith('https://')) throw problem('secureLink', 'Use a secure video link starting with https://.');
    return source.url;
  }
  function validateFile(file, maxBytes = 200 * 1024 * 1024) {
    if (!file || !file.size) throw problem('emptyFile', 'Choose a video file that is not empty.');
    const ext = String(file.name || '').split('.').pop().toLowerCase();
    const types = { mp4:['video/mp4'], mov:['video/quicktime'], m4v:['video/mp4','video/x-m4v','video/m4v'], webm:['video/webm'] };
    if (!types[ext] || (file.type && !types[ext].includes(file.type.toLowerCase()))) throw problem('fileType', 'Choose an MP4, MOV, M4V or WebM video. MP4 with H.264 works best across devices.');
    if (file.size > maxBytes) throw problem('fileSize', 'Keep the video under {limit} MB.', {limit:Math.round(maxBytes / 1024 / 1024)});
    return { ext, contentType: file.type || types[ext][0] };
  }
  function createComponents(React, options = {}) {
    const h = React.createElement;
    function useText() {
      const [,refresh] = React.useState(0);
      React.useEffect(() => options.subscribe?.(() => refresh(n => n + 1)), []);
      return (key, fallback, values = {}) => {
        const fullKey='coach:video.'+key, translated=options.translate?.(fullKey,{defaultValue:fallback,...values});
        return translated && translated!==fullKey ? translated : fallback.replace(/\{(\w+)\}/g, (_,name)=>values[name] ?? name);
      };
    }
    const errorText = (error, t) => error?.code ? t(error.code,error.message,error.values) : error?.message || '';
    const control = { minHeight:44, padding:'8px 12px', border:'1px solid currentColor', borderRadius:8, background:'transparent', color:'inherit', font:'inherit', cursor:'pointer', maxWidth:'100%' };
    function ShapeVideoPlayer({ value, title, expanded = false }) {
      const t = useText();
      const source = resolve(value), url = source && source.url;
      const [open, setOpen] = React.useState(expanded), [failed, setFailed] = React.useState(false), [duration, setDuration] = React.useState(0);
      const [speed, setSpeed] = React.useState('1'), [loop, setLoop] = React.useState(false);
      const ref = React.useRef(null), identity = React.useRef({});
      React.useEffect(() => { setOpen(expanded); setFailed(false); setDuration(0); setSpeed('1'); setLoop(false); }, [url, expanded]);
      React.useEffect(() => { if (open) window.dispatchEvent(new window.CustomEvent('shape-video-open', {detail:identity.current})); }, [open]);
      React.useEffect(() => {
        const stop = event => { if (event.detail !== identity.current) setOpen(false); };
        window.addEventListener('shape-video-open', stop);
        return () => window.removeEventListener('shape-video-open', stop);
      }, []);
      if (!source) return null;
      const activate = () => { window.dispatchEvent(new window.CustomEvent('shape-video-open', { detail:identity.current })); setOpen(true); setFailed(false); };
      const name = (value && value.name) || title || t('video','Video');
      return h('section', { 'aria-label':name, onKeyDown:e=>{if(e.key==='Escape'){setOpen(false);}}, style:{ margin:'12px 0', minWidth:0 } },
        h('div', { style:{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' } },
          h('button', { type:'button', style:control, 'aria-expanded':open, onClick:() => open ? setOpen(false) : activate() }, (open ? t('close','Close video') : '▷ '+t('watch','Watch')) + ' · ' + name),
          h('small', null, (source.kind==='file'?t('file','Video file'):source.kind==='link'?t('external','External link'):source.provider) + (duration > 0 ? ' · ' + Math.floor(duration/60) + ':' + String(Math.floor(duration%60)).padStart(2,'0') : ''))),
        open && source.kind === 'file' && !failed && h(React.Fragment, null,
          h('video', { key:url, ref, src:source.src, controls:true, playsInline:true, preload:'metadata', loop, 'aria-label':name,
            onLoadedMetadata:e => {setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0);e.currentTarget.playbackRate=Number(speed);},
            onError:() => setFailed(true), style:{ display:'block', width:'100%', maxHeight:'65vh', objectFit:'contain', background:'#000', marginTop:10, borderRadius:8 } }),
          h('div', { style:{ display:'flex', gap:12, alignItems:'center', flexWrap:'wrap', marginTop:8 } },
            h('label', null, t('speed','Playback speed')+' ', h('select', { value:speed, style:control, onChange:e => { setSpeed(e.target.value); if(ref.current) ref.current.playbackRate=Number(e.target.value); } }, ['0.5','0.75','1','1.25','1.5','2'].map(n=>h('option',{key:n,value:n},n+'×')))),
            h('label', { style:{minHeight:44,display:'flex',alignItems:'center',gap:8} }, h('input',{type:'checkbox',checked:loop,onChange:e=>setLoop(e.target.checked)}),t('repeat','Repeat clip')))),
        open && source.kind === 'embed' && h('iframe', { key:url, src:options.embedBase ? options.embedBase + '?video=' + encodeURIComponent(source.url) : source.src, title:name + ' — ' + source.provider,
          allow:'autoplay; encrypted-media; fullscreen; picture-in-picture', allowFullScreen:true, referrerPolicy:'strict-origin-when-cross-origin',
          style:{ display:'block', width:'100%', aspectRatio:'16 / 9', minHeight:200, border:0, borderRadius:8, marginTop:10, background:'#000' } }),
        open && (failed || source.kind === 'link') && h('p', { role:'status' }, failed ? t('playFailed','This video could not play. Try another connection or upload an MP4 with H.264 video.') : t('unsupported','This source does not support playback here.')),
        open && (source.kind !== 'file' || failed) && h('p', { style:{fontSize:12} }, source.kind === 'embed' ? t('ownerRestriction','If the owner has disabled embedding or requires sign-in,')+' ' : '', h('a',{href:source.url,target:'_blank',rel:'noopener noreferrer',style:{color:'inherit'}},t('original','Open the original video')+' ↗')));
    }
    function ShapeVideoLink({ value, onChange, label, disabled = false }) {
      const t = useText();
      const [draft,setDraft] = React.useState(''), [error,setError] = React.useState('');
      return h('div', {style:{marginTop:10}},
        h('label', {style:{display:'block'}}, label || t('link','Video link'), h('input',{type:'url',value:draft,disabled,placeholder:'https://…',onChange:e=>{setDraft(e.target.value);setError('');},style:{...control,width:'100%',boxSizing:'border-box',marginTop:6}})),
        h('small',{style:{display:'block',margin:'6px 0'}}, t('help',HELP)),
        h('button',{type:'button',style:control,disabled:disabled || !draft.trim(),onClick:()=>{try{onChange(validateLink(draft));setDraft('');setError('');}catch(e){setError(e);}}},value?t('replaceLink','Replace with link'):t('attachLink','Attach link')),
        error && h('p',{role:'alert'},errorText(error,t)));
    }
    function ShapeVideoAttachment({ value, onChange, upload, onBusy, title, clips = [] }) {
      const t = useText(), heading = title || t('intro','Introduction video');
      const [busy,setBusy] = React.useState(false), [error,setError] = React.useState('');
      const input = React.useRef(null), alive = React.useRef(true), pending = React.useRef(false), current = React.useRef({onChange,onBusy});
      current.current={onChange,onBusy};
      React.useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
      const pick = async file => {
        if (!file || pending.current) return;
        pending.current=true; setError(''); setBusy(true); const finish=current.current.onBusy; finish?.(1);
        try { validateFile(file); const media=await upload(file); const url=typeof media==='string'?media:media?.url; if(!resolve(url))throw problem('uploadFailed','Upload failed. Try again.'); if(alive.current)current.current.onChange(url); }
        catch(e){if(alive.current)setError(e?.message ? e : problem('uploadFailed','Upload failed. Try again.'));}
        finally {pending.current=false;if(alive.current)setBusy(false);finish?.(-1);}
      };
      return h('fieldset',{disabled:busy,style:{border:0,padding:0,margin:'14px 0',minWidth:0}},
        h('legend',{style:{fontWeight:600}},heading),
        h('input',{ref:input,type:'file',accept:ACCEPT,hidden:true,onChange:e=>{const file=e.target.files[0];e.target.value='';pick(file);}}),
        h('div',{style:{display:'flex',gap:8,flexWrap:'wrap'}},h('button',{type:'button',style:control,onClick:()=>input.current.click()},busy?t('uploading','Uploading…'):value?t('replace','Replace video'):t('upload','Upload video')),
          value && h('button',{type:'button',style:control,onClick:()=>onChange('')},t('remove','Remove video'))),
        h('small',{style:{display:'block',marginTop:6}},t('uploadHelp','Up to 200 MB. MP4 with H.264 works best across devices.')),
        busy && h('p',{role:'status'},t('uploadingVideo','Uploading video…')), error && h('p',{role:'alert'},errorText(error,t)),
        clips.length>0 && h('label',{style:{display:'block',marginTop:8}},t('saved','Saved videos')+' ',h('select',{value:'',style:control,onChange:e=>{if(e.target.value)onChange(e.target.value);}},h('option',{value:''},t('library','Choose from library')),clips.map(c=>h('option',{key:c.url,value:c.url},c.name || t('video','Video'))))),
        h(ShapeVideoLink,{value,onChange,label:t('namedLink','{name} link',{name:heading}),disabled:busy}),
        h(ShapeVideoPlayer,{value,title:heading}));
    }
    return {ShapeVideoPlayer, ShapeVideoLink, ShapeVideoAttachment};
  }
  return {resolve, validateLink, validateFile, ACCEPT, HELP, createComponents};
});
