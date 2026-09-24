import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, validateLink, validateFile, createComponents } from '../public/newdesign/shapeVideo.mjs';
import { normalizeWorkoutDetail, builderToAssignmentRows } from '../public/newdesign/workoutDocument.mjs';
import { coachWorkoutVideos } from '../mobile-app/src/services/coachWorkoutLibrary.mjs';
import { createMobileVideoComponents } from '../mobile-app/src/services/videoComponents.mjs';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';
const require=createRequire(import.meta.url);
const React=require('react'), {JSDOM}=require('jsdom');
const dom=new JSDOM('<div id="root"></div>',{url:'https://shape.test/'});
globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {createRoot}=require('react-dom/client');
const {ShapeVideoPlayer,ShapeVideoLink,ShapeVideoAttachment}=createComponents(React);

test('supported hosts normalize to fixed embed origins and preserve start/private access parameters',()=>{
  for(const url of ['https://youtu.be/M7lc1UVf-VE?t=1m3s','https://www.youtube.com/watch?v=M7lc1UVf-VE&t=63','https://youtube.com/shorts/M7lc1UVf-VE?t=63']){
    assert.equal(resolve(url).src,'https://www.youtube-nocookie.com/embed/M7lc1UVf-VE?playsinline=1&rel=0&start=63');
  }
  assert.equal(resolve('https://vimeo.com/123456789/abc123').src,'https://player.vimeo.com/video/123456789?playsinline=1&h=abc123');
  assert.equal(resolve('https://player.vimeo.com/video/123456789?h=abc123').src,resolve('https://vimeo.com/123456789/abc123').src);
  assert.equal(resolve('https://www.loom.com/share/0123456789abcdef0123456789abcdef?sid=tracking').src,'https://www.loom.com/embed/0123456789abcdef0123456789abcdef');
  const signed='https://cdn.example.com/demo.mp4?token=keep-this&expires=100';
  assert.equal(resolve(signed).src,signed);
});

test('untrusted URLs never become arbitrary iframe HTML or provider lookalikes',()=>{
  for(const url of ['javascript:alert(1)','data:text/html,<script>alert(1)</script>','//youtube.com/watch?v=M7lc1UVf-VE','https://name:secret@example.com/a.mp4','<iframe src="https://evil.test"></iframe>']) assert.equal(resolve(url),null);
  for(const url of ['https://youtube.com.evil.test/watch?v=M7lc1UVf-VE','https://evil.test/?v=M7lc1UVf-VE','https://youtube.com/watch?v=bad','https://vimeo.com/not-a-video','http://example.com/a.mp4']) assert.throws(()=>validateLink(url));
  assert.equal(resolve('https://example.com/watch/1').kind,'link');
  assert.equal(resolve('https://example.com/a.mp4.html').kind,'link');
});

test('website and app share size, extension and MIME validation',()=>{
  for(const [name,type] of [['a.mp4','video/mp4'],['a.MOV','video/quicktime'],['a.m4v','video/x-m4v'],['a.webm',''],['a.mp4','']]) assert.ok(validateFile({name,type,size:2}).contentType);
  for(const file of [{name:'a.mp4',type:'text/html',size:3},{name:'a.avi',type:'video/avi',size:3},{name:'a.mp4',size:0},{name:'a.mp4',size:200*1024*1024+1}]) assert.throws(()=>validateFile(file));
});

test('program, session and exercise videos survive normalization, assignment and library reuse',()=>{
  const intro='https://vimeo.com/123456789', walk='https://youtu.be/M7lc1UVf-VE', demo='https://cdn.example.com/squat.mp4';
  const detail=normalizeWorkoutDetail({builder:{video:intro,weeks:[{days:[{name:'Day',video:walk,blocks:[{kind:'main',rows:[{id:'ex',name:'Squat',sets:3,reps:'5',video:demo}]}]}]}]}});
  const rows=builderToAssignmentRows(detail.builder,{id:'plan',name:'Strength'},'2026-09-24');
  assert.equal(rows[0].payload.programVideo,intro);assert.equal(rows[0].payload.video,walk);assert.equal(rows[0].payload.exercises[0].video,demo);
  assert.equal(coachWorkoutVideos([{name:'Strength',detail}]).length,3);
});

test('every website consumer loads the player script before its components',()=>{
  for(const name of readdirSync(new URL('../public/newdesign/',import.meta.url)).filter(n=>n.endsWith('.html'))){
    const s=readFileSync(new URL('../public/newdesign/'+name,import.meta.url),'utf8');
    for(const component of ['dashClient.jsx','livingShared.jsx'])if(s.includes('src="'+component))assert.ok(s.indexOf('src="shapeVideo.js"')>0 && s.indexOf('src="shapeVideo.js"')<s.indexOf('src="'+component),name);
  }
});

test('embedded providers load on demand, close cleanly and only one player stays active',async()=>{
  const root=createRoot(document.getElementById('root'));
  await React.act(async()=>root.render(React.createElement(React.Fragment,null,
    React.createElement(ShapeVideoPlayer,{value:'https://youtu.be/M7lc1UVf-VE',title:'Demo'}),
    React.createElement(ShapeVideoPlayer,{value:'https://vimeo.com/123456789',title:'Overview'}))));
  assert.equal(document.querySelectorAll('iframe').length,0);
  const buttons=[...document.querySelectorAll('button')];
  await React.act(async()=>buttons[0].click());
  assert.match(document.querySelector('iframe').src,/youtube-nocookie/);assert.equal(document.querySelector('iframe').getAttribute('referrerpolicy'),'strict-origin-when-cross-origin');
  await React.act(async()=>buttons[1].click());
  assert.equal(document.querySelectorAll('iframe').length,1);assert.match(document.querySelector('iframe').src,/player.vimeo.com/);
  await React.act(async()=>buttons[1].click());assert.equal(Boolean(document.querySelector('iframe')),false);
  await React.act(async()=>root.unmount());
});

test('native player preserves framing and supports speed, looping, failure fallback and close',async()=>{
  const root=createRoot(document.getElementById('root'));
  await React.act(async()=>root.render(React.createElement(ShapeVideoPlayer,{value:'https://cdn.example.com/a.mp4',title:'Squat'})));
  await React.act(async()=>document.querySelector('button').click());
  const video=document.querySelector('video');assert.equal(video.controls,true);assert.equal(video.autoplay,false);assert.equal(video.style.objectFit,'contain');
  const speed=document.querySelector('select');await React.act(async()=>{speed.value='0.5';speed.dispatchEvent(new window.Event('change',{bubbles:true}));});assert.equal(video.playbackRate,0.5);
  await React.act(async()=>document.querySelector('input[type=checkbox]').click());assert.equal(video.loop,true);
  await React.act(async()=>video.dispatchEvent(new window.Event('error')));assert.match(document.querySelector('[role=status]').textContent,/could not play/);assert.equal(document.querySelector('a').href,'https://cdn.example.com/a.mp4');
  await React.act(async()=>root.unmount());
});

test('link field attaches validated URLs and rejects arbitrary pages without changing the saved clip',async()=>{
  const root=createRoot(document.getElementById('root'));const saved=[];
  await React.act(async()=>root.render(React.createElement(ShapeVideoLink,{onChange:url=>saved.push(url)})));
  const input=document.querySelector('input');
  const change=async value=>React.act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new window.Event('input',{bubbles:true}));});
  await change('https://youtube.com.evil.test/watch?v=M7lc1UVf-VE');await React.act(async()=>document.querySelector('button').click());
  assert.equal(saved.length,0);assert.match(document.querySelector('[role=alert]').textContent,/supported/);
  await change('https://youtu.be/M7lc1UVf-VE');await React.act(async()=>document.querySelector('button').click());assert.deepEqual(saved,['https://youtu.be/M7lc1UVf-VE']);
  await React.act(async()=>root.unmount());
});

test('native HTTPS wrapper admits canonical embeds only and preserves private Vimeo access',()=>{
  const script=readFileSync(new URL('../public/video-embed.js',import.meta.url),'utf8');
  for(const [url,expected] of [
    ['https://vimeo.com/123456789/abc123','https://player.vimeo.com/video/123456789?playsinline=1&h=abc123'],
    ['https://youtube.com.evil.test/watch?v=M7lc1UVf-VE',null],
    ['javascript:alert(1)',null],
    ['https://cdn.example.com/demo.mp4',null],
  ]){
    const page=new JSDOM('<p id="status"></p>',{url:'https://www.theshapecommunity.com/video-embed.html?video='+encodeURIComponent(url),runScripts:'outside-only'});
    page.window.ShapeVideo={resolve};page.window.eval(script);
    assert.equal(page.window.document.querySelector('iframe')?.src || null,expected);
    page.window.close();
  }
});

test('an introduction upload locks edits, rejects an empty result and never attaches after unmount',async()=>{
  let finish;const changes=[],busy=[];let calls=0;
  const root=createRoot(document.getElementById('root'));
  await React.act(async()=>root.render(React.createElement(ShapeVideoAttachment,{value:'https://cdn.example.com/old.mp4',onChange:url=>changes.push(url),onBusy:n=>busy.push(n),upload:()=>{calls++;return new Promise(r=>{finish=r;});}})));
  const input=document.querySelector('input[type=file]');
  const pick=()=>{Object.defineProperty(input,'files',{value:[new window.File(['clip'],'demo.mp4',{type:'video/mp4'})],configurable:true});input.dispatchEvent(new window.Event('change',{bubbles:true}));};
  await React.act(async()=>{pick();pick();});assert.equal(calls,1);assert.equal(document.querySelector('fieldset').disabled,true);
  await React.act(async()=>finish({}));assert.equal(changes.length,0);assert.match(document.querySelector('[role=alert]').textContent,/Upload failed/);assert.deepEqual(busy,[1,-1]);
  await React.act(async()=>pick());await React.act(async()=>root.unmount());await React.act(async()=>finish({url:'https://cdn.example.com/new.mp4'}));
  assert.equal(changes.length,0);assert.deepEqual(busy,[1,-1,1,-1]);
});

test('mobile controls translate on locale changes, including validation, with catalog parity',async()=>{
  const catalogs={};
  for(const lang of ['en','es','pt-BR','fr','de','it','id','vi','tr','ha','pcm','ru','uk'])catalogs[lang]=JSON.parse(readFileSync(new URL('../mobile-app/src/i18n/catalogs/'+lang+'/coach.json',import.meta.url),'utf8'));
  const keys=Object.keys(catalogs.en).filter(k=>k.startsWith('video.'));
  for(const [lang,cat] of Object.entries(catalogs))for(const key of keys){assert.ok(cat[key],lang+':'+key);assert.deepEqual((cat[key].match(/\{\w+\}/g)||[]).sort(),(catalogs.en[key].match(/\{\w+\}/g)||[]).sort());}
  let locale='es';const listeners=new Set();
  window.ShapeLocale={subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);}};
  window.ShapeI18n={t:(key,opts)=>catalogs[locale][key.replace('coach:','')]?.replace(/\{(\w+)\}/g,(_,k)=>opts[k]??k)};
  const {ShapeVideoAttachment:Attachment}=createMobileVideoComponents(React);
  const root=createRoot(document.getElementById('root'));
  await React.act(async()=>root.render(React.createElement(Attachment,{value:'https://cdn.example.com/a.mp4',onChange:()=>{},upload:async()=>null})));
  const watch=[...document.querySelectorAll('button')].find(b=>b.textContent.startsWith('▷ Ver'));
  assert.ok(Boolean(watch));await React.act(async()=>watch.click());
  assert.match(document.body.textContent,/Velocidad de reproducción/);
  const input=document.querySelector('input[type=url]');
  await React.act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,'https://example.com/watch');input.dispatchEvent(new window.Event('input',{bubbles:true}));});
  await React.act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Reemplazar con enlace').click());
  assert.match(document.querySelector('[role=alert]').textContent,/Usa un enlace/);
  await React.act(async()=>{locale='fr';for(const fn of listeners)fn();});
  assert.match(document.body.textContent,/Vitesse de lecture/);assert.match(document.querySelector('[role=alert]').textContent,/Utilisez un lien/);
  await React.act(async()=>root.unmount());assert.equal(listeners.size,0);delete window.ShapeLocale;delete window.ShapeI18n;
});

test('buyer plan preview renders a provider player instead of feeding a page URL to native video',async()=>{
  globalThis.__VITE_ENV__={};
  window.useBS=()=>({INK:'#111',INK50:'#777',PAPER:'#fff',PAPER2:'#eee',HAIR:'#ccc',MONO:'monospace',DISPLAY:'serif',padX:16});
  const {Preview}=await loadRealModule(fileURLToPath(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetMarketplace.jsx',import.meta.url)),{registry:new Map([['react',React],['react-dom',require('react-dom')]]),appendExports:'exports.Preview=BSPlanPreviewSheet;'});
  const root=createRoot(document.getElementById('root'));
  await React.act(async()=>root.render(React.createElement(Preview,{plan:{name:'Strength',detail:{media:[{type:'video',url:'https://youtu.be/M7lc1UVf-VE'}]}},onClose:()=>{}})));
  const watch=[...document.querySelectorAll('button')].find(b=>b.textContent.startsWith('▷ Watch'));
  assert.ok(Boolean(watch));await React.act(async()=>watch.click());
  assert.match(document.querySelector('iframe').src,/youtube-nocookie/);assert.equal(Boolean(document.querySelector('video')),false);
  assert.equal(document.querySelector('iframe').parentElement.parentElement.style.width,'100%');
  await React.act(async()=>root.unmount());
});

test('website offer video opens inline without starting the containing plan checkout',async()=>{
  globalThis.React=React;
  let purchases=0;const previousFetch=globalThis.fetch;
  globalThis.fetch=async()=>{purchases++;return {json:async()=>({})};};
  const {Services}=await loadRealModule(fileURLToPath(new URL('../public/newdesign/livingShared.jsx',import.meta.url)),{appendExports:'exports.Services=LvServices;'});
  const root=createRoot(document.getElementById('root'));
  try{
    await React.act(async()=>root.render(React.createElement(Services,{d:{role:'trainer',offerings:[{kind:'Program',name:'Strength',price:'$20',planId:'p',providerId:'c',media:[{type:'video',url:'https://vimeo.com/123456789'}]}]},ink:'#111',c:'#333',stHead:()=>null})));
    const watch=[...document.querySelectorAll('button')].find(b=>b.textContent.startsWith('▷ Watch'));
    assert.ok(Boolean(watch));await React.act(async()=>watch.click());
    assert.match(document.querySelector('iframe').src,/player.vimeo.com/);assert.equal(purchases,0);
    await React.act(async()=>watch.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Enter',bubbles:true})));assert.equal(purchases,0);
  }finally{await React.act(async()=>root.unmount());globalThis.fetch=previousFetch;}
});
