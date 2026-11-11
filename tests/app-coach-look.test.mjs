// tests/app-coach-look.test.mjs
//
// Owner, 2026-11-11: "make the coach cards look the same also on marketplace on app", after #2706 painted the
// website's coach page and its Coaches card with the paper, accent and climb background a coach picks. The app
// takes the same colours, from the same kit (coachProfileKit.mjs bsCoachPagePalette, through
// mobile-app/src/services/coachPagePalette.mjs):
//   · bsClimbTheme (BSCoachClimb.jsx): the coach page's theme, the Climb as it was with no pick;
//   · bsCoachCardLook (services/coachCardLook.mjs): a card's look from the coach's public card;
//   · the Coaches tab reads each live coach's public card and draws their row and pick in that look.
// The page itself is driven in tests/trainer-profile.test.mjs and tests/coach-climb.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join } from 'node:path';
import { drive, textOf, SHIM, ROOT } from './helpers/broadsheet-mount.mjs';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { bsCoachPagePalette, bsClimbWash } from '../mobile-app/src/services/coachPagePalette.mjs';
import { bsCoachCardLook, bsClimbCardPalette, BS_CARD_FOCUS } from '../mobile-app/src/services/coachCardLook.mjs';
import * as kit from '../public/newdesign/coachProfileKit.mjs';
import { BS_SUPABASE_HOST } from '../public/newdesign/listingMedia.mjs';

const OWNER = '11111111-2222-4333-8444-555555555555';
const MEDIA = `https://${BS_SUPABASE_HOST}/storage/v1/object/public/community-photos/${OWNER}/cover-1.jpg`;

test('the app imports the website\'s kit, value for value', () => {
  assert.equal(bsCoachPagePalette, kit.bsCoachPagePalette);
  assert.equal(bsClimbWash, kit.bsClimbWash);
});

test("a card's look: the coach's palette, wash and own cover at its spot; none for a private card or no pick", () => {
  const custom = { look: { paper: 'bone', accent: 'blue', pos: { x: 40, y: 30 } }, climbBg: 'dusk', cover: { image: MEDIA } };
  const look = bsCoachCardLook({ can_view: true, custom }, 'trainer', OWNER);
  assert.deepEqual(look.pal, bsCoachPagePalette({ paper: 'bone', accent: 'blue', pos: { x: 40, y: 30 } }, 'trainer'));
  assert.equal(look.picked, true);
  assert.equal(look.wash, bsClimbWash('dusk'));
  assert.equal(look.cover, MEDIA);
  assert.equal(look.coverPos, '40% 30%', 'the dragged spot');
  // A stop alone.
  assert.equal(bsCoachCardLook({ can_view: true, custom: { look: { focus: 'top' }, cover: { image: MEDIA } } }, 'trainer', OWNER).coverPos, BS_CARD_FOCUS.top);
  // A wash or a cover with no colours: the Climb's dark card in the role's colours.
  const washOnly = bsCoachCardLook({ can_view: true, custom: { climbBg: 'ember' } }, 'nutritionist', OWNER);
  assert.equal(washOnly.picked, false);
  assert.deepEqual(washOnly.pal, bsClimbCardPalette('nutritionist'));
  assert.equal(washOnly.pal.ACCENT, '#d8a23a');
  // None: no row, a private card, no doc, no account, nothing set, the editors' seed, a bad wash key, another
  // account's photo.
  for (const [row, why] of [
    [null, 'no row'], [{ can_view: false, custom }, 'a private card'], [{ can_view: true, custom: null }, 'no doc'],
    [{ can_view: true, custom: {} }, 'nothing set'], [{ can_view: true, custom: { look: { paper: 'dark', accent: 'teal' } } }, "the editors' seed"],
    [{ can_view: true, custom: { climbBg: '__proto__' } }, 'a bad wash key'],
    [{ can_view: true, custom: { cover: { image: MEDIA.replace(OWNER, '99999999-2222-4333-8444-555555555555') } } }, "another account's photo"],
  ]) assert.equal(bsCoachCardLook(row, 'trainer', OWNER), null, why);
  assert.equal(bsCoachCardLook({ can_view: true, custom }, 'trainer', null), null, 'a listing with no account');
});

test('the Climb card palette reads at 4.5:1 for every word on its ground', () => {
  for (const role of ['trainer', 'nutritionist']) {
    const P = bsClimbCardPalette(role);
    for (const k of ['INK', 'INK_SOFT', 'INK_MUTED', 'ACCENT', 'CTA_TEXT']) {
      for (const g of [P.BG, P.PAPER, P.DEEP]) assert.ok(kit.bsContrast(P[k], g) >= 4.5, `${role} ${k} on ${g}`);
    }
  }
});

// ── The coach page's theme ──────────────────────────────────────────────────────────────────
const climb = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSCoachClimb.jsx'), { appendExports: '' }).catch(() => null);

test("the Climb's theme: as it was with no pick; the coach's palette, its role colours and the wash with one", { skip: !climb }, () => {
  const { bsClimbTheme, CLIMB } = climb;
  const none = bsClimbTheme(null);
  assert.equal(none.BG, CLIMB.BG); assert.equal(none.GROUND, CLIMB.BG); assert.equal(none.INK, CLIMB.INK);
  assert.equal(none.accFor(false), CLIMB.TEAL); assert.equal(none.accFor(true), CLIMB.GOLD);
  assert.equal(none.ctaFor(false), CLIMB.RUST); assert.equal(none.picked, false);
  assert.equal(bsClimbTheme(null, bsClimbWash('dusk')).GROUND, `${bsClimbWash('dusk')}, ${CLIMB.BG}`, 'a wash alone, on the Climb');
  const P = bsCoachPagePalette({ paper: 'sage', accent: 'violet' }, 'nutritionist');
  const th = bsClimbTheme(P, bsClimbWash('alpine'));
  assert.equal(th.picked, true); assert.equal(th.isLight, true);
  assert.equal(th.BG, P.BG); assert.equal(th.INK, P.INK); assert.equal(th.MUTED, P.INK_SOFT); assert.equal(th.DIM, P.INK_MUTED);
  assert.equal(th.accFor(true), P.ACCENT); assert.equal(th.ctaFor(true), P.CTA); assert.equal(th.onCtaFor(true), P.ON_CTA);
  assert.equal(th.DRAW, P.DRAW); assert.equal(th.HEAD, P.HEAD);
  assert.equal(th.GROUND, `${bsClimbWash('alpine')}, ${P.BG}`);
  // A junk palette is no pick.
  assert.equal(bsClimbTheme({ nope: 1 }).picked, false);
});

test('the coach page provides the theme from the doc, and keeps the Climb on a private card', () => {
  const src = fs.readFileSync(join(ROOT, 'mobile-app/src/broadsheet/BSTrainerProfile.jsx'), 'utf8');
  assert.match(src, /const pick = !lockedCard && custom \? bsProfileLook\(custom\.look\) : null;/);
  assert.match(src, /const theme = bsClimbTheme\(pagePal, !lockedCard && custom \? bsClimbWash\(custom\.climbBg\) : null\);/);
  assert.match(src, /<BSClimbThemeProvider value=\{theme\}>\{page\}<\/BSClimbThemeProvider>/);
  assert.match(src, /paperMode=\{pagePal \? \(pagePal\.paperKey \|\| 'dark'\) : 'dark'\}/, "the camps' plates and the masthead take the paper too");
  // Every piece of the Climb paints with the theme it is given.
  const cl = fs.readFileSync(join(ROOT, 'mobile-app/src/broadsheet/BSCoachClimb.jsx'), 'utf8');
  const comps = [...cl.matchAll(/^(?:export )?function ([A-Z]\w*)\(/gm)].map((m) => m[1]).filter((n) => n !== 'BSClimbThemeProvider');
  for (const name of comps) {
    const at = cl.search(new RegExp(`^(?:export )?function ${name}\\(`, 'm'));
    const head = cl.slice(at, cl.indexOf('\n  const { numFace, mono, plateBox } = climbType(CLIMB);', at));
    assert.match(head, /\n  const CLIMB = useClimb\(\);$/, `${name} paints with the Climb's fixed colours`);
  }
  assert.doesNotMatch(cl, /rgba\(10,14,17|rgba\(14,20,25/, 'a fixed dark fill is left');
});

test('the Coaches tab reads each live coach\'s public card and hands the look to their row and pick', () => {
  const m = fs.readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetMarketplace.jsx'), 'utf8');
  assert.match(m, /import \{ bsCoachCardLook \} from '\.\.\/services\/coachCardLook\.mjs';/);
  assert.match(m, /filter\(\(c\) => !bsmIsDemoCoach\(c\)\)\.map\(\(c\) => c\.provider_user_id\)/, 'samples read nothing');
  assert.match(m, /window\.ShapeProfiles\.getPublicProfile\(id\)/);
  assert.match(m, /Array\.from\(\{ length: Math\.min\(6, ids\.length\) \}, one\)/, 'six at a time');
  assert.match(m, /look: c\.provider_user_id && !bsmIsDemoCoach\(c\) \? bsCoachCardLook\(cardByUser\[c\.provider_user_id\]/);
});

// ── The row and the pick, drawn ────────────────────────────────────────────────────────────
const REG = () => ({ registry: new Map([['react', SHIM], ['react-dom', { createPortal: (n) => n }]]) });
const dir = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSMarketDirectory.jsx'), { ...REG(), appendExports: 'exports.MktDirRow = MktDirRow; exports.MktDirPick = MktDirPick;' }).catch(() => null);
const cssList = (v) => String(v || '');

test("a coach's row and pick take their look: the paper under a scrim over their cover, the wash, the ink and the accent", { skip: !dir }, () => {
  const look = bsCoachCardLook({ can_view: true, custom: { look: { paper: 'bone', accent: 'blue', pos: { x: 40, y: 30 } }, climbBg: 'dusk', cover: { image: MEDIA } } }, 'trainer', OWNER);
  const card = { key: 'c1', n: 1, name: 'Maya Okafor', nutri: false, verified: true, example: false, spec: ['Strength'], score: 9.1, price: null, next: { text: 'Tomorrow 9:00', full: false }, atCapacity: false, photo: null, look, onOpen() {}, onIntro() {} };
  const row = drive(dir.MktDirRow, { card, first: true });
  const root = row.nodes().find((n) => n.props && n.props['data-mkt-row'] === '');
  assert.equal(root.props['data-mkt-look'], 'bone');
  const bg = cssList(root.props.style.background);
  assert.ok(bg.startsWith(bsClimbWash('dusk')), 'the wash on top');
  assert.ok(bg.includes(`url("${MEDIA}") 40% 30% / cover`), 'the cover at its dragged spot');
  assert.ok(bg.endsWith(look.pal.BG), 'over the paper');
  const name = row.nodes().find((n) => n.type === 'span' && textOf(n) === 'Maya Okafor' && n.props.style && n.props.style.fontSize === 15.5);
  assert.equal(name.props.style.color, look.pal.INK);
  assert.equal(row.nodes().find((n) => n.props && n.props['data-mkt-verified'] === '').props.style.color, look.pal.ACCENT);
  assert.equal(row.nodes().find((n) => n.props && n.props['data-mkt-spec'] === '').props.style.color, look.pal.CTA_TEXT, "the role's colour at its readable step");
  const pick = drive(dir.MktDirPick, { card });
  const btn = pick.nodes().find((n) => n.props && n.props['data-mkt-pick'] === '');
  assert.equal(btn.props['data-mkt-look'], 'bone');
  assert.ok(cssList(btn.props.style.background).endsWith(look.pal.BG));
  // A dark stock is the card's paper itself, and steel keeps its sheen, as the website's card (Codex on #2708).
  for (const paper of ['forest', 'steel']) {
    const lk = bsCoachCardLook({ can_view: true, custom: { look: { paper, accent: 'rose' } } }, 'trainer', OWNER);
    const r = drive(dir.MktDirRow, { card: { ...card, look: lk }, first: true }).nodes().find((n) => n.props && n.props['data-mkt-row'] === '');
    const bg = cssList(r.props.style.background);
    assert.ok(bg.endsWith(lk.pal.PAPER), `${paper}: the paper, not its deeper surface`);
    if (paper === 'steel') assert.ok(lk.pal.PAPER_SHEEN && bg.includes(lk.pal.PAPER_SHEEN), 'the sheen');
  }
  // No look: the directory's own row and pick.
  const plain = drive(dir.MktDirRow, { card: { ...card, look: null }, first: true }).nodes().find((n) => n.props && n.props['data-mkt-row'] === '');
  assert.equal(plain.props['data-mkt-look'], undefined);
  assert.equal(plain.props.style.background, undefined);
});
