// Mutation spec for the profile cover guard on the older surfaces (Codex P1 on #2484, carried to
// the app's Terrain and Signal heroes, the website's living profile hero, both old editors' cover
// uploads, and the website marketplace card). Every mutation must be killed.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/profile-cover-guard-2026-10-28.mutations.mjs --fail-on-skipped
const APP = 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx';
const WEB = 'public/newdesign/livingDesktop.jsx';
const MKT = 'public/newdesign/marketplace.jsx';

const MEMBER_HERO = 'const heroCover = demoFill ? BS_DEMO_MEMBER_COVER : ((bsProfileCover(customEff && customEff.cover, feedAuthorId) || {}).image || null);';
const COACH_GUARD = ': ((bsProfileCover(customEff && customEff.cover, sigFeedAuthorId) || {}).image || null);';

export default {
  test: 'node --test tests/profile-cover-app.test.mjs tests/profile-cover-web.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // ── the app's member hero ──
    { name: 'member hero: the doc cover is drawn raw', file: APP,
      find: MEMBER_HERO, replace: 'const heroCover = demoFill ? BS_DEMO_MEMBER_COVER : ((customEff && customEff.cover && customEff.cover.image) || null);' },
    { name: 'member hero: the guard is bound to the viewer', file: APP,
      find: MEMBER_HERO, replace: MEMBER_HERO.replace('feedAuthorId)', 'myId)') },
    { name: 'member hero: any ownerless page takes the doc cover as a demo', file: APP,
      find: MEMBER_HERO, replace: 'const heroCover = !feedAuthorId ? ((customEff && customEff.cover && customEff.cover.image) || null) : ((bsProfileCover(customEff && customEff.cover, feedAuthorId) || {}).image || null);' },
    { name: 'member hero: the preview persona loses its demo cover', file: APP,
      find: MEMBER_HERO, replace: MEMBER_HERO.replace('demoFill ? BS_DEMO_MEMBER_COVER : ', '') },
    // ── the app's coach hero ──
    { name: 'coach hero: the doc cover is drawn raw', file: APP,
      find: COACH_GUARD, replace: ': ((customEff && customEff.cover && customEff.cover.image) || null);' },
    { name: 'coach hero: the guard is bound to the viewer', file: APP,
      find: COACH_GUARD, replace: COACH_GUARD.replace('sigFeedAuthorId)', 'sigMyId)') },
    { name: 'coach hero: any ownerless page shows a demo cover', file: APP,
      find: '  const coverImage = demoFill\n', replace: '  const coverImage = !sigFeedAuthorId\n' },
    { name: 'coach hero: the preview persona loses its demo cover', file: APP,
      find: '  const coverImage = demoFill\n', replace: '  const coverImage = false\n' },
    // ── the app's old editor ──
    { name: 'app editor: a cover of any type is uploaded', file: APP,
      find: "    if (!/^image\\/(jpe?g|png|webp|gif|heic|heif)$/i.test(file.type || '')) { window.__bsToast?.(tr('profile:editor.err.imageType', { defaultValue: 'Pick a JPG, PNG, WebP, GIF, HEIC or HEIF image.' }), 'err'); return; }\n    setCoverBusy(true);",
      replace: '    setCoverBusy(true);' },
    // ── the website's living profile hero ──
    { name: 'website hero: the doc cover is drawn raw', file: WEB,
      find: '  const cover = coverOk ? coverOk.image : null;', replace: '  const cover = d.custom && d.custom.cover && d.custom.cover.image;' },
    { name: 'website hero: no guard loaded draws the doc cover', file: WEB,
      find: 'coverLib.bsProfileCover(d.custom && d.custom.cover, d.uid) : null;', replace: 'coverLib.bsProfileCover(d.custom && d.custom.cover, d.uid) : (d.custom && d.custom.cover) || null;' },
    // ── the website's old editor ──
    { name: 'website editor: a cover of any type is uploaded', file: WEB,
      find: '    if (!ext) { alert("Pick a JPG, PNG, WebP, GIF, HEIC or HEIF image."); return; }\n    setCoverBusy(true);', replace: '    setCoverBusy(true);' },
    { name: 'website editor: the cover is named from the raw MIME type', file: WEB,
      find: '    const ext = dkWallExt(file);\n    if (!ext) { alert("Pick a JPG, PNG, WebP, GIF, HEIC or HEIF image."); return; }\n    setCoverBusy(true);',
      replace: '    const ext = (((file && file.type && file.type.split("/")[1]) || "jpg").replace(/[^a-z0-9]/gi, "") || "jpg");\n    setCoverBusy(true);' },
    // ── the website marketplace card ──
    { name: 'marketplace card: a stray coverImage is painted', file: MKT,
      find: "        {c.cover && (<>\n          <div aria-hidden style={{ position: \"absolute\", inset: 0, backgroundImage: `url('${c.cover}')`",
      replace: "        {(c.cover || c.coverImage) && (<>\n          <div aria-hidden style={{ position: \"absolute\", inset: 0, backgroundImage: `url('${c.cover || c.coverImage}')`" },
    { name: 'marketplace card: a live coach takes the raw listing cover', file: MKT,
      find: '    cover: (media && media.cover) || "",', replace: '    cover: (row.listing_media && row.listing_media.cover) || "",' },
  ],
};
