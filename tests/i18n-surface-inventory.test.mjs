// The i18n surface inventory — the measurement the "COMPLETE" claim never had.
//
// ⚠ THE 2026-07-16 ROLLOUT SHIPPED PER *NAMED SURFACE*, AND NOTHING EVER AUDITED
// WHAT WAS ABSENT FROM THE LIST. So "every surface is localized" was never a
// measured claim, and it has been corrected FOUR times for the same reason —
// Shape Score, then The Record, then the whole Progress hub, each found by a
// reader rather than by a gate. Correcting the fourth omission would have been a
// fifth per-omission repair; this file is the enumeration instead.
//
// ⚠ COVERAGE IS A PROPERTY OF A COMPONENT, NOT A FILE. `iosAppBroadsheetClient.jsx`
// carries ~1,600 `tr()` calls AND the Progress hub, the live session player, the
// meal logger and the profile customizer with none — a per-file count reads as
// covered and hides every one of them. That is the exact mistake the search
// caller inventory was rewritten to stop making (#1953), applied here up front.
//
// What this pins is a RATCHET, not a finish line: the uncovered set is recorded,
// a NEW uncovered surface fails, and a surface that gets localized ALSO fails
// until its baseline entry is removed — so the list can never silently vouch for
// code that has moved on, in either direction.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as babelParser from '@babel/parser';

const DIR = 'mobile-app/src/broadsheet';

// A string is user-facing when it carries two consecutive letters — enough to
// exclude glyph rows ('·', '＋', '→'), numerals and punctuation without guessing.
const LETTERS = /[A-Za-z]{2}/;

// ⚠ BRAND NOUNS AND TERMS OF ART ARE LITERAL IN EVERY LOCALE — the house rule the
// catalogs already follow (see the 13-locale translator brief). Counting them as
// untranslated copy would inflate the gap with strings no locale should change.
const BRAND = new Set([
  'Shape', 'Shape Score', 'Shape Kitchen', 'Shape Radio', 'Shape Store', 'Shape Steps',
  'Vol. 1 · No. 1', 'Nora', 'Spotify', 'Apple Music', 'Instacart', 'Strava', 'Whoop',
  'Oura', 'Garmin', 'RPE', 'e1RM', 'kcal', 'KCAL', 'BPM', 'HRV', 'GPS', 'PR', 'PRS', 'Aa',
  'KB', 'MB', 'GB', 'ms', 'px',
]);

// Comparison operands are TOKENS, never rendered: `typeof x === 'string'`,
// `variant === 'plate'`. Counting them read four animation components and three
// shells as carrying untranslated copy.
const COMPARISON = new Set(['===', '!==', '==', '!=']);

// Props whose string value is READ ALOUD or rendered. Everything else a string can
// land in — styles, classes, keys, colors, ids — is not copy.
const TEXT_PROPS = new Set(['placeholder', 'title', 'alt', 'aria-label', 'ariaLabel', 'label', 'aria-valuetext']);

// The translator is reached two ways in this tree: the `useShapeTr()` hook's `tr`,
// and the pros module's module-scope non-hook `coachTr` (the roster helpers cannot
// hold a hook). Matching only `tr` would read every coachTr surface as uncovered.
const IS_TR = /^(tr|[a-z]\w*Tr)$/;

// ⚠ COPY IS NOT ONLY A DIRECT CHILD OF ITS CONTAINER — Codex P1 on #1954, and it
// made the first published number wrong. `{isAdded ? '✓ ADDED' : '+ ADD'}` puts
// the literals under a ConditionalExpression, `{a || 'Untitled'}` under a
// LogicalExpression; matching only the IMMEDIATE parent misses both. Whole
// components were invisible that way — BSConfirmSheet ("Are you sure?" · "Cancel"
// · "Confirm"), the Find-a-coach bar, the Save button, the widget picker — and a
// new component using the same everyday shape would have walked past the ratchet.
// So a RENDERED expression container is walked whole, stopping at:
//   · nested JSX      — visited on its own terms; descending double-counts
//   · calls           — tr('key', {defaultValue}) args are keys, not copy
//   · comparisons     — see COMPARISON above
//   · <style>/<script>— @keyframes is not copy
/** Every user-facing string inside one rendered expression container. */
function containerStrings(container) {
  const out = [];
  walk(container, (n) => {
    if (n !== container && (n.type === 'JSXElement' || n.type === 'JSXFragment'
      || n.type === 'JSXAttribute' || n.type === 'CallExpression')) return false;
    if (n.type === 'BinaryExpression' && COMPARISON.has(n.operator)) return false;
    if (n.type === 'StringLiteral' && usable(n.value)) out.push(n.value);
    if (n.type === 'TemplateLiteral') for (const q of n.quasis) if (usable(q.value.cooked)) out.push(q.value.cooked.trim());
    return true;
  });
  return out;
}

/** Two consecutive letters, and not a brand noun the house keeps literal. */
function usable(v) {
  return !!v && LETTERS.test(v) && !BRAND.has(v.trim());
}

/** Walk one file and return { name, tr, hard } for every component that renders JSX. */
function componentsOf(file) {
  const src = fs.readFileSync(path.join(DIR, file), 'utf8');
  const ast = babelParser.parse(src, { sourceType: 'module', plugins: ['jsx'] });
  const out = [];

  // Top-level `function Name()` / `const Name = () =>` with a Capitalized name.
  const decls = [];
  for (const node of ast.program.body) {
    if (node.type === 'FunctionDeclaration' && node.id && /^[A-Z_]/.test(node.id.name)) {
      decls.push({ name: node.id.name, node });
    } else if (node.type === 'VariableDeclaration') {
      for (const d of node.declarations) {
        const fn = d.init && (d.init.type === 'ArrowFunctionExpression' || d.init.type === 'FunctionExpression');
        if (fn && d.id?.type === 'Identifier' && /^[A-Z_]/.test(d.id.name)) {
          decls.push({ name: d.id.name, node: d });
        }
      }
    }
  }

  for (const d of decls) {
    let tr = 0, jsx = 0;
    const strings = new Set();
    // ⚠ WALK THE COMPONENT'S OWN NODE, never the Program with a range test. The
    // first version pruned on `n.start < d.start`, which is true of the Program
    // root itself (start 0) — so it skipped the entire tree and reported zero.
    // The guard-the-guard assertion below is what caught it.
    walk(d.node, (n, parent) => {
      if (n.type === 'CallExpression' && n.callee?.type === 'Identifier' && IS_TR.test(n.callee.name)) tr++;
      if (n.type === 'JSXElement' || n.type === 'JSXFragment') jsx++;
      if (n.type === 'JSXText') {
        const v = n.value.trim();
        if (usable(v)) strings.add(v);
      }
      if (n.type === 'StringLiteral' && usable(n.value)
        && parent?.type === 'JSXAttribute' && TEXT_PROPS.has(parent.name?.name)) strings.add(n.value);
      if (n.type === 'JSXExpressionContainer' && (parent?.type === 'JSXElement' || parent?.type === 'JSXFragment')) {
        const tag = parent.openingElement?.name?.name;
        if (tag !== 'style' && tag !== 'script') for (const v of containerStrings(n)) strings.add(v);
      }
    });
    if (jsx > 0) out.push({ name: d.name, tr, hard: strings.size });
  }
  return out;
}

/** Depth-first over a Babel AST subtree; `visit` returns false to skip a subtree. */
function walk(node, visit, parent = null) {
  if (!node || typeof node.type !== 'string') return;
  // ⚠ THE RETURN VALUE IS LOAD-BEARING. containerStrings() prunes nested JSX,
  // calls and comparisons through it; ignoring it collected tr() defaultValues
  // and style-object literals as untranslated copy (4,094 strings instead of
  // 1,412 — a number wrong in the other direction).
  if (visit(node, parent) === false) return;
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'leadingComments' || key === 'trailingComments') continue;
    const v = node[key];
    if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') walk(c, visit, node); }
    else if (v && typeof v.type === 'string') walk(v, visit, node);
  }
}

function inventory() {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.jsx')).sort();
  const rows = [];
  for (const f of files) {
    const short = f.replace('iosAppBroadsheet', '').replace('.jsx', '') || 'index';
    for (const c of componentsOf(f)) rows.push({ key: `${short}::${c.name}`, ...c });
  }
  return rows;
}

// ── The baseline ────────────────────────────────────────────────────────────
// Measured 2026-08-29 by the walk above. NOT a target list and NOT an exemption:
// it is the honest state of the tree, recorded so the next omission fails here
// instead of being found by a fifth reader.
//
// ⚠ LOCALIZING A SURFACE MEANS DELETING ITS LINE. The test fails both ways — a
// new uncovered component fails, AND a baseline entry that is now covered (or no
// longer exists) fails — so this set can never silently vouch for code that moved.

/** Renders user-facing copy with NO translator in scope at all. */
const UNCOVERED = new Set([
  'Client::BSAboutPage', 'Client::BSActivityBody', 'Client::BSActivityLogCta',
  'Client::BSActivityRoutePreview', 'Client::BSAddPlaylistSheet', 'Client::BSBarcodeScan',
  'Client::BSBuildDoor', 'Client::BSCardSheetHost', 'Client::BSChatThread',
  'Client::BSClientGoals', 'Client::BSClientLibrary', 'Client::BSClientNextPlate',
  'Client::BSClientProgress', 'Client::BSClientTrain', 'Client::BSCoachAdjustBanner',
  'Client::BSCoachGroceryReview', 'Client::BSCodeOfConductPage', 'Client::BSCommitmentCard',
  'Client::BSConsumerHealthPage', 'Client::BSContactPage', 'Client::BSCrossoverCard',
  'Client::BSDataCompliancePage', 'Client::BSDayBriefPreview', 'Client::BSFacetAvatar',
  'Client::BSFindCoachBar', 'Client::BSFollowListSheet', 'Client::BSFollowSuggestions',
  'Client::BSGoalEditSheet', 'Client::BSGoalsContract', 'Client::BSGroceryBuilder',
  'Client::BSGroceryLibrary', 'Client::BSHeadlineEditSheet', 'Client::BSHealthIntake',
  'Client::BSHelpPage', 'Client::BSIntegrationsPage', 'Client::BSIntentStep',
  'Client::BSKitchenCard', 'Client::BSLeaderboard', 'Client::BSLegalActions',
  'Client::BSLibraryDetail', 'Client::BSLogActivity', 'Client::BSLogMealFlow',
  'Client::BSMealLogged', 'Client::BSMessageComposer', 'Client::BSMoodSheet',
  'Client::BSNoraMemoryPage', 'Client::BSNoraProfile', 'Client::BSNoraProposal',
  'Client::BSNotifications', 'Client::BSNotifyPrefs', 'Client::BSOverallEditSheet',
  'Client::BSPlaylistCard', 'Client::BSPricingPage', 'Client::BSPrivacyPage',
  'Client::BSProfileCustomizer', 'Client::BSProfileIdentityHead', 'Client::BSProgChart',
  'Client::BSRecipeBox', 'Client::BSRecipePreview', 'Client::BSReconcile',
  'Client::BSRecordTrace', 'Client::BSReminderManager', 'Client::BSSaveButton',
  'Client::BSScoreCardDark', 'Client::BSSdTrace', 'Client::BSSearchCorner', 'Client::BSSession',
  'Client::BSSessionsScreen', 'Client::BSSleepHistory', 'Client::BSStepGoalSheet',
  'Client::BSStepsHistory', 'Client::BSStrengthCard', 'Client::BSStrengthHistory',
  'Client::BSSubprocessorsPage', 'Client::BSSwapSheet', 'Client::BSTermsPage',
  'Client::BSUniversalSearch', 'Client::BSVideoCall', 'Client::BSWeekendsCard',
  'Client::BSWeeklyCheckin', 'Client::BSWeeklyReadoutCard', 'Client::BSWeighInSheet',
  'Client::BSWorkoutBuilder', 'Client::BSWorkoutPreview', 'Main::BSAppShell',
  'Main::BSCosmicWordmark', 'Main::BSLogin', 'Main::BSPaywall', 'Main::BSPreviewBanner',
  'Main::BSSplash', 'Main::BSTweaksPanel', 'Main::BSWireHold', 'Main::BSWireLoading',
  'Pros::BSCoachGoalPlanPage', 'Pros::BSCoachPlaylistStudio', 'Pros::BSGoalEditSheet',
  'Pros::BSProMonthlyOfferSheet', 'Pros::BSProNotificationsPage', 'Pros::BSProPublicProfilePage',
  'ProviderApply::BSProviderApplicationScreen', 'Widgets::BSWidgetPicker',
  'Widgets::BSWidgetSlot', 'Widgets::WAdherence', 'Widgets::WBody', 'Widgets::WCalories',
  'Widgets::WFocus', 'Widgets::WHRV', 'Widgets::WLoad', 'Widgets::WMacros',
  'Widgets::WMeasurements', 'Widgets::WMicros', 'Widgets::WMood', 'Widgets::WPR',
  'Widgets::WProteinTiming', 'Widgets::WReadiness', 'Widgets::WRestingHR', 'Widgets::WSleep',
  'Widgets::WSoreness', 'Widgets::WSteps', 'Widgets::WStreak', 'Widgets::WVO2',
  'Widgets::WWater', 'Widgets::WWeight', 'Widgets::WZones', 'index::BSConfirmSheet',
]);

/** Has a translator AND still hardcodes copy — a partial rollout, not a missed one. */
const PARTIAL = new Set([
  'Calendar::BSEventConsultBody', 'Client::BSActivityCard', 'Client::BSClientEat',
  'Client::BSClientFeed', 'Client::BSClientHome', 'Client::BSCookMode', 'Client::BSGrocery',
  'Client::BSHomeWorkoutPreview', 'Client::BSLiveBoostSheet', 'Client::BSLogActivitySheet',
  'Client::BSMealPreview', 'Client::BSPostCommentsSheet', 'Client::BSPrepSession',
  'Client::BSProfileExtras', 'Client::BSProfilePlaylists', 'Client::BSScoreStandingChart',
  'Client::BSShapeKitchenRecipe', 'Client::BSSignalCoachProfile', 'Client::BSSplitsPage',
  'Client::BSTerrainProfile', 'Marketplace::BSCoachDetailPublic', 'Marketplace::MktCoachCard',
  'Marketplace::MktComboCard', 'Marketplace::MktRow', 'Pros::BSProClientPreviewPage',
  'Pros::BSProMe', 'Pros::BSProSoundtracks', 'Pros::BSWorkoutReviewPage',
  'Pros::ProWeekendPlate', 'Radio::BSNowPlayingMuted', 'Radio::BSRadioScreen',
  'Radio::BSShapeSetsScreen',
]);

// ── The measurement ─────────────────────────────────────────────────────────

test('the walk resolves the tree it claims to audit', () => {
  const rows = inventory();
  // Guard-the-guard: a detector that matched nothing would pass every assertion
  // below vacuously — the failure mode the search inventory shipped with once.
  assert.ok(rows.length > 300, `only ${rows.length} components resolved — the walk is broken, not the tree`);
  assert.ok(rows.filter((r) => r.tr > 0 && r.hard === 0).length > 80, 'no fully-covered components found — the tr() detector is broken');
  assert.ok(rows.filter((r) => r.tr === 0 && r.hard > 0).length > 0, 'no uncovered components found — the copy detector is broken');
});

test('MEASUREMENT — the numbers the record has to carry', () => {
  const rows = inventory();
  const full = rows.filter((r) => r.tr > 0 && r.hard === 0);
  const part = rows.filter((r) => r.tr > 0 && r.hard > 0);
  const none = rows.filter((r) => r.tr === 0 && r.hard > 0);
  console.log(`  rendering JSX ......... ${rows.length}`);
  console.log(`    fully covered ....... ${full.length}`);
  console.log(`    partial ............. ${part.length}  (${part.reduce((s, r) => s + r.hard, 0)} strings left)`);
  console.log(`    zero translator ..... ${none.length}  (${none.reduce((s, r) => s + r.hard, 0)} strings)`);
  console.log(`    no user copy ........ ${rows.length - full.length - part.length - none.length}`);
});

// ── The ratchet ─────────────────────────────────────────────────────────────

test('no NEW surface ships with no translator at all', () => {
  const fresh = inventory().filter((r) => r.tr === 0 && r.hard > 0 && !UNCOVERED.has(r.key));
  assert.deepEqual(
    fresh.map((r) => `${r.key} (${r.hard} strings)`),
    [],
    'a component renders user copy with no translator in scope. Wire useShapeTr() ' +
      '(or coachTr in the pros module), or — if it is genuinely deliberate — add it ' +
      'to UNCOVERED with the reason. Silence is what made the rollout claim false four times.',
  );
});

test('a localized surface must be removed from the baseline', () => {
  const rows = inventory();
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const stale = [];
  for (const key of UNCOVERED) {
    const r = byKey.get(key);
    // ⚠ FAILING ON PROGRESS IS THE POINT. A baseline nobody prunes is a list that
    // keeps asserting a gap that has been closed — the same stale-record class the
    // "COMPLETE" claim itself was. Deleting the line IS how progress gets recorded.
    if (!r) stale.push(`${key} — no longer exists (renamed or deleted): drop the line`);
    else if (r.tr > 0) stale.push(`${key} — now has a translator: drop the line`);
  }
  assert.deepEqual(stale, [], 'the uncovered baseline no longer describes the tree');
});

test('the partial set is pinned in both directions too', () => {
  const rows = inventory();
  const now = new Set(rows.filter((r) => r.tr > 0 && r.hard > 0).map((r) => r.key));
  const added = [...now].filter((k) => !PARTIAL.has(k)).sort();
  const gone = [...PARTIAL].filter((k) => !now.has(k)).sort();
  // A covered component that gains a hardcoded string lands in `added` — that is a
  // regression on a surface someone already paid to localize, and it is the one
  // the per-file count could never see.
  assert.deepEqual(added, [], 'a localized surface started hardcoding copy again (or a new partial appeared)');
  assert.deepEqual(gone, [], 'a partial surface finished or vanished — drop it from PARTIAL');
});
