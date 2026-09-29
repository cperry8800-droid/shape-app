// The cook screens pick their layout from their own measured width (useBSCkLayout). On the
// website's cooking page the shell's node is REPLACED right after mount: the shell looks its
// portal target up on every render, and `#bs-phone-surface` is created by the very render that
// first draws it — render one portals into <body>, render two into the surface. A watch bound
// once at mount kept measuring the detached first node, so every website cook screen stayed in
// the stretched phone layout. These tests drive the shipped hook through that swap.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx', import.meta.url), 'utf8');

// Lift `function useBSCkLayout(...) { ... }` out of the module: skip its parameter list, then
// brace-match the body (a destructured parameter would otherwise close the count early).
function liftHook() {
  const start = SRC.indexOf('function useBSCkLayout(');
  assert.ok(start >= 0, 'useBSCkLayout is not in the client module');
  let i = start + 'function useBSCkLayout('.length;
  for (let d = 1; d > 0; i++) { if (SRC[i] === '(') d++; else if (SRC[i] === ')') d--; }
  const open = SRC.indexOf('{', i);
  let depth = 0; let end = open;
  for (; end < SRC.length; end++) {
    if (SRC[end] === '{') depth++;
    else if (SRC[end] === '}') { depth--; if (depth === 0) break; }
  }
  const body = SRC.slice(start, end + 1);
  assert.ok(body.length > 200, `lifted ${body.length} characters — the brace match read the signature, not the body`);
  return body;
}
const HOOK_SRC = liftHook();

// A minimal hook runtime: state, refs and effects with React's dependency rules, committed
// explicitly so a test can say exactly when the DOM node changes.
function runtime() {
  const hooks = [];
  let idx = 0; let pending = [];
  const React = {
    useState(init) {
      const k = idx++;
      if (!(k in hooks)) hooks[k] = { v: typeof init === 'function' ? init() : init };
      const h = hooks[k];
      return [h.v, (nv) => { h.v = typeof nv === 'function' ? nv(h.v) : nv; }];
    },
    useRef(init) { const k = idx++; if (!(k in hooks)) hooks[k] = { current: init }; return hooks[k]; },
    useEffect(fn, deps) {
      const k = idx++;
      const prev = hooks[k];
      const changed = !prev || !deps || !prev.deps || deps.length !== prev.deps.length || deps.some((d, j) => !Object.is(d, prev.deps[j]));
      if (!prev) hooks[k] = { deps: undefined, cleanup: null };
      if (changed) pending.push({ k, fn, deps });
    },
  };
  return {
    React,
    render(hook, ...args) { idx = 0; pending = []; return hook(...args); },
    commit() {
      for (const e of pending) {
        const h = hooks[e.k];
        if (h.cleanup) h.cleanup();
        const c = e.fn();
        h.cleanup = typeof c === 'function' ? c : null;
        h.deps = e.deps;
      }
      pending = [];
    },
    unmount() { for (const h of hooks) if (h && typeof h.cleanup === 'function') h.cleanup(); },
  };
}

function observers() {
  const all = [];
  class RO {
    constructor(cb) { this.cb = cb; this.el = null; this.dead = false; all.push(this); }
    observe(el) { this.el = el; }
    disconnect() { this.dead = true; }
    fire(width) { if (!this.dead) this.cb([{ contentRect: { width } }]); }
  }
  return { RO, all, live: () => all.filter((o) => !o.dead) };
}

const make = (RO) => {
  const rt = runtime();
  // eslint-disable-next-line no-new-func
  const hook = new Function('React', 'ResizeObserver', `${HOOK_SRC}\nreturn useBSCkLayout;`)(rt.React, RO);
  return { rt, hook };
};

test('the watch follows a node React replaced after mount (the website cooking page)', () => {
  const obs = observers();
  const { rt, hook } = make(obs.RO);
  const ref = { current: { id: 'first-render-in-body' } };
  let layout = rt.render(hook, ref); rt.commit();
  assert.equal(layout.cls, 'dev', 'nothing measured yet → the phone layout');
  assert.equal(obs.live().length, 1);
  assert.equal(obs.live()[0].el, ref.current);

  // Render two: the portal target moved, React remounted the shell, the ref holds a new node.
  const stale = obs.live()[0];
  ref.current = { id: 'second-render-in-surface' };
  rt.render(hook, ref); rt.commit();
  assert.equal(stale.dead, true, 'the detached first node is no longer watched');
  assert.equal(obs.live().length, 1, 'exactly one live watch');
  assert.equal(obs.live()[0].el, ref.current, 'the live watch is on the node on screen');

  obs.live()[0].fire(1280);
  layout = rt.render(hook, ref); rt.commit();
  assert.equal(layout.web, true);
  assert.equal(layout.cls, 'web full', 'a 1280px website window takes the website layout');

  stale.fire(0);
  layout = rt.render(hook, ref);
  assert.equal(layout.cls, 'web full', 'the detached node can no longer pull the page back to the phone layout');
});

test('the same node across renders keeps one watch (no re-observe churn)', () => {
  const obs = observers();
  const { rt, hook } = make(obs.RO);
  const ref = { current: { id: 'n' } };
  for (let i = 0; i < 5; i++) { rt.render(hook, ref); rt.commit(); }
  assert.equal(obs.all.length, 1, 'one observer for one node, however many renders');
  obs.all[0].fire(900);
  const layout = rt.render(hook, ref);
  assert.equal(layout.cls, 'web emb', '760–1179px is the embedded website layout');
});

test('a screen handed away and taken back is measured again', () => {
  const obs = observers();
  const { rt, hook } = make(obs.RO);
  const ref = { current: { id: 'picker' } };
  rt.render(hook, ref); rt.commit();
  const first = obs.all[0];
  ref.current = null; // the session hands its screen to the board
  rt.render(hook, ref); rt.commit();
  assert.equal(first.dead, true);
  assert.equal(obs.live().length, 0);
  ref.current = { id: 'wrap' }; // and takes it back for the wrap
  rt.render(hook, ref); rt.commit();
  assert.equal(obs.live().length, 1);
  assert.equal(obs.live()[0].el, ref.current);
});

test('unmount lets the watch go, and no ResizeObserver means the phone layout', () => {
  const obs = observers();
  const { rt, hook } = make(obs.RO);
  const ref = { current: { id: 'n' } };
  rt.render(hook, ref); rt.commit();
  rt.unmount();
  assert.equal(obs.live().length, 0, 'unmount disconnects');

  const bare = make(undefined);
  const r2 = { current: { id: 'n' } };
  const layout = bare.rt.render(bare.hook, r2); bare.rt.commit();
  assert.equal(layout.cls, 'dev', 'tests and old WebViews without ResizeObserver stay on the phone layout');
});

test('no cook screen still passes the retired re-attach dependency', () => {
  const calls = SRC.match(/useBSCkLayout\(([^)]*)\)/g) || [];
  const uses = calls.filter((c) => !/^useBSCkLayout\(ref\)$/.test(c));
  assert.ok(uses.length >= 3, `expected the three cook screens to call the hook, found ${uses.length}`);
  for (const c of uses) assert.equal(c, 'useBSCkLayout(rootRef)', `${c}: the watch follows the node by itself now`);
});
