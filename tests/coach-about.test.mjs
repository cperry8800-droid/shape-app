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
  bsProfileAbout, bsProfileLinks, bsProfilePrompts, bsProfileLinkHref, bsProfileLinkText, bsCleanStory, bsNormalizeProfileCustom,
  BS_ABOUT_STORY_MAX, BS_PROMPTS_MAX, BS_PROMPT_A_MAX,
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

test('socials: the known networks, a handle or a web address, never another scheme', () => {
  assert.deepEqual(bsProfileLinks({ instagram: ' @maya ', x: 'https://x.com/maya', website: 'javascript:alert(1)', tiktok: 'two words', substack: 'data:text/html,x', myspace: 'maya' }),
    { instagram: '@maya', x: 'https://x.com/maya' });
  assert.equal(bsProfileLinks({ website: 'mailto:a@b.c' }), null);
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
    'mine.where', 'mine.wherePh', 'mine.languages', 'mine.languagesPh', 'mine.qa', 'mine.qaQuestion', 'mine.qaAnswer', 'mine.qaAdd', 'mine.qaRemove', 'mine.socials', 'mine.errLink'];
  const locales = readdirSync(dir);
  assert.equal(locales.length, 13);
  for (const l of locales) {
    const cat = JSON.parse(readFileSync(join(dir, l, 'profile.json'), 'utf8'));
    for (const k of keys) {
      assert.ok(cat[k], `${l} has no profile:${k}`);
      const out = new IntlMessageFormat(cat[k], l === 'pt-BR' ? 'pt' : l).format({ name: 'Ana', count: 3, languages: 'X', n: 2, network: 'X' });
      assert.ok(String(out).trim(), `${l} ${k} formats to nothing`);
    }
  }
  const en = JSON.parse(readFileSync(join(dir, 'en', 'profile.json'), 'utf8'));
  assert.equal(en['trainer.tabAbout'], 'About me', 'the owner: "have the tab say about me"');
  assert.equal(en['mine.tabAbout'], 'About me');
});
