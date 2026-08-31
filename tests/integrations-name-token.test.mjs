// The integrations surface carries two invariants cut 9 established, and each one
// is a class this repo has paid for before.
//
// (1) THE PROVIDER NAME IS DATA, NEVER PARSED BACK OUT OF COPY. runAction used to
//     recover the name by regexing the English word out of its own toast label —
//     `label.replace(/\bdisconnected\b/i, '')` — so the confirm dialog's SUBJECT was
//     derived from a rendered sentence. A tr() on that label stops the regex
//     matching in all twelve non-English locales and the dialog silently degrades
//     to "this app", with parse, tsc, the suite and the build all green. That is
//     cut 5's Train-tag and cut 6's grocery-aisle defect at a third site.
//
// (2) THE SETTINGS DOOR MAY NOT INVENT ITS OWN STATE. It used to render a
//     hardcoded '2 connected' meta and a hardcoded status per provider — WHOOP
//     always Connected — so a member with nothing connected read a fabricated
//     count in their own settings. It reads the real status now, and renders
//     NOTHING rather than a number it could not read.
//
// ⚠ Comments are stripped before every assertion. The rationale written at each
// site quotes the very expression being banned, so a raw-text scan fires on its
// own explanation — this file has burned that trap more than once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripComments } from './helpers/strip-comments.mjs';

const SRC = 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx';
const raw = readFileSync(SRC, 'utf8');
const src = stripComments(raw);

// Slice the component so a match elsewhere in a 30k-line file cannot stand in for
// the code under test.
function sliceComponent(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start > -1, `${name} not found — the guard is aimed at nothing`);
  const after = src.slice(start + 10);
  const nextIdx = after.search(/\nfunction [A-Za-z]/);
  return after.slice(0, nextIdx === -1 ? undefined : nextIdx);
}

// Brace-match the object literal handed to bsAskConfirm — the call nests tr()
// calls, so any non-greedy regex stops inside one of them.
function confirmArg(body) {
  const at = body.indexOf('window.bsAskConfirm({');
  assert.ok(at > -1, 'the disconnect confirm dialog is gone');
  let i = body.indexOf('{', at), depth = 0;
  for (let j = i; j < body.length; j++) {
    if (body[j] === '{') depth++;
    else if (body[j] === '}' && --depth === 0) return body.slice(i, j + 1);
  }
  assert.fail('unbalanced braces in the confirm call');
}

test('the provider name reaches the confirm dialog as data, not as parsed copy', () => {
  const body = sliceComponent('BSIntegrationsPage');

  // Guard the guard: the function under test must actually be in the slice.
  assert.match(body, /const runAction = async \(/, 'runAction is not in the slice');

  // The ban. Any attempt to recover a name from a rendered label — by replace,
  // regex, split or slice on `label` — is the defect returning.
  assert.doesNotMatch(
    body,
    /\blabel\s*\.\s*(replace|match|split|slice|substring|substr)\s*\(/,
    'runAction is deriving the provider name from its toast label again — the name is data, pass it'
  );
  assert.doesNotMatch(
    body,
    /\/\\bdisconnected\\b\/i/,
    'the disconnected-word regex is back'
  );

  // The positive. The name is a declared parameter and it is what the dialog names.
  assert.match(
    body,
    /const runAction = async \(\s*key\s*,\s*name\s*,\s*label\s*,\s*action\s*\)/,
    'runAction must take the provider name as its own parameter'
  );
  // ⚠ Brace-matched, not regexed. A non-greedy /\{[\s\S]*?\}\)/ stops at the FIRST
  // `})` — which is the inner tr() call's, not the dialog's — so the assertion
  // would have been about a two-line fragment. Caught by the guard failing on
  // correct code, which is the safe direction, but it still proved nothing.
  const confirm = confirmArg(body);
  assert.match(
    confirm,
    /name:\s*name\s*\|\|/,
    'the confirm dialog must name the provider from the passed name, with an honest fallback'
  );

  // Every call site supplies it. A four-argument call whose second argument is a
  // label expression is the shape; a three-argument call is the old signature.
  const calls = [...body.matchAll(/runAction\(\s*'([^']+)'\s*,/g)];
  assert.ok(calls.length >= 12, `expected the provider buttons to call runAction, found ${calls.length}`);
  for (const m of calls) {
    const at = m.index + m[0].length;
    const rest = body.slice(at, at + 60);
    assert.match(
      rest,
      /^\s*[A-Za-z][A-Za-z0-9_]*\.label\s*,/,
      `runAction('${m[1]}') does not pass the provider's own label as the name`
    );
  }
});

test('the toast failure names the provider instead of stacking a sentence on a sentence', () => {
  const body = sliceComponent('BSIntegrationsPage');
  // The old fallback was `${label} failed.` over a label that is already a
  // sentence — it rendered "WHOOP synced failed."
  assert.doesNotMatch(body, /\$\{label\}\s+failed/, 'the label-plus-failed sentence is back');
  assert.match(
    body,
    /settings:integrations\.toastFailed[\s\S]{0,200}?\bname\b/,
    'the failure toast must carry the provider name'
  );
});

test('the settings health section reads the real status and never invents a count', () => {
  const body = sliceComponent('BSSettings');

  // Guard the guard.
  assert.match(body, /title: 'Health integrations'/, 'the health section is not in the slice');

  const sec = body.match(/\{\s*title: 'Health integrations',[\s\S]*?\n    \},/);
  assert.ok(sec, 'could not slice the health-integrations section');
  const s = sec[0];

  // It reads the same source the Integrations page reads.
  assert.match(body, /window\.ShapeIntegrations\?\.getStatus\?\.\(\)/, 'the settings door no longer reads the real status');
  assert.match(body, /setIntegrations\(res\.providers\)/, 'the read result is not stored');

  // Honest absence: no count until one is known.
  assert.match(s, /meta: integrations \?/, 'the meta must be gated on a real read');
  assert.match(s, /\) : ''/, 'an unread status must render no meta at all, never a number');

  // No fabricated count, no fabricated per-provider status.
  assert.doesNotMatch(s, /'\d+ connected'/, 'a hardcoded connected count is back');
  for (const provider of ['WHOOP', 'Garmin', 'Strava', 'Spotify']) {
    assert.doesNotMatch(
      s,
      new RegExp(`l:\\s*'${provider}'`),
      `${provider} is hardcoded into the settings rows again — derive them from the response`
    );
  }

  // Derived, not enumerated: a provider added later must appear with nobody
  // remembering to list it.
  assert.match(
    s,
    /\.\.\.\(integrations \|\| \[\]\)\.map\(/,
    'the provider rows must be derived from the status response'
  );
});
