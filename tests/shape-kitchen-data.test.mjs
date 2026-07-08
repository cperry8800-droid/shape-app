// Shape Kitchen catalog — data-integrity bar for the Kitchen Card wave.
// Enforces the spec §7 content contract mechanically: structured {n, m, k?}
// ingredients with a real quantity on every line, cookable step detail,
// macro-consistent kcal, and honest photo fields. Written RED first; the
// catalog restructure/expansion turns it green.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SHAPE_KITCHEN_RECIPES } from '../mobile-app/src/broadsheet/shapeKitchenData.js';

const QTY_RE = /\d|pinch|drizzle|handful|to taste|dash|splash|zest|juice of/i;

test('catalog: expanded to at least 34 recipes', () => {
  assert.ok(SHAPE_KITCHEN_RECIPES.length >= 34, `have ${SHAPE_KITCHEN_RECIPES.length}`);
});

test('catalog: every recipe has the required fields', () => {
  for (const r of SHAPE_KITCHEN_RECIPES) {
    for (const f of ['title', 'by', 'byRole', 'diet', 'time', 'servings', 'kcal', 'macros', 'tags', 'hero', 'blurb', 'ingredients', 'steps', 'tip']) {
      assert.ok(r[f] != null && r[f] !== '', `${r.title || '?'} missing ${f}`);
    }
    assert.ok(Number.isFinite(r.macros.p) && Number.isFinite(r.macros.c) && Number.isFinite(r.macros.f), `${r.title} macros`);
  }
});

test('catalog: ingredients are structured {n, m} with a real quantity on every line', () => {
  for (const r of SHAPE_KITCHEN_RECIPES) {
    assert.ok(Array.isArray(r.ingredients) && r.ingredients.length >= 4, `${r.title} needs >=4 ingredients (has ${r.ingredients.length})`);
    for (const ing of r.ingredients) {
      assert.equal(typeof ing, 'object', `${r.title}: string ingredient "${ing}"`);
      assert.ok(ing.m && String(ing.m).trim(), `${r.title}: ingredient missing name`);
      assert.ok(ing.n && QTY_RE.test(String(ing.n)), `${r.title}: "${ing.m}" missing a real quantity ("${ing.n}")`);
      assert.ok(!/,/.test(String(ing.m)) || String(ing.m).length < 40, `${r.title}: "${ing.m}" looks like a catch-all line`);
    }
  }
});

test('catalog: steps are detailed (each >=50 chars, time cues present)', () => {
  for (const r of SHAPE_KITCHEN_RECIPES) {
    assert.ok(r.steps.length >= 3, `${r.title}: only ${r.steps.length} steps`);
    for (const s of r.steps) assert.ok(s.length >= 50, `${r.title}: thin step "${s.slice(0, 40)}…"`);
    const joined = r.steps.join(' ');
    assert.ok(/(min|minute|second|hour|overnight)/i.test(joined), `${r.title}: no time cue in steps`);
  }
});

test('catalog: kcal is macro-consistent within ±15%', () => {
  for (const r of SHAPE_KITCHEN_RECIPES) {
    const est = r.macros.p * 4 + r.macros.c * 4 + r.macros.f * 9;
    const drift = Math.abs(est - r.kcal) / r.kcal;
    assert.ok(drift <= 0.15, `${r.title}: kcal ${r.kcal} vs macro estimate ${est} (${Math.round(drift * 100)}%)`);
  }
});

test('catalog: photo, when present, is a real path (never the hero gradient)', () => {
  for (const r of SHAPE_KITCHEN_RECIPES) {
    if (r.photo != null) assert.ok(/^\/|^https?:/.test(r.photo) && !/gradient/.test(r.photo), `${r.title}: photo "${r.photo}"`);
  }
});
