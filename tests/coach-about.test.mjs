// A coach's About me (owner, 2026-10-31: "also need to include section on coaches profiles for socials
// to list", "also lets add an about page for each coach where they can write a bio about themselves
// and include more information", "have the tab say about me"). The doc keys it keeps, as the one
// normalizer every surface shares cleans them (public/newdesign/profileCustom.mjs), and its words in
// all 13 languages. The page and the editor are driven in tests/trainer-profile.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bsProfileAbout, bsProfileLinks, bsProfileLinkable, bsProfilePrompts, bsProfileLinkHref, bsProfileLinkText, bsCleanStory, bsNormalizeProfileCustom,
  BS_ABOUT_STORY_MAX, BS_PROMPTS_MAX, BS_PROMPT_A_MAX, BS_ABOUT_LIST_MAX, BS_ABOUT_ITEM_MAX, bsAboutItems, BS_PROFILE_LINK_KEYS, BS_PROFILE_LINK_GLYPHS,
} from '../mobile-app/src/services/profileCustom.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { IntlMessageFormat } = createRequire(import.meta.url)('intl-messageformat');

test('the story keeps its paragraphs; the facts are what they say, or left out', () => {
  assert.equal(bsCleanStory('One.\r\n\r\n\r\n\r\nTwo.  \nThree.\u0007 ', 100), 'One.\n\nTwo.\nThree.');
  assert.equal(bsCleanStory('x'.repeat(BS_ABOUT_STORY_MAX + 50), BS_ABOUT_STORY_MAX).length, BS_ABOUT_STORY_MAX);
  assert.deepEqual(bsProfileAbout({ story: ' Hi ', years: 8, how: 'both', where: ' Brooklyn ', languages: 'English', extra: 'dropped' }), { story: 'Hi', years: 8, how: 'both', where: 'Brooklyn', languages: 'English' });
  assert.deepEqual(bsProfileAbout({ years: '12' }), { years: 12 }, 'a typed number');
  for (const years of [0, 61, 2.5, 'eight', -3]) assert.equal(bsProfileAbout({ years }), null, `years ${years}`);
  assert.equal(bsProfileAbout({ how: 'sometimes' }), null);
  assert.equal(bsProfileAbout({ story: '   ' }), null, 'nothing in it, no key');
  assert.equal(bsProfileAbout(['story']), null);
});

// Owner, 2026-11-03: "the about me should have more things to add. certificates, accolades, things like
// that". Accolades and education and training are the coach's own lists; certificates are the ones Shape
// verified (get_coach_certs), never a list the coach types.
test('accolades and education: a title each, a detail and a year if given, eight at most, in order', () => {
  const next = new Date().getFullYear() + 1;
  assert.deepEqual(bsAboutItems([
    { title: ' Coach of the Year ', detail: ' Brooklyn Fitness Awards ', year: '2024', extra: 'dropped' },
    { title: '', detail: 'no title' }, null, 'text', ['x'],
    { title: 'Featured', year: 1949 }, { title: 'Next year', year: next }, { title: 'Too far', year: next + 1 }, { title: 'Half', year: 2020.5 },
  ]), [
    { title: 'Coach of the Year', detail: 'Brooklyn Fitness Awards', year: 2024 },
    { title: 'Featured' }, { title: 'Next year', year: next }, { title: 'Too far' }, { title: 'Half' },
  ]);
  assert.equal(bsAboutItems(Array.from({ length: 12 }, (_, i) => ({ title: `A${i}` }))).length, BS_ABOUT_LIST_MAX);
  assert.equal(bsAboutItems([{ title: 'x'.repeat(BS_ABOUT_ITEM_MAX + 9) }])[0].title.length, BS_ABOUT_ITEM_MAX);
  assert.deepEqual(bsAboutItems('nope'), []);
  // In the About doc: kept after the facts, dropped when empty, and the cleaned doc cleans to itself (Nora's
  // account setup refuses a write the cleaner would reshape).
  const about = bsProfileAbout({ story: 'Hi', accolades: [{ title: 'A' }], education: [], certs: ['typed'] });
  assert.deepEqual(about, { story: 'Hi', accolades: [{ title: 'A' }] }, 'no certificates the coach typed, no empty list');
  assert.deepEqual(bsProfileAbout(about), about);
  assert.deepEqual(bsProfileAbout({ education: [{ title: 'BSc' }] }), { education: [{ title: 'BSc' }] }, 'a list alone is an About');
  assert.equal(bsProfileAbout({ accolades: [{ detail: 'no title' }] }), null);
});

// Owner, 2026-11-03: "coaches socials should be shown somewhere in this section if they choose to".
test('the socials in the head: the coach\'s choice kept only as true, a glyph for every network', () => {
  assert.deepEqual(bsNormalizeProfileCustom({ headLinks: true, links: { instagram: '@maya' } }, null), { headLinks: true, links: { instagram: '@maya' } });
  for (const v of [false, 'yes', 1, null, {}]) assert.ok(!('headLinks' in bsNormalizeProfileCustom({ headLinks: v }, null)), `headLinks ${JSON.stringify(v)} kept`);
  assert.deepEqual(Object.keys(BS_PROFILE_LINK_GLYPHS).sort(), [...BS_PROFILE_LINK_KEYS].sort(), 'a network with no glyph, or a glyph with no network');
  for (const k of BS_PROFILE_LINK_KEYS) for (const d of BS_PROFILE_LINK_GLYPHS[k]) assert.match(d, /^M[\d.\s,a-zA-Z-]+$/, `${k}: not SVG path data`);
});

test('socials: the known networks, a handle or a web address, never another scheme', () => {
  assert.deepEqual(bsProfileLinks({ instagram: ' @maya ', x: 'https://x.com/maya', website: 'javascript:alert(1)', tiktok: 'two words', substack: 'data:text/html,x', myspace: 'maya' }),
    { instagram: '@maya', x: 'https://x.com/maya' });
  assert.equal(bsProfileLinks({ website: 'mailto:a@b.c' }), null);
  // Stored as written (the member editor saves through this and says nothing), drawn only when the
  // page can link it (Codex P2 on #2540).
  const odd = { website: 'https://?x', x: 'https://', instagram: '@', youtube: 'https://youtube.com/@maya' };
  assert.deepEqual(bsProfileLinks(odd), odd);
  assert.deepEqual(bsProfileLinkable(odd), { youtube: 'https://youtube.com/@maya' }, 'only what the page can link is drawn');
  assert.equal(bsProfileLinkable({ website: 'https://' }), null);
  // A long address is kept whole, never cut to a different one (Codex P2 on #2540).
  const long = 'https://example.com/' + 'a'.repeat(400) + '?utm_source=profile';
  assert.equal(bsProfileLinks({ website: long }).website, long);
  assert.equal(bsProfileLinkHref('website', long), long);
  assert.equal(bsProfileLinks('maya'), null);
  const cases = [
    ['instagram', '@maya.lifts', 'https://instagram.com/maya.lifts', '@maya.lifts'],
    ['x', 'x.com/maya', 'https://x.com/maya', 'x.com/maya'],
    ['tiktok', 'maya', 'https://tiktok.com/@maya', '@maya'],
    ['youtube', '@maya', 'https://youtube.com/@maya', '@maya'],
    ['substack', 'maya', 'https://substack.com/@maya', '@maya'],
    ['website', 'mayaokafor.com', 'https://mayaokafor.com', 'mayaokafor.com'],
    ['website', 'https://www.mayaokafor.com/', 'https://www.mayaokafor.com/', 'mayaokafor.com'],
    ['website', 'javascript:alert(1)', null, ''],
    ['instagram', 'JaVaScRiPt:alert(1)', null, ''],
    // An address with no host, or no dot in it, and an empty handle (Codex P2 on #2540).
    ['website', 'https://', null, ''],
    ['website', 'https://?x', null, ''],
    ['website', 'mysite', null, ''],
    ['instagram', '@', null, ''],
  ];
  for (const [k, v, href, text] of cases) {
    assert.equal(bsProfileLinkHref(k, v), href, `${k} ${v}`);
    assert.equal(bsProfileLinkText(k, v), text, `${k} ${v} reads`);
  }
  assert.equal(bsProfileLinkHref('myspace', 'maya'), null);
});

test('questions and answers: four at most, both halves, a coach\'s answer up to 280', () => {
  const long = 'a'.repeat(BS_PROMPT_A_MAX + 40);
  const out = bsProfilePrompts([{ q: 'philosophy', a: 'Strong first.' }, { q: '', a: 'no question' }, { q: 'approach', a: '  ' }, null, 'x',
    { q: 'first_session', a: long }, { q: 'client_win', a: 'One.' }, { q: 'approach', a: 'Two.' }, { q: 'wont_program', a: 'Five.' }]);
  assert.equal(out.length, BS_PROMPTS_MAX);
  assert.deepEqual(out.map((p) => p.q), ['philosophy', 'first_session', 'client_win', 'approach']);
  assert.equal(out[1].a.length, BS_PROMPT_A_MAX);
  // A member's own older question, written by hand, is kept as written.
  assert.deepEqual(bsProfilePrompts([{ q: 'My go-to snack', a: 'Apples.' }]), [{ q: 'My go-to snack', a: 'Apples.' }]);
});

test('the doc: About me\'s keys cleaned, dropped when empty, every other key as it was', () => {
  const doc = bsNormalizeProfileCustom({
    about: { story: 'Hi', years: 0 }, links: { website: 'javascript:x' }, prompts: [{ q: 'philosophy', a: '' }],
    song: { url: 'https://open.spotify.com/track/1' }, accent: '#34d6c5',
  }, null);
  assert.deepEqual(doc, { about: { story: 'Hi' }, song: { url: 'https://open.spotify.com/track/1' }, accent: '#34d6c5' });
  // A doc without the keys gains none.
  assert.deepEqual(bsNormalizeProfileCustom({ bio: 'x' }, null), { bio: 'x' });
});

test("About me's words in all 13 languages, each one formatting", () => {
  const dir = join(ROOT, 'mobile-app/src/i18n/catalogs');
  const keys = ['trainer.tabAbout', 'about.title', 'about.years', 'about.howOnline', 'about.howInPerson', 'about.howBoth', 'about.languages', 'about.qa', 'about.socials', 'about.emptySelf', 'about.write', 'about.edit',
    'mine.tabAbout', 'mine.aboutTitle', 'mine.aboutSub', 'mine.story', 'mine.storyPh', 'mine.details', 'mine.years', 'mine.how', 'mine.howOnline', 'mine.howInPerson', 'mine.howBoth',
    'mine.where', 'mine.wherePh', 'mine.languages', 'mine.languagesPh', 'mine.qa', 'mine.qaQuestion', 'mine.qaAnswer', 'mine.qaAdd', 'mine.qaRemove', 'mine.socials', 'mine.errLink', 'mine.errYears',
    'about.certs', 'about.certVerified', 'about.accolades', 'about.education', 'mine.accolades', 'mine.accoladePh', 'mine.accoladeFromPh', 'mine.accoladeAdd',
    'mine.education', 'mine.educationPh', 'mine.educationFromPh', 'mine.educationAdd', 'mine.certsNote', 'mine.itemTitle', 'mine.itemDetail', 'mine.itemYear', 'mine.errItemTitle', 'mine.errItemYear', 'mine.socialsInHead'];
  const locales = readdirSync(dir);
  assert.equal(locales.length, 13);
  for (const l of locales) {
    const cat = JSON.parse(readFileSync(join(dir, l, 'profile.json'), 'utf8'));
    for (const k of keys) {
      assert.ok(cat[k], `${l} has no profile:${k}`);
      const out = new IntlMessageFormat(cat[k], l === 'pt-BR' ? 'pt' : l).format({ name: 'Ana', count: 3, languages: 'X', n: 2, network: 'X', max: 60, min: 1950 });
      assert.ok(String(out).trim(), `${l} ${k} formats to nothing`);
    }
  }
  const en = JSON.parse(readFileSync(join(dir, 'en', 'profile.json'), 'utf8'));
  assert.equal(en['trainer.tabAbout'], 'About me', 'the owner: "have the tab say about me"');
  assert.equal(en['mine.tabAbout'], 'About me');
});
