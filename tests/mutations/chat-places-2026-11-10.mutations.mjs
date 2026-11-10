// Mutation spec for the chat bubble matching the app's Chat places (owner, 2026-11-10:
// "just have it match the app, referring to whats available on the chat page", then
// "make sure the feeds are showing the same. Updating correctly"). Each mutation breaks
// one clause of the filing rule, the write side, the refresh, or the saved-thread
// migration; every one must be killed. Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/chat-places-2026-11-10.mutations.mjs --fail-on-skipped
const FEED = 'public/newdesign/communityFeed.jsx';
const WIDGET = 'public/newdesign/chatWidget.jsx';

export default {
  test: 'node --test tests/chat-feed-tab.test.mjs tests/community-wall-plate.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // ── where a post is shown ──
    { name: 'Community shows every channel', file: FEED,
      find: '  if (place === "community") return ch === "SHAPE" && !!p.body;',
      replace: '  if (place === "community") return !!p.body;' },
    { name: 'the role place shows the whole scope, Community included', file: FEED,
      find: '  if (place === "role") return ch === cfRoleChannel(role) && !!p.body;',
      replace: '  if (place === "role") return scope.indexOf(ch) >= 0 && !!p.body;' },
    { name: 'the Wall takes a photo from another role\'s room', file: FEED,
      find: '  return cfIsWallCard(p) && (explicit === "" || scope.indexOf(explicit) >= 0);',
      replace: '  return cfIsWallCard(p);' },
    { name: 'the Wall drops an activity with no channel (an auto-post)', file: FEED,
      find: '  return cfIsWallCard(p) && (explicit === "" || scope.indexOf(explicit) >= 0);',
      replace: '  return cfIsWallCard(p) && scope.indexOf(explicit) >= 0;' },
    { name: 'a repost is a Wall card', file: FEED,
      find: '  return !!((p.photo || p.video) && !p.repost);',
      replace: '  return !!(p.photo || p.video);' },
    { name: 'a web Wall post without media leaves the Wall', file: FEED,
      find: '  if (explicit === "COMMUNITY") return true;\n',
      replace: '' },
    { name: 'a trainer\'s role channel is the client one', file: FEED,
      find: '  return r === "trainer" ? "TRAINER" : r === "nutritionist" ? "NUTRI" : "CLIENT";',
      replace: '  return r === "nutritionist" ? "NUTRI" : "CLIENT";' },
    // ⚠ A PROVEN NO-OP, KEPT AS A SECOND WALL: `cfInPlace` already confines Community to
    // SHAPE and the role place to the viewer's own channel, both inside `cfFeedScope`, so
    // the visible filter's own scope line cannot change what renders. It stays so that a
    // later loosening of `cfInPlace` does not open the peer rooms by itself.
    { name: 'the visible filter drops its own scope line', file: FEED, expectSurvive: true,
      find: '              if (place !== "wall" && scope.indexOf(cfChannelOf(p)) < 0) return false;\n',
      replace: '' },
    // ── where a post made here is filed ──
    { name: 'a Community post is filed on the Wall', file: FEED,
      find: '  if (place === "community") return "SHAPE";',
      replace: '  if (place === "community") return CF_POST_CHANNEL;' },
    { name: 'the composer ignores its place', file: FEED,
      find: '  const postChannel = cfPlaceChannel(place, myRole);',
      replace: '  const postChannel = cfPlaceChannel("wall", myRole);' },
    // ── what is read, and keeping up ──
    { name: 'the sample is shown beside live posts', file: FEED,
      find: '      const sample = !signedIn && live.length === 0;',
      replace: '      const sample = !signedIn;' },
    { name: 'a failed first read blocks every retry', file: FEED,
      find: '      loadedRef.current = ok || !signedIn;',
      replace: '      loadedRef.current = true;' },
    { name: 'a re-read drops a post still on its way', file: FEED,
      find: '      setFeed((prev) => prev.filter((x) => x && x.pending).concat(sample ? DEMO_FEED : live));',
      replace: '      setFeed(sample ? DEMO_FEED : live);' },
    { name: 'the feed is read once per open', file: FEED,
      find: '  }, [feedMode, refreshNonce]);',
      replace: '  }, [feedMode]);' },
    { name: 'your like is never read', file: FEED,
      find: '        likedByMe: !!(uid && Array.isArray(p.likes) && p.likes.some((l) => l && l.user_id === uid)),',
      replace: '        likedByMe: false,' },
    { name: 'the card is a new component every render', file: FEED,
      find: '  const CfFeedCard = cardTypeRef.current || (cardTypeRef.current = FeedItem);',
      replace: '  const CfFeedCard = FeedItem;' },
    // ── the saved threads ──
    { name: 'the saved record no longer names its tabs', file: WIDGET,
      find: 'JSON.stringify({ threadsByTab, activeByTab, tabIds: tabs.map((t) => t.id) })',
      replace: 'JSON.stringify({ threadsByTab, activeByTab })' },
    { name: 'a record is read back by position', file: WIDGET,
      find: 'const at = ids.indexOf(t.id); return at >= 0 ? arr[at] : fresh(t, i);',
      replace: 'const at = i; return at < arr.length ? arr[at] : fresh(t, i);' },
    { name: 'a member\'s pre-places record is read as a visitor\'s', file: WIDGET,
      find: '  if (n === one.length + 1) return ["feed"].concat(one);',
      replace: '  if (n === one.length + 1) return ["feed"].concat(all.slice(0, 5));' },
  ],
};
