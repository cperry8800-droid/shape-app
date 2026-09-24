import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase-migrations/20260924020426_atomic_workout_privacy.sql',import.meta.url),'utf8');
const bridge=readFileSync(new URL('../public/newdesign/settingsSync.mjs',import.meta.url),'utf8');
test('the privacy cleanup belongs to the settings transaction, with owner RLS intact',()=>{
 assert.match(sql,/security invoker/i);assert.doesNotMatch(sql,/security definer/i);
 assert.match(sql,/set search_path = public, pg_temp/i);
 assert.match(sql,/after insert or update of data on public\.user_goals/i);
 assert.match(sql,/if new\.kind <> 'client_settings' then return new;/);
 assert.match(sql,/revoke all on function public\.shape_sync_workout_privacy\(\) from public, anon, authenticated/i);
 assert.doesNotMatch(bridge,/applySharingAudience|from\('community_posts'\)|from\('user_activity_live'\)/);
});
test('cleanup is scoped to this account and auto-posts, and never loosens history',()=>{
 assert.equal((sql.match(/author_id = new\.user_id and source_provider is not null/g)||[]).length,2);
 assert.match(sql,/privacy in \('public', 'community', 'followers'\)/);
 assert.match(sql,/privacy in \('public', 'community'\)/);
 assert.match(sql,/delete from public\.user_activity_live where user_id = new\.user_id/);
 assert.doesNotMatch(sql,/set privacy = 'public'/);
 assert.doesNotMatch(sql,/exception\s+when/i,'cleanup errors must propagate and roll back the initiating write');
});
