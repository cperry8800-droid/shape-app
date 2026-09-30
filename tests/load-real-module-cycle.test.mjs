// The real-module loader compiles a relative .jsx import by recursing into
// itself. Without a cycle guard, A → B → A recurses forever — each level
// re-compiles A from scratch with no error and no end (measured on the client
// module at ~5 s of Babel per level, until the process was killed). Found by the
// BSIntegrationsPage extraction's own mutation round: the "sibling imports the
// client module" mutation turned a fast kill into a hang.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadRealModule } from './helpers/load-real-module.mjs';

function scratch(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'load-real-module-'));
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), body);
  return dir;
}

test('an import cycle between two .jsx modules is refused at once, naming the chain', async () => {
  const dir = scratch({
    'a.jsx': "import { b } from './b.jsx';\nexport const a = () => b;\n",
    'b.jsx': "import { a } from './a.jsx';\nexport const b = () => a;\n",
  });
  const t0 = Date.now();
  await assert.rejects(loadRealModule(path.join(dir, 'a.jsx')), /import cycle: .*a\.jsx/);
  assert.ok(Date.now() - t0 < 10_000, 'the cycle was detected, not recursed into');
});

test('a diamond (two modules importing one shared sibling) is NOT a cycle', async () => {
  const dir = scratch({
    'root.jsx': "import { x } from './x.jsx';\nimport { y } from './y.jsx';\nexport const root = x + y;\n",
    'x.jsx': "import { s } from './s.jsx';\nexport const x = s + 1;\n",
    'y.jsx': "import { s } from './s.jsx';\nexport const y = s + 2;\n",
    's.jsx': 'export const s = 10;\n',
  });
  const mod = await loadRealModule(path.join(dir, 'root.jsx'));
  assert.equal(mod.root, 23);
});

test('a root compiled by a harness is handed to its siblings as an ancestor, so one importing it back fails at once', async () => {
  const dir = scratch({
    'root.jsx': 'export const root = 1;\n',
    'sib.jsx': "import { root } from './root.jsx';\nexport const sib = root;\n",
  });
  await assert.rejects(loadRealModule(path.join(dir, 'sib.jsx'), { ancestors: [path.join(dir, 'root.jsx')] }), /import cycle: .*root\.jsx -> .*sib\.jsx -> .*root\.jsx/);
  // Without the ancestor, the same import resolves normally.
  const mod = await loadRealModule(path.join(dir, 'sib.jsx'));
  assert.equal(mod.sib, 1);
});

// ⚠ THE CHAIN IS PER CALL, NOT GLOBAL. A module-level "compiling right now" set read every one
// of these as a cycle: the second load arrived while the first's marker was still up.
test('concurrent loads are not cycles: the same file twice, and a diamond whose arms load in parallel', async () => {
  const dir = scratch({
    'x.jsx': "import { s } from './s.jsx';\nexport const x = s + 1;\n",
    'y.jsx': "import { s } from './s.jsx';\nexport const y = s + 2;\n",
    's.jsx': 'export const s = 10;\n',
  });
  const [a, b] = await Promise.all([loadRealModule(path.join(dir, 's.jsx')), loadRealModule(path.join(dir, 's.jsx'))]);
  assert.equal(a.s + b.s, 20, 'the same file loaded twice at once is two loads, not a cycle');
  const [x, y] = await Promise.all([loadRealModule(path.join(dir, 'x.jsx')), loadRealModule(path.join(dir, 'y.jsx'))]);
  assert.equal(x.x + y.y, 23, 'a diamond loaded in parallel is not a cycle');
});

test('a real cycle is still refused while unrelated loads run beside it', async () => {
  const dir = scratch({
    'a.jsx': "import { b } from './b.jsx';\nexport const a = () => b;\n",
    'b.jsx': "import { a } from './a.jsx';\nexport const b = () => a;\n",
    'ok.jsx': 'export const ok = 1;\n',
  });
  const results = await Promise.allSettled([loadRealModule(path.join(dir, 'a.jsx')), loadRealModule(path.join(dir, 'ok.jsx')), loadRealModule(path.join(dir, 'ok.jsx'))]);
  assert.equal(results[0].status, 'rejected');
  assert.match(String(results[0].reason.message), /import cycle: .*a\.jsx/);
  assert.equal(results[1].status, 'fulfilled');
  assert.equal(results[2].status, 'fulfilled');
});
