// Mutation spec for workouts shared with friends (owner, 2026-10-30: "make their workouts public
// with friends so … they can tap into the workout and see specifics like how fast you are
// running, pace, etc"): the share rule, the migration's read legs and trigger, the app's history
// tightener and normalizers, and the places a friends audience must not widen. Every mutation
// must be killed.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/workout-friends-audience-2026-10-30.mutations.mjs --fail-on-skipped
const SQL = 'supabase-migrations/2026-10-30-workout-friends-audience.sql';
const RULE = 'public/newdesign/workoutPrivacy.mjs';
const BACKEND = 'mobile-app/src/services/shapeBackend.js';
const APP = 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx';
const FEED_MODE = 'mobile-app/src/services/feedMode.mjs';
const FEED_ROUTE = 'src/app/api/community/feed/route.ts';
const WEB_PROFILE = 'public/newdesign/livingProfilePage.jsx';
const WEB_SHARED = 'public/newdesign/livingShared.jsx';
const WEB_SETTINGS = 'public/newdesign/settingsSync.mjs';

export default {
  test: 'node --test tests/workout-friends-audience.test.mjs tests/workout-share.test.mjs tests/composer-default-visibility.test.mjs tests/settings-sync.test.mjs tests/feed-mode.test.mjs tests/atomic-privacy-trigger.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // ── the share rule ──
    { name: 'rule: Friends is ignored (the profile decides)', file: RULE,
      find: "  if (String(d.shareWorkoutData || 'On') === 'Friends') return 'friends';\n", replace: '' },
    { name: 'rule: Friends outranks a Private profile', file: RULE,
      find: "  if (String(d.profileVisibility || 'Public') === 'Private') return 'private';\n  if (String(d.shareWorkoutData || 'On') === 'Friends') return 'friends';",
      replace: "  if (String(d.shareWorkoutData || 'On') === 'Friends') return 'friends';\n  if (String(d.profileVisibility || 'Public') === 'Private') return 'private';" },
    { name: 'rule: Friends reads as followers', file: RULE,
      find: "=== 'Friends') return 'friends';", replace: "=== 'Friends') return 'followers';" },
    { name: 'rank: friends wider than followers', file: RULE,
      find: '{ public: 0, followers: 1, friends: 2, private: 3 }', replace: '{ public: 0, followers: 2, friends: 1, private: 3 }' },

    // ── the migration: who reads ──
    { name: 'sql: posts refuse the friends tier', file: SQL,
      find: "check (privacy in ('public', 'community', 'private', 'profile', 'followers', 'friends'));", replace: "check (privacy in ('public', 'community', 'private', 'profile', 'followers'));" },
    { name: 'sql: the live row refuses the friends tier', file: SQL,
      find: "check (visibility in ('public', 'followers', 'friends'));", replace: "check (visibility in ('public', 'followers'));" },
    { name: 'sql: can_view lets in a one-way follower', file: SQL,
      find: "            and exists (\n              select 1 from public.user_follows b\n              where b.follower_id = p.author_id\n                and b.following_id = auth.uid()\n                and b.status = 'accepted'\n            )\n",
      replace: '' },
    { name: 'sql: can_view takes a pending follow back', file: SQL,
      find: "              where b.follower_id = p.author_id\n                and b.following_id = auth.uid()\n                and b.status = 'accepted'",
      replace: "              where b.follower_id = p.author_id\n                and b.following_id = auth.uid()" },
    { name: 'sql: can_view is unpinned', file: SQL,
      find: "security definer\nset search_path = public, pg_temp\nas $$\n  select exists (", replace: "security definer\nset search_path = public\nas $$\n  select exists (" },
    { name: 'sql: the posts policy lets in a one-way follower', file: SQL,
      find: "      and exists (\n        select 1 from public.user_follows b\n        where b.follower_id = community_posts.author_id\n          and b.following_id = auth.uid()\n          and b.status = 'accepted'\n      ))",
      replace: '      )' },
    { name: 'sql: the posts policy lets in someone the author follows', file: SQL,
      find: "      and exists (\n        select 1 from public.user_follows f\n        where f.follower_id = auth.uid()\n          and f.following_id = community_posts.author_id\n          and f.status = 'accepted'\n      )\n      and exists (",
      replace: '      and exists (' },
    { name: 'sql: the live policy lets in a one-way follower', file: SQL,
      find: "        and exists (\n            select 1 from public.user_follows b\n            where b.follower_id = user_activity_live.user_id and b.following_id = auth.uid() and b.status = 'accepted'))",
      replace: '        )' },
    { name: 'sql: the live friends leg ignores expiry', file: SQL,
      find: "      or (visibility = 'friends'\n        and exists (", replace: "    ) or (visibility = 'friends'\n        and exists (" },

    // ── the migration: the settings trigger ──
    { name: 'trigger: Friends is ignored', file: SQL,
      find: "    when coalesce(new.data->>'shareWorkoutData', 'On') = 'Friends' then 'friends'\n", replace: '' },
    { name: 'trigger: a Just friends profile outranks Friends', file: SQL,
      find: "    when coalesce(new.data->>'shareWorkoutData', 'On') = 'Friends' then 'friends'\n    when coalesce(new.data->>'profileVisibility', 'Public') = 'Just friends' then 'followers'",
      replace: "    when coalesce(new.data->>'profileVisibility', 'Public') = 'Just friends' then 'followers'\n    when coalesce(new.data->>'shareWorkoutData', 'On') = 'Friends' then 'friends'" },
    { name: 'trigger: Off leaves friends posts alone', file: SQL,
      find: "        and privacy in ('public', 'community', 'followers', 'friends');", replace: "        and privacy in ('public', 'community', 'followers');" },
    { name: 'trigger: Friends leaves followers posts alone', file: SQL,
      find: "    update public.community_posts set privacy = 'friends'\n      where author_id = new.user_id and source_provider is not null\n        and privacy in ('public', 'community', 'followers');",
      replace: "    update public.community_posts set privacy = 'friends'\n      where author_id = new.user_id and source_provider is not null\n        and privacy in ('public', 'community');" },
    { name: 'trigger: Friends never tightens history', file: SQL,
      find: "  elsif audience = 'friends' then\n    update public.community_posts set privacy = 'friends'",
      replace: "  elsif audience = 'never' then\n    update public.community_posts set privacy = 'friends'" },

    // ── the app's writers and readers ──
    { name: 'app: a friends post is saved as community', file: BACKEND,
      find: "|| clean === 'followers' || clean === 'friends') return clean;", replace: "|| clean === 'followers') return clean;" },
    { name: 'app: an edited friends post is relabelled Community', file: BACKEND,
      find: ": privacy === 'followers' ? 'Followers' : privacy === 'friends' ? 'Friends' : 'Community',", replace: ": privacy === 'followers' ? 'Followers' : 'Community'," },
    { name: 'app: an edited followers post is relabelled Community', file: BACKEND,
      find: ": privacy === 'followers' ? 'Followers' : privacy === 'friends'", replace: ": privacy === 'followers!' ? 'Followers' : privacy === 'friends'" },
    { name: 'app: Off leaves friends auto-posts alone', file: BACKEND,
      find: "newPrivacy === 'private' ? ['public', 'community', 'followers', 'friends']", replace: "newPrivacy === 'private' ? ['public', 'community', 'followers']" },
    { name: 'app: Friends never tightens auto-posts', file: BACKEND,
      find: "    : newPrivacy === 'friends' ? ['public', 'community', 'followers']\n", replace: '' },
    { name: 'app: a session shared with friends announces its PRs to the Wall', file: BACKEND,
      find: "if (resolvedPrivacy === 'public') announcePRsFromSetLogs(setLogs);", replace: "if (resolvedPrivacy !== 'private') announcePRsFromSetLogs(setLogs);" },
    { name: 'app: the composer opens a friends member on Profile', file: APP,
      find: "if (rule === 'private' || rule === 'friends') return 'private';", replace: "if (rule === 'private') return 'private';\n  if (rule === 'friends') return 'profile';" },
    { name: 'app: Post-a-PR calls Friends "off"', file: APP,
      find: "      if (share.privacy === 'friends') { setBusy(false);", replace: "      if (share.privacy === 'friends!') { setBusy(false);" },
    { name: 'app: the settings row offers two choices', file: APP,
      find: "    shareWorkoutData:  ['On', 'Friends', 'Off'],", replace: "    shareWorkoutData:  ['On', 'Off']," },
    { name: 'app: the session toggle says "the community" to a friends member', file: APP,
      find: "{shareAudience === 'friends' ? tr('session:player.shareToggleFriends') : tr('session:player.shareToggle')}", replace: "{tr('session:player.shareToggle')}" },
    { name: 'app: a draft\'s toggle is overwritten by the settings read', file: APP,
      find: 'if (draft?.shareToFeed == null) setShareToFeed(rule !== \'private\');', replace: "setShareToFeed(rule !== 'private');" },
    { name: 'app: an edit is seeded with the display label', file: APP,
      find: "const edTier = ed ? String(ed.privacy || 'public').toLowerCase() : null;", replace: "const edTier = ed ? String(ed.privacy || 'public') : null;" },
    { name: 'app: an edited friends post gets no rung', file: APP,
      find: "const BS_EDIT_ONLY_TIERS = { friends: 'Friends', followers: 'Followers', community: 'Community' };", replace: "const BS_EDIT_ONLY_TIERS = { followers: 'Followers', community: 'Community' };" },
    { name: 'app: the edit-only rung is never drawn', file: APP,
      find: ".concat(BS_EDIT_ONLY_TIERS[edTier] ? [[edTier, BS_EDIT_ONLY_TIERS[edTier]]] : [])", replace: ".concat([])" },
    { name: 'app: a friends post is described as "Only you"', file: APP,
      find: "              : vis === 'friends' ? tr('profile:log.vis.friendsDesc', { defaultValue: 'Shows to your friends: people you follow who follow you back' })\n", replace: '' },
    { name: 'feed: Following never shows friends posts', file: FEED_MODE,
      find: "    privacyIn: ['public', 'community', 'followers', 'friends'],", replace: "    privacyIn: ['public', 'community', 'followers']," },

    // ── the website ──
    { name: 'web: the post route saves friends as community', file: FEED_ROUTE,
      find: "|| value === 'followers' || value === 'friends') return value;", replace: "|| value === 'followers') return value;" },
    { name: 'web: the Following feed never shows friends posts', file: FEED_ROUTE,
      find: "    privacyIn = ['public', 'community', 'followers', 'friends'];", replace: "    privacyIn = ['public', 'community', 'followers'];" },
    { name: 'web: a profile reads a friends post as private', file: WEB_PROFILE,
      find: '["public", "community", "private", "profile", "followers", "friends"].includes(p)', replace: '["public", "community", "private", "profile", "followers"].includes(p)' },
    { name: 'web: a profile never asks for friends posts', file: WEB_PROFILE,
      find: 'fq.in("privacy", ["public", "profile", "followers", "friends"])', replace: 'fq.in("privacy", ["public", "profile", "followers"])' },
    { name: 'web: a profile hides a friends post', file: WEB_SHARED,
      find: ' || vis === "followers" || vis === "friends"); }', replace: ' || vis === "followers"); }' },
    { name: 'web: settings refuse Friends', file: WEB_SETTINGS,
      find: "if(key==='shareWorkoutData') return ['On','Friends','Off'];", replace: "if(key==='shareWorkoutData') return ['On','Off'];" },
  ],
};
