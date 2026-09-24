import test, {afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {loadRealModule} from './helpers/load-real-module.mjs';
const require=createRequire(import.meta.url), {JSDOM}=require('jsdom');
const dom=new JSDOM('<div id="root"></div>',{url:'https://shape.test/'});
globalThis.window=dom.window;globalThis.document=window.document;globalThis.localStorage=window.localStorage;
Object.defineProperty(globalThis,'navigator',{value:window.navigator,configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
window.confirm=()=>true;
const React=require('react');globalThis.React=React;globalThis.ReactDOM=require('react-dom');
const {createRoot}=require('react-dom/client');
globalThis.DashBuilder=require('../public/newdesign/dashBuilderCore.js');
globalThis.DashMeals=require('../public/newdesign/dashMealCore.js');
globalThis.ShapeWorkoutDocument=require('../public/newdesign/workoutDocument.js');
globalThis.DashPill=({children})=>React.createElement('span',null,children);
globalThis.DashWorkoutCard=globalThis.DashMealLedgerCard=()=>null;
globalThis.useRememberedChoices=live=>({live});
const choices=[];
globalThis.useRememberedChoice=(store,key,allowed,fallback)=>{choices.push({key,allowed,fallback});return React.useState(fallback);};
const nd=f=>fileURLToPath(new URL('../public/newdesign/'+f,import.meta.url));
Object.assign(globalThis,await loadRealModule(nd('coachBuilderLayouts.jsx'),{appendExports:'export {COACH_BUILDER_LAYOUTS,CoachBuilderNav,CoachBuilderFooter,coachTemplateCopy};'}));
Object.assign(globalThis,await loadRealModule(nd('dashFilterBar.jsx'),{appendExports:'export {useDfbPopShift};'}));
const {DbuBuilder}=await loadRealModule(nd('dashBuilder.jsx'),{appendExports:'export {DbuBuilder};'});
const {DmbBuilder}=await loadRealModule(nd('dashMealBuilder.jsx'),{appendExports:'export {DmbBuilder};'});
const {DashWorkoutCard:WorkoutCard}=await loadRealModule(nd('dashClient.jsx'),{appendExports:'export {DashWorkoutCard};'});
globalThis.serif='serif';
let root;afterEach(async()=>{if(root)await React.act(async()=>root.unmount());root=null;localStorage.clear();});
const button=t=>[...document.querySelectorAll('button')].find(b=>b.textContent===t);
const click=async t=>{assert.ok(button(t),'missing '+t);await React.act(async()=>button(t).click());};
async function input(label,value){const el=document.querySelector('[aria-label="'+label+'"]');assert.ok(el,'missing '+label);await React.act(async()=>{Object.getOwnPropertyDescriptor(el.tagName==='SELECT'?window.HTMLSelectElement.prototype:window.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new window.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));});}
async function mount(Component,template,extra={}){root=createRoot(document.getElementById('root'));await React.act(async()=>root.render(React.createElement(Component,{template,clients:[],queue:[],lifecycle:[],live:true,ownerId:'coach-a',playlists:[],clips:[{name:'Squat demo',url:'https://shape.test/squat.mp4'}],dayTemplates:[],onBack(){},onSaved(){},...extra})));}
function capture(){const writes=[];globalThis.fetch=async(url,opts)=>{const body=JSON.parse(opts.body);writes.push({method:opts.method,...body});return {ok:true,json:async()=>({plan:{...body,detail:{...body.detail,revision:1}}})};};return writes;}

test('all workout layouts edit the same complete prescription and reuse saves a separate template',async()=>{
  const original={id:'source',published:true,name:'Strength',detail:{revision:7,buildType:'program',builder:DashBuilder.newProgram()}};
  const row={...DashBuilder.newRow({name:'Squat'}),rpe:7,rest:'90s',tempo:'3010',cue:'Brace',group:'A',progression:{incKg:2.5},video:'https://shape.test/original.mp4',perSet:[{reps:'5',load:50}]};
  original.detail.builder.weeks[0].days[0].blocks[0].rows=[row];
  const baseline=structuredClone(original),writes=capture();
  await mount(DbuBuilder,coachTemplateCopy(original));
  assert.equal(document.querySelector('.cbuilder').dataset.layout,'guided');
  await click('Continue →');
  await input('Squat Rest','105s');await input('Squat target RPE','8.5');
  await input('Choose demo for Squat','https://shape.test/squat.mp4');
  for(const layout of ['Editor','Planner','Guided'])await click(layout);
  await click('Save template');
  assert.equal(writes.length,1);assert.equal(writes[0].method,'POST');assert.notEqual(writes[0].id,original.id);
  assert.equal(writes[0].published,false);assert.equal(writes[0].expectedRevision,0);
  const saved=writes[0].detail.builder.weeks[0].days[0].blocks[0].rows[0];
  assert.equal(saved.rest,'105s');assert.equal(saved.rpe,8.5);assert.equal(saved.video,'https://shape.test/squat.mp4');
  for(const k of ['sets','reps','tempo','cue','group','progression','perSet'])assert.deepEqual(saved[k],row[k],k+' survived');
  assert.deepEqual(original,baseline,'reuse never edits the original');
  assert.ok(choices.some(c=>c.key==='workoutBuilderLayout'&&c.fallback==='guided'&&c.allowed.length===3));
});

test('nutrition layouts preserve exclusions, swaps, variants and groceries while saving a new template',async()=>{
  const original=structuredClone(DashMeals.demoMealTemplates()[0]);original.id='original-meal';original.published=true;
  const baseline=structuredClone(original),writes=capture();
  await mount(DmbBuilder,coachTemplateCopy(original));
  await input('Daily Protein g target','165');
  await click('Continue →');const meal=original.detail.mealBuilder.days[0].slots[0];
  await input(meal.name+' Protein g','42');
  for(const layout of ['Editor','Planner','Guided'])await click(layout);
  await click('Save template');
  assert.equal(writes.length,1);assert.equal(writes[0].method,'POST');assert.notEqual(writes[0].id,original.id);
  assert.equal(writes[0].detail.mealBuilder.targets.p,165);
  assert.equal(writes[0].detail.mealBuilder.days[0].slots[0].p,42);
  assert.deepEqual(writes[0].detail.mealBuilder.constraints,baseline.detail.mealBuilder.constraints);
  assert.deepEqual(writes[0].detail.mealBuilder.days[0].slots[0].swaps,meal.swaps);
  assert.deepEqual(original,baseline);
  assert.ok(choices.some(c=>c.key==='mealBuilderLayout'&&c.fallback==='guided'&&c.allowed.length===3));
});

test('a failed nutrition save retains the copy, never assigns, and retries the same record',async()=>{
  const template=coachTemplateCopy(DashMeals.demoMealTemplates()[0]);let fail=true;const writes=[];
  globalThis.fetch=async(url,opts)=>{const body=JSON.parse(opts.body);writes.push(body);return {ok:!fail,json:async()=>fail?{error:'Offline'}:{plan:body}};};
  await mount(DmbBuilder,template);await click('4Review');await click('Assign to clients →');
  assert.match(document.body.textContent,/Offline/);assert.equal(document.querySelector('[role="dialog"]')==null,true);
  fail=false;await click('Retry save');assert.equal(writes[0].id,writes[1].id);assert.equal(writes[1].name,template.name);
});

test('template copies discard identity and recovery fields while deeply retaining content',()=>{
  const original={id:'one',draftId:'draft',recovered:{doc:{}},name:'Source',published:true,detail:{revision:9,mealBuilder:{days:[{slots:[{swaps:[{name:'A'}]}],variants:{rest:{overrides:{a:{name:'B'}}}}}]}}};
  const copy=coachTemplateCopy(original);copy.detail.mealBuilder.days[0].slots[0].swaps[0].name='Changed';
  assert.equal(original.detail.mealBuilder.days[0].slots[0].swaps[0].name,'A');
  for(const field of ['id','draftId','recovered'])assert.equal(copy[field],undefined);
  assert.equal(copy.detail.revision,0);assert.equal(copy.published,false);
});

test('leaving nutrition waits for edits made while its save is in flight',async()=>{
  const template=coachTemplateCopy(DashMeals.demoMealTemplates()[0]);const writes=[];let release, left=0;
  globalThis.fetch=async(url,opts)=>{const body=JSON.parse(opts.body);writes.push({method:opts.method,...body});if(writes.length===1)await new Promise(resolve=>{release=resolve;});return {ok:true,json:async()=>({plan:body})};};
  await mount(DmbBuilder,template,{onBack(){left++;}});
  await click('← Library');assert.equal(left,0);
  await input('Daily Protein g target','180');
  await React.act(async()=>release());
  assert.equal(writes.length,2);assert.equal(writes[0].method,'POST');assert.equal(writes[1].method,'PATCH');
  assert.equal(writes[0].id,writes[1].id);assert.equal(writes[1].detail.mealBuilder.targets.p,180);assert.equal(left,1);
});

test('the actual client preview offers safe coach demonstrations without autoplay',async()=>{
  root=createRoot(document.getElementById('root'));
  await React.act(async()=>root.render(React.createElement(WorkoutCard,{workout:{title:'Strength',coach:'Coach',exercises:[{name:'Squat',video:'https://shape.test/squat.mp4'},{name:'Invalid',video:'javascript:alert(1)'}]},interactive:false})));
  assert.equal(document.querySelectorAll('video').length,0);
  await React.act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='▷ Watch · Squat demonstration').click());
  assert.equal(document.querySelectorAll('video').length,1);
  const video=document.querySelector('video');assert.equal(video.getAttribute('src'),'https://shape.test/squat.mp4');
  assert.equal(video.controls,true);assert.equal(video.autoplay,false);assert.equal(video.preload,'metadata');
  assert.equal(document.querySelectorAll('iframe').length,0);
});
