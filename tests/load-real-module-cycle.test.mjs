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
import { loadRealModule, markInFlight } from './helpers/load-real-module.mjs';

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

test('a root compiled by a harness can register itself, so a sibling importing it back fails at once', async () => {
  const dir = scratch({
    'root.jsx': 'export const root = 1;\n',
    'sib.jsx': "import { root } from './root.jsx';\nexport const sib = root;\n",
  });
  const unmark = markInFlight(path.join(dir, 'root.jsx'));
  try {
    await assert.rejects(loadRealModule(path.join(dir, 'sib.jsx')), /import cycle: .*root\.jsx/);
  } finally {
    unmark();
  }
  // Unmarked, the same import resolves normally.
  const mod = await loadRealModule(path.join(dir, 'sib.jsx'));
  assert.equal(mod.sib, 1);
});
