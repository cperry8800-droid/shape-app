// "Don't climb alone." and under it "Join the Community" (owner, 2026-11-03: "have the splash page
// say "dont climb alone" and then below it "Join the Community"", "on both app and website"): the
// app's launch beat and the hold after it say both lines under the mark, in the app's 13
// languages, and the website's splash says the same words.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const MAIN = read('mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx');
const LOCALES = ['en', 'es', 'pt-BR', 'fr', 'de', 'it', 'ru', 'uk', 'tr', 'vi', 'id', 'ha', 'pcm'];
const fnBody = (src, name) => {
  const at = src.indexOf(`function ${name}(`);
  assert.ok(at >= 0, `${name} is gone`);
  return src.slice(at, src.indexOf('\n}\n', at));
};

test('the app: both lines under the mark, the first above the second, on the beat and on the hold', () => {
  const tag = fnBody(MAIN, 'BSClimbTagline');
  const a = tag.indexOf("tr('launch.climbAlone')"), b = tag.indexOf("tr('launch.joinCommunity')");
  assert.ok(a > 0 && b > a, '"Don’t climb alone." first, "Join the Community" below it');
  assert.match(tag, /const \{ tr \} = useTr\('onboarding'\);/);
  // The beat: under the mark, rising in. The hold: the same, still, so the hand-over never jumps.
  const beat = MAIN.slice(MAIN.indexOf("if (style === 'wire-beat') {"), MAIN.indexOf("if (style === 'classified') {"));
  assert.ok(beat.indexOf('<BSShapeMark size={112} calm />') < beat.indexOf('<BSClimbTagline rise />'), 'the beat says them under the mark');
  const hold = fnBody(MAIN, 'BSWireHold');
  assert.ok(hold.indexOf('<BSShapeMark size={112} calm />') < hold.indexOf('<BSClimbTagline />'), 'and so does the hold, without rising in again');
  assert.match(tag, /const line = rise \? 'bs-wire-line' : undefined;/);
});

test('every language has both lines, and the website says the same English words', () => {
  const words = {};
  for (const l of LOCALES) {
    const cat = JSON.parse(read(`mobile-app/src/i18n/catalogs/${l}/onboarding.json`));
    for (const k of ['launch.climbAlone', 'launch.joinCommunity']) assert.ok(String(cat[k] || '').trim(), `${l} has no ${k}`);
    words[l] = [cat['launch.climbAlone'], cat['launch.joinCommunity']];
  }
  assert.deepEqual(words.en, ['Don’t climb alone.', 'Join the Community']);
  for (const l of LOCALES.filter((x) => x !== 'en')) assert.notDeepEqual(words[l], words.en, `${l} is still in English`);
  const site = read('public/newdesign/index.html');
  const plain = (html) => html.replace(/<[^>]+>/g, '').replace(/&rsquo;/g, '’').trim();
  assert.equal(plain(/<div class="iline">([\s\S]*?)<\/div>/.exec(site)[1]), words.en[0]);
  assert.equal(plain(/<div class="isub">([\s\S]*?)<\/div>/.exec(site)[1]), words.en[1]);
});

// Owner, 2026-11-09: "Remove shape community in the top part of splash page screen". The beat and the hold
// draw no masthead over the mark, only the space it took, so the mark stays where it was on both.
test('the splash has no masthead over the mark, on the beat and on the hold', () => {
  const beat = MAIN.slice(MAIN.indexOf("if (style === 'wire-beat') {"), MAIN.indexOf("if (style === 'classified') {"));
  const hold = fnBody(MAIN, 'BSWireHold');
  for (const [name, src] of [['beat', beat], ['hold', hold]]) {
    assert.doesNotMatch(src, /launch\.masthead/, `the ${name} prints the masthead again`);
    assert.doesNotMatch(src, /borderBottom: '1px solid rgba\(242,237,228,0\.2\)'/, `the ${name} draws the masthead's rule again`);
    const top = src.indexOf('data-bs-splash-top=""');
    assert.ok(top > 0 && top < src.indexOf('<BSShapeMark size={112} calm />'), `the ${name} lost the space over the mark`);
    assert.match(src, /<div aria-hidden="true" data-bs-splash-top="" style=\{\{ flex: 'none', padding: 'max\(54px, calc\(16px \+ env\(safe-area-inset-top, 0px\)\)\) 0 10px' \}\}><div style=\{\{ height: 11 \}\} \/><\/div>/);
  }
  for (const l of LOCALES) {
    const cat = JSON.parse(read(`mobile-app/src/i18n/catalogs/${l}/onboarding.json`));
    assert.equal(cat['launch.masthead'], undefined, `${l} still carries the masthead's words`);
  }
});
