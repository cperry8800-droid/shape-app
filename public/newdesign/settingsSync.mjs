import { BS_PREF_OPTIONS, bsPrefOptionLabel, bsPrefOptionToken } from './prefOptions.mjs';

// Website names map to the app's existing account documents. An explicit empty
// value wins over legacy data, so clearing on either surface stays cleared.
export const SETTINGS_FIELDS = {
  displayName:['client_identity','name'], location:['client_identity','location'],
  handle:['client_identity','handle'], pronouns:['client_identity','pronouns'],
  dietaryStyle:['client_nutrition_prefs','dietary_style'], allergies:['client_nutrition_prefs','allergies'],
  dislikes:['client_nutrition_prefs','dislikes'], proteinTarget:['client_nutrition_prefs','protein_target_g'],
  calorieRange:['client_nutrition_prefs','calorie_range'], mealCadence:['client_nutrition_prefs','meal_cadence'],
  supplements:['client_nutrition_prefs','supplements'], alcohol:['client_nutrition_prefs','alcohol'],
  hydrationTarget:['client_nutrition_prefs','hydration_target_l'],
  primaryGoal:['client_training_prefs','primary_goal'], experience:['client_training_prefs','experience'],
  sessionsPerWeek:['client_training_prefs','sessions_per_week'], equipmentAccess:['client_training_prefs','equipment'],
  injuries:['client_training_prefs','injuries'], preferredTimes:['client_training_prefs','preferred_times'],
  profileVisibility:['client_settings','profileVisibility'], shareWorkoutData:['client_settings','shareWorkoutData'],
  units:['client_settings','units'],
  instagram:['profile_custom','instagram','links'], tiktok:['profile_custom','tiktok','links'],
  youtube:['profile_custom','youtube','links'], twitter:['profile_custom','x','links'], website:['profile_custom','website','links'],
};
const has=(o,k)=>Object.prototype.hasOwnProperty.call(o||{},k);
export function settingOptions(key) {
  if(key==='profileVisibility') return ['Public','Just friends','Private'];
  if(key==='shareWorkoutData') return ['On','Off'];
  if(key==='units') return ['Imperial · lb / mi','Metric · kg / km'];
  const spec=SETTINGS_FIELDS[key];
  return spec && BS_PREF_OPTIONS[spec[1]]?.map(o=>o.en);
}
export function projectSettings(legacy,docs) {
  const result={...(legacy||{})};
  for(const [field,[kind,key,nested]] of Object.entries(SETTINGS_FIELDS)) {
    const doc=nested?docs[kind]?.[nested]:docs[kind];
    if(has(doc,key)) result[field]=bsPrefOptionLabel(key,doc[key]);
  }
  // Privacy defaults must describe the publisher's actual defaults, never an
  // obsolete website-only choice that did not govern publishing.
  result.profileVisibility=docs.client_settings?.profileVisibility || 'Public';
  result.shareWorkoutData=docs.client_settings?.shareWorkoutData || 'On';
  result.units=docs.client_settings?.units || 'Imperial · lb / mi';
  return result;
}
async function owner(db,expected) {
  const user=await db.getUser();
  if(!user?.id) throw new Error('Sign in to save your settings.');
  if(expected && user.id!==expected) throw new Error('Your account changed. Reload Settings before editing.');
  return user.id;
}
export async function loadSettings(db) {
  const userId=await owner(db);
  const kinds=[...new Set(Object.values(SETTINGS_FIELDS).map(s=>s[0]))];
  const [legacy,...values]=await Promise.all([db.getClientProfile(),...kinds.map(k=>db.getUserGoals(k))]);
  await owner(db,userId);
  if(legacy==null || values.some(v=>v==null)) throw new Error('Could not load your settings. Please retry.');
  const docs=Object.fromEntries(kinds.map((k,i)=>[k,values[i]]));
  return {userId,profile:projectSettings(legacy,docs)};
}
const lanes=new WeakMap();
export function saveAccountDocPatch(db,kind,patch,expectedUserId) {
  const work=async()=>{
    if(!expectedUserId)throw new Error('Sign in before saving.');
    await owner(db,expectedUserId);
    const doc=await db.getUserGoals(kind);
    if(doc==null)throw new Error('Could not read your latest settings. Please retry.');
    await owner(db,expectedUserId);
    const next={...doc,...patch};
    const result=await db.saveUserGoals(kind,next,{expectedUserId});
    if(!result || result.error)throw new Error(result?.error?.message || 'Could not save. Please retry.');
    await owner(db,expectedUserId);
    return next;
  };
  const result=(lanes.get(db)||Promise.resolve()).catch(()=>{}).then(work);
  lanes.set(db,result);return result;
}
export function saveSettingsPatch(db,patch,expectedUserId) {
  if(!expectedUserId) return Promise.reject(new Error('Wait for your settings to load before saving.'));
  const work=async()=>{
    await owner(db,expectedUserId);
    const groups=new Map();
    for(const [field,value] of Object.entries(patch)) {
      const spec=SETTINGS_FIELDS[field];
      if(!spec) throw new Error('This setting must be changed in its dedicated account control.');
      const [kind,key,nested]=spec;
      const options=settingOptions(field);
      let clean=String(value??'').trim();
      if(options && field!=='profileVisibility' && field!=='shareWorkoutData' && field!=='units') clean=bsPrefOptionToken(key,clean);
      if(['profileVisibility','shareWorkoutData','units'].includes(field) && !options.includes(clean)) throw new Error('Choose one of the available options.');
      if(field==='displayName' && !clean) throw new Error('Enter your name.');
      if(field==='handle') clean=clean?'@'+clean.replace(/^@+/,''):'';
      if(['proteinTarget','hydrationTarget'].includes(field) && clean && (!Number.isFinite(Number(clean))||Number(clean)<0)) throw new Error('Enter a non-negative number without units.');
      if(!groups.has(kind))groups.set(kind,[]);
      groups.get(kind).push({key,nested,value:clean});
    }
    // All reads must succeed before any writes. Only edited fields are merged.
    const docs=new Map();
    for(const kind of groups.keys()) {
      const doc=await db.getUserGoals(kind);
      if(doc==null)throw new Error('Could not read your latest settings. Nothing was saved; please retry.');
      docs.set(kind,doc);
    }
    await owner(db,expectedUserId);
    for(const [kind,edits] of groups) {
      const next={...docs.get(kind)};
      for(const {key,nested,value} of edits) {
        if(nested) next[nested]={...(next[nested]||{}),[key]:value}; else next[key]=value;
      }
      const result=await db.saveUserGoals(kind,next,{expectedUserId});
      if(!result || result.error) throw new Error(result?.error?.message||'Could not save your settings. Please retry.');
      if(kind==='client_identity' && edits.some(e=>e.key==='name')) {
        await owner(db,expectedUserId);
        const mirrored=await db.client.from('profiles').update({full_name:next.name}).eq('id',expectedUserId);
        if(mirrored?.error)throw new Error('Profile saved, but the display name could not be updated everywhere. Retry Save.');
      }
      // The database trigger makes privacy and audience cleanup one transaction.
    }
    await owner(db,expectedUserId);
    return {ok:true};
  };
  const pending=(lanes.get(db)||Promise.resolve()).catch(()=>{}).then(work);
  lanes.set(db,pending);return pending;
}
