import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {loadRealModule} from './helpers/load-real-module.mjs';
const require=createRequire(import.meta.url);
const {JSDOM}=require('jsdom');
const dom=new JSDOM('<div id="root"></div>',{url:'https://shape.test/'});
globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.localStorage=window.localStorage;
Object.defineProperty(globalThis,'navigator',{value:window.navigator,configurable:true});
Object.defineProperty(document,'hidden',{value:false,configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const React=require('react');globalThis.React=React;
const {createRoot}=require('react-dom/client');globalThis.ReactDOM=require('react-dom');
globalThis.DashBuilder=require('../public/newdesign/dashBuilderCore.js');
globalThis.ShapeWorkoutDocument=require('../public/newdesign/workoutDocument.js');
globalThis.DashPill=({children})=>React.createElement('span',null,children);
const {DbuBuilder,dbuRecoveredTemplate,TrainerProgramsPage,DbuFutureUpdates}=await loadRealModule(fileURLToPath(new URL('../public/newdesign/dashBuilder.jsx',import.meta.url)),{appendExports:'export { DbuBuilder, dbuRecoveredTemplate, TrainerProgramsPage, DbuFutureUpdates };'});
const template=()=>({id:'0a7d7e48-46b1-4b23-b2f4-af4d3ef88004',name:'Lower',published:false,detail:{revision:2,builder:DashBuilder.newProgram('Lower')}});
const button=label=>[...document.querySelectorAll('button')].find(b=>b.textContent===label);
async function mount(t,extra={}){
  const root=createRoot(document.getElementById('root'));
  await React.act(async()=>root.render(React.createElement(DbuBuilder,{template:t,clients:[],queue:[],live:true,ownerId:'coach-a',playlists:[],clips:[],dayTemplates:[],onBack(){},onSaved(){},...extra})));
  return root;
}
async function changeName(value){await React.act(async()=>{const input=document.querySelector('[aria-label="Workout or program name"]');Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new window.Event('input',{bubbles:true}));});}
test('editing persists an account-scoped draft immediately, before debounce or navigation',async()=>{
  localStorage.clear();const root=await mount(template());await changeName('Upper revised');
  const stored=JSON.parse(localStorage.getItem('shape.dashBuilderDrafts.v2.coach-a'));
  assert.equal(stored[template().id].name,'Upper revised');
  assert.equal(localStorage.getItem('shape.dashBuilderDrafts.v2.coach-b'),null);
  await React.act(async()=>root.unmount());
  assert.equal(JSON.parse(localStorage.getItem('shape.dashBuilderDrafts.v2.coach-a'))[template().id].name,'Upper revised');
});
test('failed creation never reports saved or exits; retry preserves record identity',async()=>{
  localStorage.clear();const calls=[];let fail=true,saves=0,exits=0;
  globalThis.fetch=async(_url,options)=>{const body=JSON.parse(options.body);calls.push(body);return {ok:!fail,json:async()=>fail?{error:'Network unavailable'}:{plan:{...body,id:body.id,detail:{...body.detail,revision:1}}}};};
  const t=template();delete t.id;const root=await mount(t,{onSaved(){saves++;},onBack(){exits++;}});
  await changeName('New upper');await React.act(async()=>button('Save draft').click());
  assert.equal(saves,0);assert.match(document.body.textContent,/Network unavailable/);
  await React.act(async()=>button('← Library').click());assert.equal(exits,0);
  fail=false;await React.act(async()=>button('Retry save').click());
  assert.equal(saves,1);assert.equal(new Set(calls.map(c=>c.id)).size,1);
  await React.act(async()=>root.unmount());
});
test('save sends the loaded revision; a 409 retains draft and error',async()=>{
  localStorage.clear();let posted;
  globalThis.fetch=async(_url,options)=>{posted=JSON.parse(options.body);return {ok:false,json:async()=>({error:'Changed on another device'})};};
  const root=await mount(template());await changeName('Conflicting edit');await React.act(async()=>button('Save draft').click());
  assert.equal(posted.expectedOwnerId,'coach-a');assert.equal(posted.expectedRevision,2);assert.match(document.body.textContent,/Changed on another device/);
  assert.equal(JSON.parse(localStorage.getItem('shape.dashBuilderDrafts.v2.coach-a'))[template().id].name,'Conflicting edit');
  await React.act(async()=>root.unmount());
});

test('recovered creation retries the same id after an uncertain response and retains plan metadata',async()=>{
  localStorage.clear();let committed,fail=true;const calls=[];
  globalThis.fetch=async(_url,options)=>{
    const body=JSON.parse(options.body);calls.push({method:options.method,body});
    if(fail){committed={...body,detail:{...body.detail,revision:1}};throw new Error('Response lost after commit');}
    assert.equal(body.id,committed.id);assert.equal(options.method,'POST');
    return {ok:true,json:async()=>({plan:committed})};
  };
  const t=template();delete t.id;t.detail={...t.detail,buildType:'program',media:[{type:'video',name:'Demo',url:'https://shape.test/demo.mp4'}]};
  let root=await mount(t);await changeName('New program');await React.act(async()=>button('Save draft').click());
  const [id,draft]=Object.entries(JSON.parse(localStorage.getItem('shape.dashBuilderDrafts.v2.coach-a')))[0];
  assert.equal(draft.persisted,false);
  await React.act(async()=>root.unmount());
  const recovery=dbuRecoveredTemplate(id,draft,[committed]);
  assert.equal(recovery.draftId,id);assert.equal(recovery.detail.buildType,'program');assert.deepEqual(recovery.detail.media,t.detail.media);
  fail=false;root=await mount(recovery);await React.act(async()=>button('Save draft').click());
  assert.equal(new Set(calls.map(c=>c.body.id)).size,1);
  assert.deepEqual(Object.keys(JSON.parse(localStorage.getItem('shape.dashBuilderDrafts.v2.coach-a'))),[],'successful retry should remove the original recovery entry');
  await React.act(async()=>root.unmount());
});

test('an exercise upload cannot move to a copied day and video playback remains available',async()=>{
  localStorage.clear();let finishUpload,posted;
  window.shapeDb = { client: {
    auth: { getUser: async () => ({ data: { user: { id: 'coach-a' } } }) },
    storage: { from: () => ({
      upload: () => new Promise(resolve => { finishUpload = () => resolve({ error: null }); }),
      getPublicUrl: () => ({ data: { publicUrl: 'https://shape.test/uploaded.mp4' } }),
    }) },
  } };
  globalThis.fetch=async(_url,options)=>{posted=JSON.parse(options.body);return {ok:true,json:async()=>({plan:{...posted,detail:{...posted.detail,revision:3}}})};};
  const t=template();const exercise={...DashBuilder.newRow({id:'ex',name:'Squat',muscle:'Legs',equipment:'Barbell'}),video:'https://shape.test/original.mp4'};
  const upper={id:'upper',name:'Upper',blocks:[{kind:'main',rows:[exercise]}]};
  // Copied days deliberately retain exercise IDs, reproducing the React key reuse.
  t.detail.builder.weeks=[{days:[upper,{...structuredClone(upper),id:'lower',name:'Lower'}]}];
  const root=await mount(t);
  const file=document.querySelector('input[type="file"]');
  Object.defineProperty(file,'files',{value:[new window.File(['video'],'squat.mp4',{type:'video/mp4'})],configurable:true});
  await React.act(async()=>file.dispatchEvent(new window.Event('change',{bubbles:true})));
  assert.equal(document.querySelector('fieldset').disabled,true);
  assert.equal(document.querySelector('video').controls,true,'a video player is not disabled by the form lock');
  const lower=[...document.querySelectorAll('button')].find(b=>b.textContent.startsWith('Lower'));
  await React.act(async()=>lower.click());
  assert.equal(document.querySelector('#dbu-day-name').value,'Upper');
  const outside=document.createElement('a');outside.href='#clients';document.body.appendChild(outside);
  const nav=new window.MouseEvent('click',{bubbles:true,cancelable:true});
  await React.act(async()=>outside.dispatchEvent(nav));assert.equal(nav.defaultPrevented,true);outside.remove();
  await React.act(async()=>finishUpload());
  assert.equal(document.querySelector('fieldset').disabled,false);
  assert.equal(document.querySelector('video').getAttribute('src'),'https://shape.test/uploaded.mp4');
  await React.act(async()=>button('Save draft').click());
  assert.equal(posted.detail.builder.weeks[0].days[0].blocks[0].rows[0].video,'https://shape.test/uploaded.mp4');
  assert.equal(posted.detail.builder.weeks[0].days[1].blocks[0].rows[0].video,'https://shape.test/original.mp4');
  await React.act(async()=>root.unmount());
});

function libraryChrome(source) {
  globalThis.useDashboard=()=>({clients:[],queue:[],today:null,source});
  globalThis.DashPage=({children})=>React.createElement('main',null,children);
  globalThis.DashDemoBand=()=>React.createElement('p',null,'Demo');
  globalThis.trainerNavItems=()=>[];
  globalThis.trainerPayoutCard={};
}
test('a failed demo load clears raw parse errors while live failure gives an actionable retry',async()=>{
  libraryChrome('demo');
  globalThis.fetch=async()=>({ok:false,json:async()=>{throw new SyntaxError('Unexpected token N, Not found is not valid JSON');}});
  let root=createRoot(document.getElementById('root'));
  await React.act(async()=>root.render(React.createElement(TrainerProgramsPage)));
  assert.ok(button('Edit workout'));
  assert.doesNotMatch(document.body.textContent,/Unexpected token|Not found is not valid JSON|Could not load your workouts/);
  await React.act(async()=>root.unmount());
  libraryChrome('live');root=createRoot(document.getElementById('root'));
  await React.act(async()=>root.render(React.createElement(TrainerProgramsPage)));
  assert.match(document.body.textContent,/Could not load your workouts\. Check your connection and retry\./);
  assert.doesNotMatch(document.body.textContent,/Unexpected token/);
  await React.act(async()=>root.unmount());
});

test('the exercise picker is portaled and adds multiple checked exercises together',async()=>{
  localStorage.clear();let posted;
  globalThis.fetch=async(_url,options)=>{posted=JSON.parse(options.body);return {ok:true,json:async()=>({plan:{...posted,detail:{...posted.detail,revision:3}}})};};
  const root=await mount(template());
  await React.act(async()=>button('+ Exercise').click());
  const dialog=document.querySelector('[role="dialog"][aria-label="Add exercises"]');
  assert.ok(dialog);assert.equal(dialog.parentElement.parentElement,document.body);
  assert.equal(document.getElementById('root').contains(dialog),false);
  const inputs=[...dialog.querySelectorAll('input[type="checkbox"]')].slice(0,2);
  const selectedNames=DashBuilder.searchExercises('').slice(0,2).map(e=>e.name);
  await React.act(async()=>inputs[0].click());assert.equal(inputs[0].checked,true);
  await React.act(async()=>inputs[1].click());assert.equal(inputs[1].checked,true);
  assert.equal(button('Add 2 exercises').disabled,false);
  await React.act(async()=>button('Add 2 exercises').click());
  assert.equal(document.querySelector('[role="dialog"]'),null);
  await React.act(async()=>button('Save draft').click());
  assert.deepEqual(posted.detail.builder.weeks[0].days[0].blocks[0].rows.map(r=>r.name),selectedNames);
  await React.act(async()=>root.unmount());
});

test('a library account change closes the old account editor without moving its local draft',async()=>{
  localStorage.clear();libraryChrome('live');let owner='coach-a';
  globalThis.fetch=async(url)=>({ok:true,json:async()=>url.includes('soundtracks')?{soundtracks:[]}:{ownerId:owner,plans:[{...template(),kind:'program',name:owner+' workout'}]}});
  const root=createRoot(document.getElementById('root'));
  await React.act(async()=>root.render(React.createElement(TrainerProgramsPage)));
  await React.act(async()=>button('Edit workout').click());
  await changeName('Private A draft');
  owner='coach-b';await React.act(async()=>window.dispatchEvent(new window.Event('focus')));
  assert.equal(document.querySelector('[aria-label="Workout or program name"]'),null);
  assert.match(document.body.textContent,/coach-b workout/);
  assert.equal(localStorage.getItem('shape.dashBuilderDrafts.v2.coach-b'),null);
  assert.equal(JSON.parse(localStorage.getItem('shape.dashBuilderDrafts.v2.coach-a'))[template().id].name,'Private A draft');
  await React.act(async()=>root.unmount());
});

test('future updates submit the selected preview snapshot alongside its prescription',async()=>{
  const before={id:template().id,title:'Old lower',description:null,kind:'template',scheduled_date:'2040-06-05',payload:{exercises:[{name:'Squat',reps:'5'}]},exercises:[{name:'Squat',reps:'5'}]};
  const row={id:before.id,clientId:'client-a',title:'New lower',description:'Keep each rep controlled',scheduledDate:before.scheduled_date,before,payload:{exercises:[{name:'Squat',reps:'6'}]}};
  let posted;
  globalThis.fetch=async(_url,options)=>{
    if(options.method==='POST'){posted=JSON.parse(options.body);return {ok:true,json:async()=>({ok:true})};}
    return {ok:true,json:async()=>({assignments:[row],skipped:0})};
  };
  const root=createRoot(document.getElementById('root'));
  await React.act(async()=>root.render(React.createElement(DbuFutureUpdates,{template:template(),clients:[],onClose(){}})));
  await React.act(async()=>document.querySelector('input[type="checkbox"]').click());
  await React.act(async()=>button('Update 1 workouts').click());
  assert.deepEqual(posted.assignmentPreconditions,[before]);
  assert.equal(posted.sessions[0].title,'New lower');
  assert.equal(posted.sessions[0].description,row.description);
  await React.act(async()=>root.unmount());
});

test('an uncertain creation conflict can be explicitly saved as a new copy without overwriting the committed record',async()=>{
  localStorage.clear();const calls=[];let committed,first=true;
  globalThis.fetch=async(_url,options)=>{
    const body=JSON.parse(options.body);calls.push(body);
    if(first){first=false;committed=body;throw new Error('Response lost');}
    if(body.id===committed.id)return {ok:false,status:409,json:async()=>({error:'This draft was already saved.',code:'revision_conflict'})};
    return {ok:true,json:async()=>({plan:{...body,detail:{...body.detail,revision:1}}})};
  };
  const t=template();delete t.id;const root=await mount(t);
  await changeName('Committed version');await React.act(async()=>button('Save draft').click());
  await changeName('Edited after response loss');await React.act(async()=>button('Save draft').click());
  assert.equal(calls[0].id,calls[1].id);assert.ok(button('Save as new copy'));
  await React.act(async()=>button('Save as new copy').click());
  assert.notEqual(calls[2].id,committed.id);assert.equal(calls[2].published,false);assert.equal(calls[2].expectedRevision,0);
  assert.equal(calls[2].name,'Edited after response loss (copy)');assert.equal(committed.name,'Committed version');
  assert.equal(JSON.parse(localStorage.getItem('shape.dashBuilderDrafts.v2.coach-a')||'{}')[committed.id],undefined);
  await React.act(async()=>root.unmount());
});
