// BSDetailHeader in a BSPage scrolls away and hands its title to the page's pinned bar (owner, 2026-10-25:
// "yes make the header smaller on scroll"); anywhere else it stays sticky, as it was. The bar's side is
// mounted in tests/detail-bar.test.mjs; this drives the header itself from the shipping client module.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBroadsheet, drive } from './helpers/broadsheet-mount.mjs';

const { BSDetailHeader } = await loadBroadsheet(['BSDetailHeader']);
const title = 'Saved carts.';

test('in a BSPage the header is not sticky and its title carries the bar\'s ref', () => {
  const ref = { current: null };
  const asked = [];
  globalThis.useBSDetailBar = (t, onBack) => { asked.push([t, typeof onBack]); return ref; };
  try {
    const d = drive(BSDetailHeader, { onBack() {}, eyebrow: '6 lists', kicker: 'Section · Library', title });
    const root = d.nodes()[0];
    assert.equal(root.props.style.position, undefined, 'the header is still sticky, so it stays pinned whole');
    assert.ok(d.nodes().some((n) => n.props.ref === ref && n.props.children === title), 'the title does not carry the bar\'s ref');
    assert.deepEqual(asked, [[title, 'function']], 'the header does not hand its title and back to the bar');
  } finally {
    delete globalThis.useBSDetailBar;
  }
});

test('with no bar to hand it to, the header stays sticky at the top', () => {
  globalThis.useBSDetailBar = () => null;
  try {
    const root = drive(BSDetailHeader, { onBack() {}, title }).nodes()[0];
    assert.equal(root.props.style.position, 'sticky');
    assert.equal(root.props.style.top, 0);
  } finally {
    delete globalThis.useBSDetailBar;
  }
  // A build without the chrome's hook (an older module) behaves the same.
  const root = drive(BSDetailHeader, { onBack() {}, title }).nodes()[0];
  assert.equal(root.props.style.position, 'sticky');
});
