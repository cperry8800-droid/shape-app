// The project's own agents (.claude/agents/*.md) and skills (.claude/skills/*/SKILL.md) are
// instructions a session follows to the letter, and they rot quietly: a section of the worklog
// is renamed, a build step is retired, a path moves, and the agent keeps looking for the old
// one. The support reviewer searched a "Known gaps" section for weeks after the gaps moved to
// the War Room, and two skills still told sessions to copy mobile-app/dist into public/m after
// it was gitignored. These checks fail on the drift instead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const worklog = read('docs/WORKLOG.md');
const oneLine = (s) => s.replace(/\s+/g, ' ').trim();
// What a session can be sent to in the worklog: its headings and its bold labels
// ("**Planned next**", "- **Branch and merge.**"). Plain text doesn't count: the
// worklog still says "Known gaps live in the War Room" long after that section went.
const worklogSections = new Set([
  ...[...worklog.matchAll(/^#{1,6} (.+)$/gm)].map((m) => m[1]),
  ...[...worklog.matchAll(/\*\*([^*]+)\*\*/g)].map((m) => m[1].replace(/[.:]$/, '')),
].map(oneLine));

const agentFiles = fs.readdirSync(path.join(root, '.claude/agents'))
  .filter((f) => f.endsWith('.md'))
  .map((f) => ({ rel: `.claude/agents/${f}`, expect: f.replace(/\.md$/, '') }));
const skillFiles = fs.readdirSync(path.join(root, '.claude/skills'), { withFileTypes: true })
  .filter((d) => d.isDirectory() && fs.existsSync(path.join(root, '.claude/skills', d.name, 'SKILL.md')))
  .map((d) => ({ rel: `.claude/skills/${d.name}/SKILL.md`, expect: d.name }));
const files = [...agentFiles, ...skillFiles].map((f) => ({ ...f, text: read(f.rel) }));

function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return null;
  const out = {};
  let key = null;
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([a-zA-Z-]+):\s*(.*)$/);
    if (kv) { key = kv[1]; out[key] = kv[2].replace(/^>-?\s*$/, ''); }
    else if (key && /^\s+\S/.test(line)) out[key] = `${out[key]} ${line.trim()}`.trim();
  }
  return out;
}

// A backticked path rooted at one of the repo's top folders: `src/lib/warroom.ts`,
// `mobile-app/src/broadsheet/*.jsx`, `public/newdesign/`. A wildcard or <placeholder>
// is checked up to the folder that holds it.
const ROOTS = /^(?:\.claude|docs|mobile-app|public|scripts|src|supabase-migrations|tests)\//;
function repoPaths(text) {
  return [...new Set([...text.matchAll(/`([^`\s]+)`/g)].map((m) => m[1]).filter((p) => ROOTS.test(p)))];
}
// Built at deploy and gitignored, so a fresh checkout never has them.
const BUILT_AT_DEPLOY = new Set(['public/m', 'public/m/']);
function pathExists(p) {
  if (BUILT_AT_DEPLOY.has(p)) return true;
  const cut = p.search(/[*<{]/);
  const probe = cut === -1 ? p : p.slice(0, p.lastIndexOf('/', cut) + 1);
  return fs.existsSync(path.join(root, probe));
}

test('the project has agents and skills to check', () => {
  assert.ok(agentFiles.length >= 1, 'no .claude/agents/*.md found');
  assert.ok(skillFiles.length >= 1, 'no .claude/skills/*/SKILL.md found');
});

test('every agent and skill has a name that matches its file and a description', () => {
  for (const f of files) {
    const fm = frontmatter(f.text);
    assert.ok(fm, `${f.rel} has no --- frontmatter block`);
    assert.equal(fm.name, f.expect, `${f.rel}: name: must be "${f.expect}", its file or folder name, or Claude Code loads it under another name`);
    assert.ok((fm.description || '').length >= 40, `${f.rel}: description: is what decides when it is used; say what it does and when`);
  }
});

test('every repo path an agent or skill names exists', () => {
  for (const f of files) {
    for (const p of repoPaths(f.text)) {
      assert.ok(pathExists(p), `${f.rel} names \`${p}\`, which does not exist: point it at where that lives now`);
    }
  }
});

test('every worklog section an agent or skill names is in the worklog', () => {
  for (const f of files) {
    const named = [
      ...[...f.text.matchAll(/WORKLOG's \*\*([^*]+)\*\*/g)].map((m) => m[1]),
      ...[...f.text.matchAll(/WORKLOG's\s+([A-Z][\w-]*(?:\s+[\w-]+)*?)\s+line\b/g)].map((m) => m[1]),
      ...[...f.text.matchAll(/"([^"]+)"\s+in\s+`docs\/WORKLOG\.md`/g)].map((m) => m[1]),
      ...[...f.text.matchAll(/`docs\/WORKLOG\.md`,\s+((?:"[^"]+"(?:,\s*|\s+and\s+)?)+)/g)]
        .flatMap((m) => [...m[1].matchAll(/"([^"]+)"/g)].map((q) => q[1])),
    ];
    for (const name of named.map(oneLine)) {
      assert.ok(worklogSections.has(name), `${f.rel} sends sessions to "${name}" in docs/WORKLOG.md, which has no such heading or bold label: the worklog replaces lines, so find where that rule went (often the War Room, src/lib/warroom.ts)`);
    }
  }
});

test('no agent or skill republishes public/m by hand', () => {
  for (const f of files) {
    assert.doesNotMatch(f.text, /cp -r mobile-app\/dist public\/m|public\/m` synced|republish `?public\/m/,
      `${f.rel} tells sessions to copy the build into public/m; it is gitignored and scripts/build-m.sh builds it at deploy`);
  }
});

test("the support reviewer lists both spellings of each Microsoft 365 tool", () => {
  const fm = frontmatter(read('.claude/agents/support-reviewer.md'));
  const tools = fm.tools.split(',').map((s) => s.trim());
  const ms = (sep) => new Set(tools.filter((t) => t.startsWith(`mcp__Microsoft${sep}365__`)).map((t) => t.split('__')[2]));
  const under = ms('_');
  const dash = ms('-');
  assert.ok(under.size >= 1, 'the support reviewer has no Microsoft 365 tools');
  assert.deepEqual([...under].sort(), [...dash].sort(), 'mcp__Microsoft_365__ (interactive sessions) and mcp__Microsoft-365__ (scheduled runs) must list the same tools, or one kind of run loses a tool');
});
