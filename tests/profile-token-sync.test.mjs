import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  BS_PIN_KINDS, BS_PROFILE_PROMPTS, BS_COACH_PROMPTS,
  bsPinKindLabel, bsPinKindToken, bsPromptLabel, bsPromptToken,
} from '../mobile-app/src/services/profileCustom.mjs';

// The pin KIND and the prompt QUESTION are STORED in the member's own
// profile_custom doc, COMPARED against the picker's chip/option list on every
// render, and RENDERED back as copy — the token/label class, at a fourth site.
// Two live writers (the mobile customizer + the website editor) share one
// record, so this pins BOTH surfaces: the store keeps a token, the screen reads
// a label, and the website's fallback tables cannot drift from the canonical.

const MOBILE = path.join('mobile-app', 'src', 'broadsheet', 'iosAppBroadsheetClient.jsx');
const WEB = path.join('public', 'newdesign', 'livingDesktop.jsx');

// ⚠ Strip comments first — the rationale written at each site quotes the very
// expressions these assertions ban. LINE comments only, deliberately: a
// non-greedy /* … */ strip opens a false block on the first regex literal that
// contains a slash-star and swallows 568k characters of this file, so the
// assertions then pass vacuously over source that isn't there. Every rationale
// comment in both files is a // line, so this is sufficient as well as safe.
function stripComments(s) {
  return s.replace(/^[ \t]*\/\/.*$/gm, '');
}
const mob = stripComments(fs.readFileSync(MOBILE, 'utf8'));
const web = stripComments(fs.readFileSync(WEB, 'utf8'));

const ALL_PROMPTS = [...BS_PROFILE_PROMPTS, ...BS_COACH_PROMPTS];

test('guard-the-guard: the tables are the shipped shape, ids unique across both lists', () => {
  assert.equal(BS_PIN_KINDS.length, 5, 'five pin kinds');
  assert.equal(BS_PROFILE_PROMPTS.length, 8, 'eight member prompts');
  assert.equal(BS_COACH_PROMPTS.length, 6, 'six coach prompts');
  for (const r of [...BS_PIN_KINDS, ...ALL_PROMPTS]) {
    assert.ok(r.id && typeof r.id === 'string', `${JSON.stringify(r)} id`);
    assert.ok(r.en && typeof r.en === 'string', `${r.id} en`);
    assert.ok(!/\s/.test(r.id), `${r.id} carries no whitespace`);
  }
  // ONE prompt lookup serves both role lists — the render doesn't know the role,
  // so a collision would resolve a coach question to a member label.
  const ids = ALL_PROMPTS.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, 'prompt ids are unique across BOTH lists');
  const kinds = BS_PIN_KINDS.map((r) => r.id);
  assert.equal(new Set(kinds).size, kinds.length, 'pin kind ids are unique');
});

test('label: token renders copy, legacy English renders copy, free text passes through', () => {
  for (const r of BS_PIN_KINDS) {
    assert.equal(bsPinKindLabel(r.id), r.en, `${r.id} → copy`);
    assert.equal(bsPinKindLabel(r.en), r.en, `legacy "${r.en}" still reads`);
    assert.equal(bsPinKindLabel(`  ${r.en.toUpperCase()} `), r.en, 'case + padding');
  }
  for (const r of ALL_PROMPTS) {
    assert.equal(bsPromptLabel(r.id), r.en, `${r.id} → copy`);
    assert.equal(bsPromptLabel(r.en), r.en, `legacy "${r.en}" still reads`);
  }
  // The demo profiles carry questions the picker never offered. An unrecognised
  // value renders as ITSELF — never blank, never a raw key (the aisle precedent).
  for (const q of ['Why I train', 'The lift I love', 'How I work', 'My coaching in one line', 'Who I work best with']) {
    assert.equal(bsPromptLabel(q), q, `demo question "${q}" passes through`);
  }
  for (const v of ['', null, undefined, '   ']) {
    assert.equal(bsPinKindLabel(v), '');
    assert.equal(bsPromptLabel(v), '');
  }
});

test('token: ids stay, legacy English maps, free text passes through', () => {
  for (const r of BS_PIN_KINDS) {
    assert.equal(bsPinKindToken(r.id), r.id, `${r.id} is idempotent`);
    assert.equal(bsPinKindToken(r.en), r.id, `legacy "${r.en}" maps`);
    assert.equal(bsPinKindToken(` ${r.en.toLowerCase()}  `), r.id, 'case + padding');
  }
  for (const r of ALL_PROMPTS) {
    assert.equal(bsPromptToken(r.id), r.id);
    assert.equal(bsPromptToken(r.en), r.id, `legacy "${r.en}" maps`);
  }
  assert.equal(bsPromptToken('Why I train'), 'Why I train', 'a demo question is not invented into an id');
  for (const v of ['', null, undefined, '   ']) {
    assert.equal(bsPinKindToken(v), '');
    assert.equal(bsPromptToken(v), '');
  }
});

test('round-trip: every shipped option survives label → token', () => {
  for (const r of BS_PIN_KINDS) assert.equal(bsPinKindToken(bsPinKindLabel(r.id)), r.id);
  for (const r of ALL_PROMPTS) assert.equal(bsPromptToken(bsPromptLabel(r.id)), r.id);
});

test('the label survives a catalog that fails in each of the three ways', () => {
  // returnEmptyString: false renders the RAW KEY, so an authored empty value and a
  // key echo both have to read English — the trap the goal split already paid for.
  const bad = [
    () => { throw new Error('catalog exploded'); },
    (k) => k,
    () => '',
    () => null,
  ];
  for (const tr of bad) {
    assert.equal(bsPinKindLabel('pr', tr), 'PR', `pin kind survives ${tr}`);
    assert.equal(bsPromptLabel('never_skip', tr), 'Never skip', 'prompt survives');
  }
  assert.equal(bsPinKindLabel('pr', 'not a function'), 'PR', 'a non-function translator');
  assert.equal(bsPinKindLabel('pr', (k, o) => `[${o.defaultValue}]`), '[PR]', 'a real translator is honoured');
});

test('MOBILE: the record stores tokens, the screen renders labels, the picker compares tokens', () => {
  assert.ok(!/^const BS_(PIN_KINDS|PROFILE_PROMPTS|COACH_PROMPTS) = \[/m.test(mob),
    'the local arrays are gone — the module owns them');
  assert.ok(/BS_PIN_KINDS, BS_PROFILE_PROMPTS, BS_COACH_PROMPTS/.test(mob), 'tables imported');

  const store = /pinned: pinTitle\.trim\(\) \? \{[^\n]*\}/.exec(mob);
  assert.ok(store, 'the pin write');
  assert.ok(/kind: bsPinKindToken\(pinKind\)/.test(store[0]), 'the pin stores a token');

  const pStore = /prompts: prompts\.filter[^\n]*/.exec(mob);
  assert.ok(pStore && /q: bsPromptToken\(p\.q\)/.test(pStore[0]), 'the prompt stores a token');

  assert.ok(!/\{pinned\.kind \|\|/.test(mob), 'no site renders the raw pin token');
  assert.equal((mob.match(/bsPinKindLabel\(pinned\.kind, tr\)/g) || []).length, 2,
    'both profile variants render the pin label');
  assert.ok(!/\}\}>\{p\.q\}</.test(mob), 'no site renders the raw prompt token');
  assert.equal((mob.match(/bsPromptLabel\(p\.q, tr\)/g) || []).length, 2,
    'both profile variants render the prompt label');

  const pick = /\{BS_PIN_KINDS\.map\(\(k\)[\s\S]{0,900}?<\/button>/.exec(mob);
  assert.ok(pick, 'the pin picker');
  assert.ok(/bsPinKindToken\(pinKind\) === k\.id/.test(pick[0]), 'selection compares tokens');
  assert.ok(!/pinKind === k\b/.test(pick[0]), 'the old copy-equality comparison is gone');
  assert.ok(/bsPinKindLabel\(k\.id\)/.test(pick[0]), 'the chip renders a label');

  assert.ok(/<select value=\{bsPromptToken\(p\.q\)\}/.test(mob), 'the select is keyed on the token');
  assert.ok(/<option key=\{q\.id\} value=\{q\.id\}[^\n]*bsPromptLabel\(q\.id\)/.test(mob),
    'the options carry ids and render labels');
  assert.ok(/bsPinKindToken\(\(init\.pinned && init\.pinned\.kind\) \|\| ''\)/.test(mob),
    'a legacy English kind is normalised on the way in, so the picker still matches');
});

test('WEB: the second writer of the same record obeys the same contract', () => {
  const store = /pinned: pinTitle\.trim\(\) \? \{[^\n]*\}/.exec(web);
  assert.ok(store && /kind: dkPinKindToken\(pinKind\)/.test(store[0]), 'the pin stores a token');
  const pStore = /prompts: prompts\.filter[^\n]*/.exec(web);
  assert.ok(pStore && /q: dkPromptToken\(p\.q\)/.test(pStore[0]), 'the prompt stores a token');

  assert.ok(!/\{pinned\.kind \|\|/.test(web), 'no site renders the raw pin token');
  assert.ok(/dkPinKindLabel\(pinned\.kind\)/.test(web), 'the pin renders a label');
  assert.ok(!/\}\}>\{p\.q\}</.test(web), 'no site renders the raw prompt token');
  assert.ok(/dkPromptLabel\(p\.q\)/.test(web), 'the prompt renders a label');

  const pick = /\{dkPinKinds\(\)\.map\(\(k\)[\s\S]{0,900}?<\/button>\)\}/.exec(web);
  assert.ok(pick, 'the pin picker');
  assert.ok(/dkPinKindToken\(pinKind\) === k\.id/.test(pick[0]), 'selection compares tokens');
  assert.ok(!/pinKind === k\b/.test(pick[0]), 'the old copy-equality comparison is gone');
  assert.ok(/dkPinKindLabel\(k\.id\)/.test(pick[0]), 'the chip renders a label');

  assert.ok(/<select value=\{dkPromptToken\(p\.q\)\}/.test(web), 'the select is keyed on the token');
  assert.ok(/<option key=\{q\.id\} value=\{q\.id\}>\{dkPromptLabel\(q\.id\)\}/.test(web), 'options carry ids');
  assert.ok(/dkPinKindToken\(\(init\.pinned && init\.pinned\.kind\) \|\| ""\)/.test(web),
    'a legacy English kind is normalised on the way in');
});

test('the website fallback tables are byte-identical to the canonical ones', () => {
  // livingDesktop.jsx is a browser-babel script and cannot import, so it carries
  // local [{id,en}] copies for the window.ShapeProfileLib loading race. A drift
  // here means the two writers of ONE record disagree about what a token means.
  const raw = fs.readFileSync(WEB, 'utf8');
  const table = (name) => {
    const m = new RegExp(`const ${name} = \\[([\\s\\S]*?)\\n\\];`).exec(raw);
    assert.ok(m, `${name} local table`);
    return [...m[1].matchAll(/\{ id: "([^"]+)", en: "((?:[^"\\]|\\.)*)" \}/g)]
      .map((x) => ({ id: x[1], en: x[2].replace(/\\"/g, '"') }));
  };
  assert.deepEqual(table('DK_PIN_KINDS'), BS_PIN_KINDS, 'pin kinds match');
  assert.deepEqual(table('DK_PROMPTS'), BS_PROFILE_PROMPTS, 'member prompts match');
  assert.deepEqual(table('DK_COACH_PROMPTS'), BS_COACH_PROMPTS, 'coach prompts match');
});

test('the website fallback HELPERS answer identically to the canonical ones', () => {
  // Pinning the tables is not enough — the fallback path has its own fold/find.
  // Drive both over the same vectors so a divergence fails here, not in a member's doc.
  const raw = fs.readFileSync(WEB, 'utf8');
  const grab = (name) => {
    const i = raw.indexOf(`function ${name}(`);
    assert.ok(i > -1, `${name} is declared`);
    let d = 0, started = false;
    for (let j = i; j < raw.length; j++) {
      if (raw[j] === '{') { d++; started = true; }
      else if (raw[j] === '}') { d--; if (started && d === 0) return raw.slice(i, j + 1); }
    }
    throw new Error(`${name} body not closed`);
  };
  const src = `${grab('dkFold')}\n${grab('dkLocalLabel')}\n${grab('dkLocalToken')}\n` +
    `return { dkLocalLabel, dkLocalToken };`;
  const local = new Function(src)();

  const vectors = ['', '   ', 'Why I train', 'unknown-token'];
  for (const r of BS_PIN_KINDS) vectors.push(r.id, r.en, ` ${r.en.toUpperCase()} `);
  for (const v of vectors) {
    assert.equal(local.dkLocalLabel(BS_PIN_KINDS, v), bsPinKindLabel(v), `label parity: ${JSON.stringify(v)}`);
    assert.equal(local.dkLocalToken(BS_PIN_KINDS, v), bsPinKindToken(v), `token parity: ${JSON.stringify(v)}`);
  }
  const pv = ['', 'Why I train'];
  for (const r of ALL_PROMPTS) pv.push(r.id, r.en);
  for (const v of pv) {
    assert.equal(local.dkLocalLabel(ALL_PROMPTS, v), bsPromptLabel(v), `prompt label parity: ${v}`);
    assert.equal(local.dkLocalToken(ALL_PROMPTS, v), bsPromptToken(v), `prompt token parity: ${v}`);
  }
});
