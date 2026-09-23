import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';
import * as profileLib from '../public/newdesign/profileCustom.mjs';
const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<button id="opener">Edit profile</button><div id="root"></div>', {url:'https://shape.test/'});
globalThis.window=dom.window; globalThis.document=window.document;
Object.defineProperty(globalThis,'navigator',{value:window.navigator, configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const React=require('react'); globalThis.React=React; globalThis.ReactDOM=require('react-dom');
const { createRoot }=require('react-dom/client');
Object.assign(globalThis,{LV_INK:'#f2ede4',LV_BG:'#100d0a',LV_TEAL:'#2ee0c4',lvShade:(c)=>c});
window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
window.HTMLDialogElement.prototype.close=function(){this.open=false;};
window.ShapeProfileLib=profileLib;
const {ProfileCustomizer}=await loadRealModule(fileURLToPath(new URL('../public/newdesign/livingDesktop.jsx',import.meta.url)),{appendExports:'export { ProfileCustomizer };'});
let root;
const button=(name)=>[...document.querySelectorAll('button')].find(e=>(e.getAttribute('aria-label')||e.textContent.trim())===name);
const click=async e=>React.act(async()=>e.click());
async function mount(props={}){
 if(root)await React.act(async()=>root.unmount());
 document.body.innerHTML='<button id="opener">Edit profile</button><div id="root"></div>';
 document.getElementById('opener').focus();
 root=createRoot(document.getElementById('root'));
 await React.act(async()=>root.render(React.createElement(ProfileCustomizer,{initial:{bio:'Existing bio',links:{instagram:'coach'},pinned:{kind:'win',title:'First race'}},c:'#2ee0c4',coach:true,onClose:()=>{},onSave:()=>{},...props})));
}
async function input(name,value){
 const el=document.querySelector('[aria-label="'+name+'"]');
 await React.act(async()=>{Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new window.Event('input',{bubbles:true}));});
}
test('sections retain draft edits, roving keyboard tabs select a panel, and all panels save together',async()=>{
 let saved,write;
 window.shapeDb={client:{auth:{getUser:async()=>({data:{user:{id:'u1'}}})},from:()=>({upsert:async x=>{write=x;return{};}})}};
 await mount({onSave:d=>{saved=d;}});
 assert.ok(document.querySelector('dialog').open);
 assert.equal(document.body.style.overflow,'hidden');
 await input('Bio','Updated bio');
 await click(button('Links'));
 assert.equal(document.querySelector('[role="tabpanel"]:not([hidden])').getAttribute('aria-labelledby'),button('Links').id);
 await input('Instagram','newcoach');
 await React.act(async()=>button('Links').dispatchEvent(new window.KeyboardEvent('keydown',{key:'Home',bubbles:true})));
 assert.equal(button('About').getAttribute('aria-selected'),'true');
 assert.equal(document.querySelector('[aria-label="Bio"]').value,'Updated bio');
 await click(button('Save profile'));
 assert.equal(write.kind,'profile_custom');assert.equal(write.user_id,'u1');
 assert.equal(saved.bio,'Updated bio');assert.equal(saved.links.instagram,'newcoach');assert.equal(saved.pinned.title,'First race');
 await React.act(async()=>root.unmount());root=null;
 assert.equal(document.body.style.overflow,'');assert.equal(document.activeElement.id,'opener');
});
test('a failed save stays open and announces the error in the fixed footer',async()=>{
 let saved=false;
 window.shapeDb={client:{auth:{getUser:async()=>({data:{user:{id:'u1'}}})},from:()=>({upsert:async()=>({error:{message:'Could not save'}})})}};
 await mount({onSave:()=>{saved=true;}});
 await click(button('Save profile'));
 assert.equal(saved,false);assert.ok(document.querySelector('dialog').open);
 assert.match(document.querySelector('footer [role="alert"]').textContent,/Could not save/);
 assert.equal(button('Save profile').disabled,false);
});
test('Escape dismisses through onClose and member panels keep member-only controls',async()=>{
 let closed=0;window.shapeDb=null;
 await mount({coach:false,onClose:()=>closed++});
 assert.ok(!document.querySelector('.dk-editor-business'));
 await click(button('Highlights'));
 assert.ok(document.querySelector('[aria-label="Training goal"]'));
 await React.act(async()=>document.querySelector('dialog').dispatchEvent(new window.Event('cancel',{cancelable:true,bubbles:true})));
 assert.equal(closed,1);
 await React.act(async()=>root.unmount());root=null;
});
test('an account switch cannot save the previous owner profile into the next account',async()=>{
 let writes=0,saved=false;
 window.shapeDb={client:{auth:{getUser:async()=>({data:{user:{id:'other-owner'}}})},from:()=>({upsert:async()=>{writes++;return{};}})}};
 await mount({ownerUid:'original-owner',onSave:()=>{saved=true;}});
 await click(button('Save profile'));
 assert.equal(writes,0);assert.equal(saved,false);
 assert.match(document.querySelector('[role="alert"]').textContent,/account changed/);
 await React.act(async()=>root.unmount());root=null;
});
