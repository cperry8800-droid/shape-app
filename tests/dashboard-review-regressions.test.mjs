import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
const directory=new URL('../public/newdesign/',import.meta.url);
const read=(name)=>readFileSync(new URL(name,directory),'utf8');

test('schedule deep links reject impossible dates and retain leap days',()=>{
  const source=read('dashSchedule.jsx');
  const helpers=source.slice(source.indexOf('function dscIso('),source.indexOf('function dscMonday('));
  const parse=new Function(helpers+';return dscRouteDate;')();
  for(const value of ['2026-99-99','2026-02-30','2026-02-29','2026-9-23','garbage','']) assert.equal(parse(value),null,value);
  assert.equal(parse('2028-02-29').getDate(),29);
  assert.equal(parse('2026-09-23').getMonth(),8);
});

test('shared review store distinguishes resolving auth from a signed-out account',()=>{
  const source=read('dashData.jsx');
  const hook=source.slice(source.indexOf('function useCoachWeekReviews('),source.indexOf('// Shared by Today and Week'));
  let account;
  const useReviews=new Function('useSignedIn','useCoachDoc',hook+';return useCoachWeekReviews;')(()=>account,()=>({kind:'demo',doc:{},apply:()=>false}));
  assert.equal(useReviews(true).kind,'loading');
  account=null;assert.equal(useReviews(true).kind,'signedout');
  assert.equal(useReviews(false).kind,'demo');
});

test('dashboard hosts fetch current plain scripts including the lazy auth bridge',()=>{
  for(const file of readdirSync(directory).filter(name=>name.endsWith('.html'))) {
    const html=read(file);
    for(const match of html.matchAll(/src="(dashSignals\.js[^" ]*)"/g)) assert.equal(match[1],'dashSignals.js?v=20260923',file);
    for(const match of html.matchAll(/src="(\/supabase\.js[^" ]*)"/g)) assert.equal(match[1],'/supabase.js?v=20260923',file);
  }
  assert.match(read('pageShell.jsx'),/load\("\/supabase\.js\?v=20260923"\)/);
  assert.ok(read('dashData.jsx').includes('function dashCheckinReviewed('));
  assert.ok(!read('dashToday.jsx').includes('function dashCheckinReviewed('));
});
