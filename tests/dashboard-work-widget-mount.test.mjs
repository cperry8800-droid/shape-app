import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
const require=createRequire(import.meta.url);
const babel=require('next/dist/compiled/babel/core'),preset=require('next/dist/compiled/babel/preset-react');
const shared=readFileSync(new URL('../public/newdesign/dashData.jsx',import.meta.url),'utf8');
const reviewHelper=shared.slice(shared.indexOf('function dashCheckinReviewed('),shared.indexOf('// The unit a bound metric'));
const code=reviewHelper + babel.transformSync(readFileSync(new URL('../public/newdesign/dashToday.jsx',import.meta.url),'utf8'),{presets:[preset]}).code;
const client={profile:{id:'client-a',name:'Alex'},checkins:[{week_of:'2026-09-21',wins:'More sleep'}]};
const gridCode=babel.transformSync(readFileSync(new URL('../public/newdesign/dashGrid.jsx',import.meta.url),'utf8'),{presets:[preset]}).code;

for(const mode of ['Save as…','Coaching preset']) test(mode+' clones the captured tab even before React redraws',async()=>{
  const dom=new JSDOM('<div id="root"></div>',{url:'https://shape.test/newdesign/TrainerApp.html#clients'});
  const before={window:globalThis.window,document:globalThis.document,act:globalThis.IS_REACT_ACT_ENVIRONMENT};
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  const {DgSavedDashboards,dgBoardEdit}=new Function('React','window',gridCode+';return {DgSavedDashboards,dgBoardEdit};')(React,dom.window);
  const oldLayout={items:[{id:'roster',x:0,y:0,w:12,h:20}]};
  const captured={items:[{id:'roster',x:0,y:0,w:12,h:20},{id:'status',x:0,y:20,w:6,h:10}],added:['status']};
  let doc={trainer:{clients:oldLayout,business:{hidden:['revenue']},today:{added:['movers']}}};
  const store={read:()=>({doc,loaded:true}),change:(fn)=>{doc=fn(doc);},flush:()=>{}};
  const root=createRoot(document.getElementById('root'));
  try {
    await act(async()=>root.render(React.createElement(DgSavedDashboards,{store,role:'trainer',beforeChange:()=>{doc=dgBoardEdit(doc,'trainer',{type:'tab',board:'default',tab:'clients',layout:captured});}})));
    const open=[...document.querySelectorAll('button')].find(b=>b.textContent===mode);assert.ok(open);
    await act(async()=>open.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})));
    const form=document.querySelector('form');assert.ok(form);
    await act(async()=>form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));
    const boards=doc.savedDashboards.trainer.boards;
    assert.equal(boards.length,2);assert.deepEqual(boards[0].tabs.clients,captured);assert.deepEqual(boards[1].tabs.clients,captured);
    assert.deepEqual(boards[1].tabs.business,{hidden:['revenue']});
    assert.deepEqual(boards[1].tabs.today.added,mode==='Coaching preset'?['checkins','ending','week']:['movers']);
  } finally {await act(async()=>root.unmount());dom.window.close();globalThis.window=before.window;globalThis.document=before.document;globalThis.IS_REACT_ACT_ENVIRONMENT=before.act;}
});

test('a failed check-in review remains retryable even after its optimistic row disappears',async()=>{
  const dom=new JSDOM('<div id="root"></div>',{url:'https://shape.test/newdesign/TrainerApp.html#today'});
  const before={window:globalThis.window,document:globalThis.document,act:globalThis.IS_REACT_ACT_ENVIRONMENT};
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  let fail=true,account='coach-a',writes=0;
  function useReviews(){
    const [doc,setDoc]=React.useState({});
    return {doc,kind:'ready',accountId:account,apply:async(patches)=>{
      writes++;
      setDoc(current=>{const next={...current};for(const p of patches)next[p.weekOf]={...next[p.weekOf],[p.clientId]:p.patch};return next;});
      return !fail;
    }};
  }
  const {DashCheckinQueuePanel}=new Function('React','window','useCoachWeekReviews','serif','sans',code+';return {DashCheckinQueuePanel};')(React,dom.window,useReviews,'serif','sans');
  const root=createRoot(document.getElementById('root'));
  const render=()=>act(async()=>root.render(React.createElement(DashCheckinQueuePanel,{clients:[client],role:'trainer',live:true})));
  const button=(name)=>[...document.querySelectorAll('button')].find(b=>b.textContent===name);
  const click=async(name)=>{assert.ok(button(name),'missing '+name);await act(async()=>button(name).dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})));};
  try {
    await render();await click('Review Alex');await click('Mark reviewed');
    assert.equal(writes,1);assert.ok(button('Retry review save'));
    account='coach-b';await render();assert.ok(!button('Retry review save'),'another account must not retry this coach’s review');
    account='coach-a';await render();fail=false;await click('Retry review save');
    assert.equal(writes,2);assert.ok(!button('Retry review save'));assert.match(document.body.textContent,/Review saved/);
  } finally {
    await act(async()=>root.unmount());dom.window.close();
    globalThis.window=before.window;globalThis.document=before.document;globalThis.IS_REACT_ACT_ENVIRONMENT=before.act;
  }
});
