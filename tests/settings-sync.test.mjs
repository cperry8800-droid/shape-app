import test from 'node:test';
import assert from 'node:assert/strict';
import {loadSettings,projectSettings,saveSettingsPatch,saveAccountDocPatch} from '../public/newdesign/settingsSync.mjs';
import {appearancePatch,effectiveAppPaper,saveAppearancePatch} from '../public/newdesign/appearanceSync.mjs';
import {bsPrefOptionToken} from '../mobile-app/src/services/prefOptions.mjs';
function fixture(seed={}) {
 const docs=structuredClone(seed),writes=[],queries=[];
 const state={uid:'a',readError:false,writeError:false,queryError:false};
 const db={getUser:async()=>({id:state.uid}),getClientProfile:async()=>({displayName:'Legacy',profileVisibility:'Community only'}),getUserGoals:async k=>state.readError?null:structuredClone(docs[k]||{}),saveUserGoals:async(k,d,o)=>{
  if(state.writeError)return {error:{message:'Save rejected'}};
  if(o.expectedUserId!==state.uid)return {error:{message:'Account changed'}};
  docs[k]=structuredClone(d);writes.push({k,d,o});return {ok:true};
 },client:{from:table=>{
  const q={table};queries.push(q);const chain={update:v=>{q.update=v;return chain;},delete:()=>{q.delete=true;return chain;},eq:(k,v)=>{q.eq=[k,v];return chain;},not:(...v)=>{q.not=v;return chain;},in:(...v)=>{q.in=v;return chain;},then:resolve=>resolve({error:state.queryError?{message:'offline'}:null})};return chain;
 }}};
 return {db,docs,writes,queries,state};
}
test('website reads app values, explicit clears and the actual privacy defaults',async()=>{
 const f=fixture({client_identity:{name:'App name',location:''},client_training_prefs:{primary_goal:bsPrefOptionToken('primary_goal','Build muscle')}});
 const data=await loadSettings(f.db);
 assert.equal(data.profile.displayName,'App name');assert.equal(data.profile.location,'');
 assert.equal(data.profile.primaryGoal,'Build muscle');assert.equal(data.profile.profileVisibility,'Public');
 assert.equal(f.writes.length,0);
});
test('website patches round-trip to app documents without replacing sibling settings',async()=>{
 const f=fixture({client_identity:{name:'Old',photo:'photo.jpg'},profile_custom:{bio:'bio',links:{youtube:'video',x:'old'}}});
 await saveSettingsPatch(f.db,{displayName:'New',twitter:'',primaryGoal:'Build muscle'},'a');
 assert.deepEqual(f.docs.client_identity,{name:'New',photo:'photo.jpg'});
 assert.deepEqual(f.docs.profile_custom,{bio:'bio',links:{youtube:'video',x:''}});
 assert.equal(f.docs.client_training_prefs.primary_goal,bsPrefOptionToken('primary_goal','Build muscle'));
 const web=await loadSettings(f.db);assert.equal(web.profile.displayName,'New');assert.equal(web.profile.twitter,'');
});
test('failed reads, saves and account switches never report success or overwrite defaults',async()=>{
 const f=fixture();f.state.readError=true;
 await assert.rejects(saveSettingsPatch(f.db,{displayName:'New'},'a'),/read/);assert.equal(f.writes.length,0);
 f.state.readError=false;f.state.writeError=true;
 await assert.rejects(saveSettingsPatch(f.db,{displayName:'New'},'a'),/rejected/);
 f.state.writeError=false;f.state.uid='b';
 await assert.rejects(saveSettingsPatch(f.db,{displayName:'New'},'a'),/account changed/);
 assert.equal(f.writes.length,0);
});
test('switching accounts during a read refuses the subsequent write',async()=>{
 const f=fixture();f.db.getUserGoals=async()=>{f.state.uid='b';return {photo:'private'};};
 await assert.rejects(saveAccountDocPatch(f.db,'client_identity',{name:'New'},'a'),/account changed/);
 assert.equal(f.writes.length,0);
});
test('serialized app edits read the latest document and preserve web edits',async()=>{
 const f=fixture({client_nutrition_prefs:{dislikes:'web edit'}});
 await Promise.all([saveAccountDocPatch(f.db,'client_nutrition_prefs',{allergies:'nuts'},'a'),saveAccountDocPatch(f.db,'client_nutrition_prefs',{protein_target_g:'120'},'a')]);
 assert.deepEqual(f.docs.client_nutrition_prefs,{dislikes:'web edit',allergies:'nuts',protein_target_g:'120'});
 f.state.writeError=true;await assert.rejects(saveAccountDocPatch(f.db,'client_identity',{name:'No'},'a'),/rejected/);
});
test('privacy is one account-bound write; cleanup failure rolls back the save',async()=>{
 const f=fixture({client_settings:{profileVisibility:'Public',shareWorkoutData:'On',weekStarts:'Monday'}});
 f.state.writeError=true;
 await assert.rejects(saveSettingsPatch(f.db,{shareWorkoutData:'Off'},'a'),/rejected/);
 assert.equal(f.docs.client_settings.shareWorkoutData,'On');
 f.state.writeError=false;await saveSettingsPatch(f.db,{shareWorkoutData:'Off'},'a');
 assert.equal(f.docs.client_settings.weekStarts,'Monday');assert.equal(f.docs.client_settings.shareWorkoutData,'Off');
 assert.equal(f.writes.length,1);assert.equal(f.writes[0].o.expectedUserId,'a');
 assert.equal(f.queries.length,0,'no browser-side cleanup can be stranded by an account switch');
});
test('unknown account controls and invalid values are rejected before writing',async()=>{
 const f=fixture();
 for(const patch of [{email:'new@shape.test'},{profileVisibility:'Everyone'},{proteinTarget:'120 g'},{hydrationTarget:'-1'}]) await assert.rejects(saveSettingsPatch(f.db,patch,'a'));
 assert.equal(f.writes.length,0);
});
test('shared appearance keeps app color papers and merges only the changed keys',async()=>{
 const f=fixture({app_tweaks:{paperMode:'blueprint',colorMode:'dark',fontScale:1.2}});
 await saveAppearancePatch(f.db,{colorMode:'light'},'a');
 assert.equal(effectiveAppPaper(f.docs.app_tweaks),'light');assert.equal(f.docs.app_tweaks.paperMode,'blueprint');
 await saveAppearancePatch(f.db,{colorMode:'dark'},'a');assert.equal(effectiveAppPaper(f.docs.app_tweaks),'blueprint');
 await saveAppearancePatch(f.db,appearancePatch('paperMode','sage'),'a');
 assert.equal(effectiveAppPaper(f.docs.app_tweaks),'sage');assert.equal(f.docs.app_tweaks.colorMode,'light');assert.equal(f.docs.app_tweaks.fontScale,1.2);
 f.state.readError=true;const result=await saveAppearancePatch(f.db,{colorMode:'dark'},'a');assert.ok(result.error);assert.equal(f.writes.length,3);
});
