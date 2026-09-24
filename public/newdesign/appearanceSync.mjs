// Shared light/dark preference; app-specific color papers remain saved separately.
export const LIGHT_PAPERS = ['light','white','manila','steel','bone','sage','rose','mist'];
export function paperColorMode(paper) { return LIGHT_PAPERS.includes(paper) ? 'light' : 'dark'; }
export function effectiveAppPaper(doc) {
  const paper=doc?.paperMode || 'dark';
  const mode=doc?.colorMode;
  return (mode==='light'||mode==='dark') && paperColorMode(paper)!==mode ? mode : paper;
}
export function appearancePatch(key,value) {
  return key==='paperMode' ? {paperMode:value,colorMode:paperColorMode(value)} : {[key]:value};
}
const lanes=new WeakMap();
export function saveAppearancePatch(db,patch,expectedUserId) {
  if(!db)return Promise.resolve({error:{message:'Appearance is unavailable. Please retry.'}});
  const work=async()=>{
    if(!expectedUserId || !db?.getUserGoals || !db?.saveUserGoals) return {error:{message:'Sign in to save appearance.'}};
    const before=await db.getUser();
    if(before?.id!==expectedUserId)return {error:{message:'Account changed.'}};
    const doc=await db.getUserGoals('app_tweaks');
    if(doc==null)return {error:{message:'Could not load appearance; please retry.'}};
    const now=await db.getUser();
    if(now?.id!==expectedUserId)return {error:{message:'Account changed.'}};
    return db.saveUserGoals('app_tweaks',{...doc,...patch},{expectedUserId});
  };
  const result=(lanes.get(db)||Promise.resolve()).catch(()=>{}).then(work);
  lanes.set(db,result);return result;
}
