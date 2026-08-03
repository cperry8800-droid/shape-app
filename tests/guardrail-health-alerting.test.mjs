// The guardrail-health cron's ALERT ROUTING — asserted at source.
//
// WHY THIS FILE EXISTS: the failure this guards against is not a wrong value,
// it is a finding that reaches nobody. Layer 2 evaluates correctly and always
// has; what it could not do was tell a human. Three separate holes made that
// true, and none of them is visible to a test that checks verdicts:
//
//   1. The evaluation_read (truncation) alert logged INLINE instead of going
//      through reportAlerts, so it was the one finding structurally excluded
//      from the Sentry path — and it is the finding that says "do not trust
//      this run's other verdicts", because they were computed on a read that
//      may have lost rows.
//   2. reportAlerts logged everything at console.error, so routing #1 through
//      it would have destroyed the deliberate info/warning split (an
//      error-level line on a run with nothing known missing is the noise that
//      gets a check muted).
//   3. A THROWN run reached console and nothing else. The withheld heartbeat is
//      the intended signal for that, but HEARTBEAT_PING_URL is unset.
//
// These are source-level assertions because the route cannot be imported here:
// it is a Next route handler that pulls in @sentry/nextjs, whose named exports
// are undefined under Node's native ESM loader. A behavioural test would need
// the whole Next runtime. What CAN be pinned is the shape of the code, and each
// assertion below was mutation-checked — reverting the fix it guards fails it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROUTE = join(ROOT, 'src', 'app', 'api', 'cron', 'guardrail-health', 'route.ts');
const src = readFileSync(ROUTE, 'utf8');

test('every structured alert is emitted through reportAlerts — no inline alert logger', () => {
  // The envelope is the STRINGIFIED alert payload, not every mention of the
  // name — `alert: 'guardrail-health'` also appears in both Sentry `tags`
  // objects, which are correct and must not be counted. Matching the
  // JSON.stringify wrapper is what distinguishes "emits an alert line" from
  // "tags an event". A second envelope means someone added an alert that logs
  // directly and therefore never reaches Sentry.
  const envelopes = src.match(/JSON\.stringify\(\{\s*alert:\s*'guardrail-health'/g) || [];
  assert.equal(
    envelopes.length,
    1,
    `expected exactly 1 structured-alert envelope (inside reportAlerts), found ${envelopes.length}. ` +
      'A new alert must call reportAlerts, not log inline — an inline log reaches Vercel and nobody.',
  );
});

test('the truncation finding is routed through reportAlerts', () => {
  assert.match(
    src,
    /readAlerts\.push\(\{[\s\S]{0,200}check:\s*'evaluation_read'/,
    "the evaluation_read finding must be collected as an alert, not logged inline",
  );
  assert.match(
    src,
    /reportAlerts\(readAlerts\)/,
    'the collected read alert must still be REPORTED at the read site, so it reaches ' +
      'Sentry even if the evaluation below it throws',
  );
});

test('the run\'s alert count includes the truncation finding, not just the evaluator\'s', () => {
  // Routing evaluation_read through reportAlerts and stopping there was half a
  // fix. `alerted` was computed from bsEvaluateHealth's alerts alone, so a run
  // whose ONLY finding was "this read may have lost rows" persisted
  // `alerted: false` and returned `alerted: 0` — and that is the finding which
  // says do not trust the other verdicts. A query asking which runs alerted
  // would skip precisely the run that disqualifies the rest.
  assert.match(
    src,
    /const allAlerts = \[\s*\.\.\.readAlerts,\s*\.\.\.alerts\s*\]/,
    'the run must aggregate the read alerts with the evaluator alerts',
  );
  const uses = src.match(/alerted: allAlerts\./g) || [];
  assert.equal(
    uses.length,
    2,
    `both the persisted row and the HTTP response must report the combined count, found ${uses.length}. ` +
      'One of the two reading `alerts.length` is the split-brain this test exists to catch.',
  );
  assert.ok(
    !/alerted: alerts\./.test(src),
    'no alerted field may be computed from the evaluator alerts alone',
  );
});

test('reportAlerts preserves the info/warning split rather than logging everything as error', () => {
  // Console side: info must not shout.
  assert.match(
    src,
    /const log = a\.severity === 'info' \? console\.warn : console\.error/,
    'reportAlerts must log info-severity findings at warn, not error',
  );
  // Sentry side: the level must carry the same three-way split, otherwise the
  // console and the dashboard disagree about how serious the same event is.
  assert.match(
    src,
    /level:\s*a\.severity === 'info' \? 'info' : a\.severity === 'warning' \? 'warning' : 'error'/,
    'the Sentry level must map info→info, warning→warning, everything else→error',
  );
});

test('a thrown run is captured, not just logged', () => {
  // Anchor on the BINDING catch. `lastIndexOf('} catch')` finds the bare
  // swallowing `} catch {` added inside this very block, not the handler that
  // owns the run — a slice from there would miss the capture and fail for the
  // wrong reason.
  const at = src.lastIndexOf('} catch (e)');
  assert.notEqual(
    at,
    -1,
    'could not locate the outer `} catch (e)` handler — if the binding was renamed ' +
      '(e.g. `catch (err)`), update this anchor. Without this check a rename makes ' +
      'slice(-1) return the last CHARACTER of the file, so the test still fails but ' +
      'blames a missing capture instead of a moved anchor.',
  );
  const tail = src.slice(at);
  assert.match(
    tail,
    /Sentry\.captureException\(/,
    'the outer catch must capture — a job that died is the one failure the verdicts cannot report',
  );
  assert.match(
    tail,
    /check:\s*'run_failed'/,
    "the run-failure capture must be tagged check:'run_failed' so it is filterable alongside the checks",
  );
  // The console line is the only sink that works with no DSN, so it must stay.
  assert.match(tail, /console\.error\('\[shape-health\] run failed:'/);
});

test('the capture cannot replace the failure it is reporting', () => {
  // Both Sentry calls sit inside their own try/catch. An SDK throw must never
  // cost the console line that is the sole pre-DSN sink, and must never turn
  // one reported failure into a worse unreported one.
  const captures = src.match(/Sentry\.(captureMessage|captureException)\(/g) || [];
  assert.equal(captures.length, 2, 'expected exactly two capture sites: reportAlerts and the outer catch');
  for (const marker of ['captureMessage(', 'captureException(']) {
    const at = src.indexOf(`Sentry.${marker}`);
    const before = src.slice(Math.max(0, at - 400), at);
    assert.ok(
      before.lastIndexOf('try {') > before.lastIndexOf('} catch'),
      `Sentry.${marker} must be wrapped in its own try/catch`,
    );
  }
});
