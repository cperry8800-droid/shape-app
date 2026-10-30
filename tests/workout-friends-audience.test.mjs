// Workouts shared with friends (2026-10-30-workout-friends-audience.sql).
//
// Settings → Share workout data → Friends gives a member's workouts the 'friends' audience:
// the people they follow who follow them back. The rule lives in four places that must agree:
// the JS share rule (workoutPrivacy.mjs), the settings trigger that tightens history, the
// app's own history tightener (tightenAutoPosts), and the read policies. These tests tie each
// one to the JS rule and its rank, so none of them can move alone.
//
// ⚠ WHY MUTUAL. Following a public profile is accepted at once (toggle_follow), so a
// followers-only audience on a public profile is anyone who taps Follow. Every 'friends' leg
// therefore needs BOTH follow rows, accepted. The legs were also run on a throwaway
// PostgreSQL 16 cluster (not checked in): the author and a mutual follow read a friends post
// and its live row; a one-way follower, a pending request either way, a person the author
// follows who does not follow back, and a visitor read neither.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bsWorkoutSharePrivacy, BS_PRIVACY_RANK } from '../mobile-app/src/services/workoutShare.mjs';
import { settingOptions } from '../public/newdesign/settingsSync.mjs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const SQL = read('supabase-migrations/2026-10-30-workout-friends-audience.sql');
const BACKEND = read('mobile-app/src/services/shapeBackend.js');
const CLIENT = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
const FEED_ROUTE = read('src/app/api/community/feed/route.ts');
const LIVING_PROFILE = read('public/newdesign/livingProfilePage.jsx');
const LIVING_SHARED = read('public/newdesign/livingShared.jsx');

// The migration without its comments, whitespace collapsed.
const CODE = SQL.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n').replace(/\s+/g, ' ');

// Stored tiers, from the posts' own check constraint.
const TIERS = (() => {
  const m = CODE.match(/add constraint community_posts_privacy_check check \(privacy in \(([^)]*)\)\)/);
  assert.ok(m, 'the posts check constraint is in the migration');
  return [...m[1].matchAll(/'([a-z]+)'/g)].map((x) => x[1]);
})();

// The tiers an audience tightens FROM: every ranked tier wider than it, and 'community'
// (signed-in members), which auto-posts never write but older ones may carry.
const looserThan = (aud) => [...Object.keys(BS_PRIVACY_RANK).filter((k) => BS_PRIVACY_RANK[k] < BS_PRIVACY_RANK[aud]), 'community'].sort();

test('posts and the live row accept the friends audience', () => {
  assert.deepEqual(TIERS, ['public', 'community', 'private', 'profile', 'followers', 'friends']);
  assert.match(CODE, /add constraint user_activity_live_visibility_check check \(visibility in \('public', 'followers', 'friends'\)\)/);
  // Still no 'private' live value: a private member's row is absent, never labelled.
  assert.doesNotMatch(CODE, /visibility in \([^)]*'private'/);
});

test('the settings trigger resolves the same audience as the share rule', () => {
  const block = CODE.match(/audience := case (.*?) end;/);
  assert.ok(block, 'the trigger still resolves an audience with one CASE');
  const arms = [...block[1].matchAll(/when (.*?) then '([a-z]+)'/g)].map(([, cond, aud]) => ({ cond, aud }));
  const fallback = block[1].match(/else '([a-z]+)'/)[1];
  assert.equal(arms.length, 3);
  // Each condition is coalesce(new.data->>'key', 'default') = 'value', joined by or.
  const evalArm = (cond, doc) => cond.split(/ or /).some((part) => {
    const m = part.trim().match(/^coalesce\(new\.data->>'(\w+)', '([^']*)'\) = '([^']*)'$/);
    assert.ok(m, `an arm the test can read: ${part}`);
    return String(doc[m[1]] ?? m[2]) === m[3];
  });
  const sqlRule = (doc) => (arms.find((a) => evalArm(a.cond, doc)) || { aud: fallback }).aud;
  for (const share of [undefined, 'On', 'Friends', 'Off']) {
    for (const profile of [undefined, 'Public', 'Just friends', 'Private']) {
      const doc = {};
      if (share) doc.shareWorkoutData = share;
      if (profile) doc.profileVisibility = profile;
      assert.equal(sqlRule(doc), bsWorkoutSharePrivacy(doc), JSON.stringify(doc));
    }
  }
});

test('the settings trigger tightens history by the rule\'s own rank, and never loosens it', () => {
  const updates = [...CODE.matchAll(/audience = '([a-z]+)' then update public\.community_posts set privacy = '([a-z]+)' where author_id = new\.user_id and source_provider is not null and privacy in \(([^)]*)\);/g)];
  const byAudience = Object.fromEntries(updates.map(([, aud, to, list]) => {
    assert.equal(to, aud, 'an audience tightens posts to itself');
    return [aud, [...list.matchAll(/'([a-z]+)'/g)].map((x) => x[1]).sort()];
  }));
  assert.deepEqual(Object.keys(byAudience).sort(), ['followers', 'friends', 'private']);
  for (const aud of Object.keys(byAudience)) assert.deepEqual(byAudience[aud], looserThan(aud), aud);
  assert.doesNotMatch(CODE, /set privacy = 'public'/);
});

test('the app\'s history tightener agrees with the trigger', () => {
  const m = BACKEND.match(/async function tightenAutoPosts\(newPrivacy\) \{[\s\S]*?const looser = ([\s\S]*?);\n/);
  assert.ok(m, 'tightenAutoPosts still computes the tiers it tightens from');
  const looser = new Function('newPrivacy', `return ${m[1]};`);
  for (const aud of ['followers', 'friends', 'private']) assert.deepEqual([...looser(aud)].sort(), looserThan(aud), aud);
  assert.deepEqual(looser('public'), []);
});

// Each friends leg must ask for the follow in BOTH directions, both accepted.
function assertMutual(segment, author, where) {
  assert.ok(segment, `${where}: found`);
  const viewerFollows = new RegExp(`follower_id = auth\\.uid\\(\\) and \\w+\\.following_id = ${author.replace(/\./g, '\\.')} and \\w+\\.status = 'accepted'`);
  const authorFollows = new RegExp(`follower_id = ${author.replace(/\./g, '\\.')} and \\w+\\.following_id = auth\\.uid\\(\\) and \\w+\\.status = 'accepted'`);
  assert.match(segment, viewerFollows, `${where}: the viewer follows the author`);
  assert.match(segment, authorFollows, `${where}: the author follows the viewer back`);
}

test('can_view_community_post: a friends post reads for the author and mutual follows only', () => {
  const fn = CODE.match(/create or replace function public\.can_view_community_post\(p_post_id uuid\)(.*?)\$\$;/);
  assert.ok(fn);
  assert.match(fn[1], /security definer set search_path = public, pg_temp/, 'the redefined definer is pinned');
  const leg = fn[1].match(/p\.privacy = 'friends' and \((.*?)\)\) or p\.author_id = auth\.uid\(\)/);
  assertMutual(leg && leg[1], 'p.author_id', 'can_view_community_post');
  // The legs before it are the 2026-07-08 ones, unchanged.
  assert.match(fn[1], /p\.privacy = 'public' or p\.privacy = 'profile' or \(p\.privacy = 'community' and auth\.uid\(\) is not null\) or \(p\.privacy = 'followers' and/);
});

test('the posts read policy matches can_view_community_post', () => {
  const pol = CODE.match(/create policy "read visible community posts" on public\.community_posts for select to anon, authenticated using \((.*?)\);/);
  assert.ok(pol);
  const leg = pol[1].match(/\(privacy = 'friends' (.*?)\) or author_id = auth\.uid\(\)/);
  assertMutual(leg && leg[1], 'community_posts.author_id', 'read visible community posts');
  assert.match(CODE, /drop policy if exists "read visible community posts" on public\.community_posts; create policy "read visible community posts"/);
});

test('the live row reads for mutual follows while it is live', () => {
  const pol = CODE.match(/create policy "live read" on public\.user_activity_live for select to authenticated using \((.*?)\);/);
  assert.ok(pol);
  const leg = pol[1].match(/\(visibility = 'friends' (.*?)\)\s*\)\s*\)/);
  assertMutual(leg && leg[1], 'user_activity_live.user_id', 'live read');
  // The friends leg sits inside the expiry test, like every non-owner leg.
  assert.ok(pol[1].indexOf('expires_at > now()') < pol[1].indexOf("visibility = 'friends'"));
  assert.match(CODE, /drop policy if exists "live read" on public\.user_activity_live; create policy "live read"/);
});

test('the migration can be re-run', () => {
  for (const m of CODE.matchAll(/add constraint (\w+)/g)) assert.match(CODE, new RegExp(`drop constraint if exists ${m[1]};`), m[1]);
  for (const m of CODE.matchAll(/create policy ("[^"]+") on ([\w.]+)/g)) assert.ok(CODE.includes(`drop policy if exists ${m[1]} on ${m[2]};`), m[1]);
  assert.match(CODE, /drop trigger if exists shape_sync_workout_privacy on public\.user_goals;/);
});

// ── the readers keep the tier ────────────────────────────────────────────────

const privacyToDb = (() => {
  const m = BACKEND.match(/function privacyToDb\(value\) \{[\s\S]*?\n\}/);
  assert.ok(m);
  return new Function(`${m[0]}; return privacyToDb;`)();
})();

test('a friends post is never written back as a wider tier', () => {
  // privacyToDb's fallback is 'community' (every signed-in member), so a tier it doesn't
  // know is a widening, not a refusal.
  for (const tier of TIERS) assert.equal(privacyToDb(tier), tier, tier);
  assert.match(FEED_ROUTE, /value === 'followers' \|\| value === 'friends'\) return value;/, 'the website\'s post route keeps it too');
});

test('editing a post keeps its tier: every stored tier has a label that maps back to it', () => {
  // The edit sheet saves the mapped label back through privacyToDb. 'followers' (and now
  // 'friends') used to read as 'Community', so an edit widened the post to every member.
  const m = BACKEND.match(/function communityPostFromRow\(row\) \{[\s\S]*?\n {4}privacy: ([\s\S]*?'Community'),\n/);
  assert.ok(m, 'communityPostFromRow still labels the stored privacy');
  const label = new Function('privacy', `return ${m[1]};`);
  for (const tier of TIERS) assert.equal(privacyToDb(label(tier)), tier, `${tier} → ${label(tier)}`);
});

test('the Following feed asks for friends posts; the open feed never does', () => {
  assert.match(FEED_ROUTE, /privacyIn = \['public', 'community', 'followers', 'friends'\];/);
  assert.match(FEED_ROUTE, /let privacyIn: string\[\] = \['public', 'community'\];/);
});

test('the website profile shows a friends post to the friend RLS returned it to', () => {
  assert.match(LIVING_PROFILE, /\["public", "community", "private", "profile", "followers", "friends"\]\.includes\(p\)/);
  assert.match(LIVING_PROFILE, /fq\.in\("privacy", \["public", "profile", "followers", "friends"\]\)/);
  assert.match(LIVING_SHARED, /function lvFeedVisible\(vis, owner\) \{ return owner \? true : \([^)]*vis === "friends"\); \}/);
});

// ── the choice itself ───────────────────────────────────────────────────────

test('both settings screens offer the same three choices', () => {
  const app = CLIENT.match(/shareWorkoutData: {2}\[([^\]]*)\]/);
  assert.ok(app, 'the app lists the choices');
  const appOptions = [...app[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  assert.deepEqual(appOptions, ['On', 'Friends', 'Off']);
  assert.deepEqual(settingOptions('shareWorkoutData'), appOptions, 'the website offers what the app stores');
  // The app's row is a three-way picker with a label for each choice.
  assert.match(CLIENT, /key: 'shareWorkoutData', segmented: PREF_OPTIONS\.shareWorkoutData,\s*segLabels: \[[^\]]*'settings:privacy\.shareFriends'[^\]]*\]/);
});

test('records stay off the public Wall unless workouts are shared publicly', () => {
  // A session's PRs announce only when the session itself was shared publicly.
  assert.match(BACKEND, /if \(resolvedPrivacy === 'public'\) announcePRsFromSetLogs\(setLogs\);/);
  assert.equal((BACKEND.match(/announcePRsFromSetLogs\(setLogs\)/g) || []).length, 1, 'no other call announces');
  // The Post-a-PR sheet names the friends setting rather than calling it "off".
  const friends = CLIENT.indexOf("if (share.privacy === 'friends')");
  const off = CLIENT.indexOf("if (share.privacy !== 'public')");
  assert.ok(friends > 0 && friends < off, 'friends is answered before the generic refusal');
  assert.match(CLIENT.slice(friends, off), /tr\('feed:wall\.friendsOnly'/);
});

test('the session player says who a shared session goes to', () => {
  assert.match(CLIENT, /shareAudience === 'friends' \? tr\('session:player\.shareToggleFriends'\) : tr\('session:player\.shareToggle'\)/);
  assert.match(CLIENT, /shareAudience === 'friends' \? tr\('session:player\.shareSubFriends'\) : tr\('session:player\.shareSub'\)/);
  // The toggle's seed still yields to a draft the member already set.
  assert.match(CLIENT, /if \(draft\?\.shareToFeed == null\) setShareToFeed\(rule !== 'private'\);/);
});
