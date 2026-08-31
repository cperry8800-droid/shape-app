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
  // 'Shape Wire' is the daily dispatch's product NAME (the masthead on the
  // telegram + the DOB gate), a sibling of Shape Radio/Store/Kitchen above — not
  // the descriptive 'The Shape Community', which IS localized (feed:chip.community
  // translates 'Community' in every locale, so leaving it literal would be drift).
  'Shape Wire',
  'Vol. 1 · No. 1', 'Nora', 'Spotify', 'Apple Music', 'Instacart', 'Strava', 'Whoop',
  // ⚠ 'WHOOP' AND 'Apple Health' ARE THE SAME NOUNS THE SET ALREADY CARRIES,
  // MISSED ON A CASE AND A SIBLING. BRAND.has() is exact, so the all-caps
  // spelling the company actually uses never matched 'Whoop', and 'Apple Health'
  // never matched its sibling 'Apple Music'. That is the hr/HR artifact recorded
  // at NOTATION below, one set up. Both are provably literal: all twelve
  // settings:integrations translations authored in cut 9 keep them verbatim.
  // ⚠ MEASURED BEFORE WIDENING, all four combinations of old/new ratchet ×
  // old/new source: on the PRE-CUT tree the widening moves 2 strings out of the
  // uncovered bucket (1103 -> 1101) and NO component; on the post-cut tree it is
  // what lets BSIntegrationsPage land fully covered instead of PARTIAL over two
  // nouns nobody translates. Zero blast radius anywhere else.
  'WHOOP', 'Apple Health',
  'Oura', 'Garmin', 'RPE', 'e1RM', 'kcal', 'KCAL', 'BPM', 'HR', 'HRV', 'GPS', 'PR', 'PRS',
  'Aa', 'KB', 'MB', 'GB',
]);

// Comparison operands are TOKENS, never rendered: `typeof x === 'string'`,
// `variant === 'plate'`. Counting them read four animation components and three
// shells as carrying untranslated copy.
const COMPARISON = new Set(['===', '!==', '==', '!=']);

// ⚠ UNITS AND NOTATION ARE NOT COPY. They clear the two-letter test and land in
// running text ('12 lb', 'in', '45 min'), so without this they read as
// untranslated strings on every stat surface in the tree. Normalized (trimmed,
// lowercased) so 'LB' and 'Min' fall out with 'lb' and 'min'.
// ⚠ A TOKEN IS EXCLUDED ONLY WHEN IT CANNOT ALSO BE AN ENGLISH WORD IN RUNNING
// COPY. A false exclusion hides real copy, which is the direction that makes this
// guard LIE; an under-exclusion only leaves a unit in the count, which reads as a
// slightly larger gap than there is. So 'in', 'am' and 'pm' are deliberately NOT
// here. Nor is 'hr' — case-folding it collided with 'HR' (heart rate) and silently
// dropped the only string BSSplitsPage still hardcodes; heart rate is a term of art
// and belongs in BRAND beside RPE/HRV/BPM, which is where it now sits.
const NOTATION = new Set(['lb', 'lbs', 'kg', 'ms', 'px', 'ft', 'cm', 'mm', 'oz', 'ml', 'min', 'sec']);

// Props whose string value is READ ALOUD or rendered. Everything else a string can
// land in — styles, classes, keys, colors, ids — is not copy.
//
// ⚠ THE SECOND ROW IS THIS CODEBASE'S OWN CHROME, AND LEAVING IT OUT WAS THE
// MEASUREMENT'S LARGEST REMAINING BLIND SPOT. The first row is the platform's
// vocabulary; but Shape's page furniture takes its copy through `kicker`
// (BSDetailHeader · BSPageHeader · BSSection · BSTrackHeader · BSPlaylistCard),
// `eyebrow` (SecHead · DarkSection), `meta` (BSSection · BSOLRow ·
// BSTStationHead), plus `sub`, `note`, `credit`, `helper` and `action`. Those are
// page kickers, section eyebrows and station metas — member-facing copy that a
// string moved out of JSX text and into a prop hid from this walk entirely.
// Each name was verified against the component that RECEIVES it: destructured and
// rendered, not held as a token. (`kind`, `variant`, `active`, `style`, `tone`,
// `role`, `pattern`, `idKey` carry string literals too and are deliberately
// absent — those ARE tokens.)
//
// ⚠ `left` AND `right` ARE DELIBERATELY EXCLUDED, and the reason is which way the
// error runs. All 37 of their string literals go to <BSFooter>, whose entire body
// is `return null` — so counting them would add 37 phantom untranslated strings
// for copy no member can ever see. Everywhere else this file errs toward
// over-counting, because a false exclusion HIDES real copy; here the inclusion is
// what would lie, by inflating the gap with dead markup.
const TEXT_PROPS = new Set([
  'placeholder', 'title', 'alt', 'aria-label', 'ariaLabel', 'label', 'aria-valuetext',
  'kicker', 'eyebrow', 'meta', 'sub', 'note', 'credit', 'helper', 'action',
]);

// ⚠ DERIVE THE TRANSLATOR BINDINGS, DON'T ENUMERATE A NAMING CONVENTION.
// The first version matched `/^(tr|[a-z]\w*Tr)$/` — a guess at what a translator
// is called, wearing a pattern. It missed `const trG = useShapeTr()` in BSGrocery
// (CodeRabbit on #1954), and it counted the hook call `useShapeTr()` itself as a
// translator call, so a component that took the hook and never used it read as
// covered. Both are the same defect: asking how a name is SPELLED instead of what
// it is BOUND TO. So each file's translator names are read off the bindings:
//   · `const tr = useShapeTr()`        — the 114 ordinary call sites
//   · `const trG = useShapeTr()`       — BSGrocery, invisible to the regex
//   · `const { tr } = useTr('ns')`     — BSDobGate / BSLanguagePicker
// plus the pros module's module-scope non-hook `coachTr` (the roster helpers
// cannot hold a hook, so it is a plain function, bound to no hook call).
const USE_TR = /^use\w*Tr$/;
const FN = new Set(['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration', 'ObjectMethod', 'ClassMethod']);
// ⚠ TWO MODULE-SCOPE TRANSLATORS, BOTH FOR THE SAME REASON: their callers cannot
// hold a hook. `coachTr` serves the pros module's roster helpers (plain functions,
// #1746); `bsBoundaryT` serves BSErrorBoundary, a CLASS mounted outside
// I18nextProvider. Without these names a component that routes every string
// through one reads as having no translator at all — and if the string count then
// falls to zero it reads as rendering no copy, which is the worse of the two
// wrong answers: it drops out of the baseline entirely instead of merely sitting
// in it.
const MODULE_SCOPE_TRANSLATORS = ['coachTr', 'bsBoundaryT'];

/** Every identifier in one file that holds a translator. */
function translatorNames(ast) {
  const names = new Set(MODULE_SCOPE_TRANSLATORS);
  walk(ast.program, (n) => {
    if (n.type !== 'VariableDeclarator') return true;
    const init = n.init;
    if (init?.type !== 'CallExpression' || init.callee?.type !== 'Identifier'
      || !USE_TR.test(init.callee.name)) return true;
    if (n.id?.type === 'Identifier') names.add(n.id.name);
    else if (n.id?.type === 'ObjectPattern') {
      for (const pr of n.id.properties) {
        if (pr.type === 'ObjectProperty' && pr.value?.type === 'Identifier') names.add(pr.value.name);
      }
    }
    return true;
  });
  return names;
}

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

/** Two consecutive letters, and neither a brand noun nor a unit. */
function usable(v) {
  if (!v || !LETTERS.test(v)) return false;
  const t = v.trim();
  return !BRAND.has(t) && !NOTATION.has(t.toLowerCase());
}

/** Walk one file and return { name, tr, hard } for every component that renders JSX. */
function componentsOf(file) {
  return componentsOfSource(fs.readFileSync(path.join(DIR, file), 'utf8'));
}

// ⚠ SPLIT FROM THE FILE READ SO THE RULES CAN BE PINNED ON SOURCE THE TREE DOES
// NOT HAPPEN TO CONTAIN. The parameter-shadow prune below was pinned through the
// two real instances until both were renamed; a rule that can only be tested
// while the tree carries an example stops being tested the moment it is fixed.
function componentsOfSource(src) {
  const ast = babelParser.parse(src, { sourceType: 'module', plugins: ['jsx'] });
  const isTr = translatorNames(ast);
  const out = [];

  // Top-level `function Name()` / `const Name = () =>` / `class Name` with a
  // Capitalized name — reached THROUGH an `export` wrapper when there is one.
  // ⚠ AN EXPORT WRAPPER USED TO HIDE A WHOLE FILE. `export default function
  // BSDobGate()` parses as an ExportDefaultDeclaration whose `declaration` is
  // the FunctionDeclaration, and the old loop matched on the BODY node's type —
  // so BSDobGate.jsx and BSLanguagePicker.jsx, both single-component files whose
  // only component is exported that way, appeared in NEITHER baseline. Not a
  // miscount: they were absent from the measurement entirely, which is the one
  // failure a ratchet cannot report, because a component it never sees can
  // neither be new nor stale.
  // ⚠ AND A CLASS COMPONENT WAS INVISIBLE FOR THE SAME REASON, one node type
  // over: BSErrorBoundary is a ClassDeclaration, so its live copy was never
  // attributed to anything. It is exactly the component whose strings a member
  // reads when the app has already failed them.
  const decls = [];
  const collect = (node) => {
    if (node.type === 'FunctionDeclaration' && node.id && /^[A-Z_]/.test(node.id.name)) {
      decls.push({ name: node.id.name, node });
    } else if (node.type === 'ClassDeclaration' && node.id && /^[A-Z_]/.test(node.id.name)) {
      // The class node itself, so the walk reaches render()'s JSX. FN already
      // covers ClassMethod, so the parameter-shadow prune still applies.
      decls.push({ name: node.id.name, node });
    } else if (node.type === 'VariableDeclaration') {
      for (const d of node.declarations) {
        const fn = d.init && (d.init.type === 'ArrowFunctionExpression' || d.init.type === 'FunctionExpression');
        if (fn && d.id?.type === 'Identifier' && /^[A-Z_]/.test(d.id.name)) {
          decls.push({ name: d.id.name, node: d });
        }
      }
    }
  };
  for (const node of ast.program.body) {
    // `export default X` and `export X` both wrap the declaration one level
    // deeper. An anonymous `export default () => {}` carries no name and stays
    // uncollectable by construction — nothing to attribute strings to.
    if (node.type === 'ExportDefaultDeclaration' || node.type === 'ExportNamedDeclaration') {
      if (node.declaration) collect(node.declaration);
    } else collect(node);
  }

  for (const d of decls) {
    let tr = 0, jsx = 0;
    const strings = new Set();
    // ⚠ WALK THE COMPONENT'S OWN NODE, never the Program with a range test. The
    // first version pruned on `n.start < d.start`, which is true of the Program
    // root itself (start 0) — so it skipped the entire tree and reported zero.
    // The guard-the-guard assertion below is what caught it.
    walk(d.node, (n, parent) => {
      // ⚠ A REFERENCE, NOT ONLY A CALL. `bsmRoleWord(tr, isNutri)` injects the
      // translator into a module-scope helper that cannot hold a hook — the
      // sanctioned pattern in this repo — so the component routes its copy
      // through `tr` while never calling it. Counting calls alone read the two
      // marketplace cards as having no translator at all. The binding site
      // itself (`const tr = useShapeTr()`) and property positions don't count.
      // ⚠ A PARAMETER NAMED `tr` IS NOT THE TRANSLATOR — the shadow class this
      // repo has already recorded once: `getTracks().forEach(tr => tr.stop())`
      // (a MediaStreamTrack) and `list.map((tr, i) => …)` in BSPlaylistCard. They
      // are inert at runtime precisely because those components hold no
      // translator — so counting the shadow read them as covered. Skip any
      // function that re-binds the name.
      if (FN.has(n.type) && (n.params || []).some((pp) => pp.type === 'Identifier' && isTr.has(pp.name))) return false;
      if (n.type === 'Identifier' && isTr.has(n.name)
        && !(parent?.type === 'VariableDeclarator' && parent.id === n)
        && !(parent?.type === 'MemberExpression' && parent.property === n && !parent.computed)
        && !(parent?.type === 'ObjectProperty' && parent.key === n && !parent.computed)) tr++;
      if (n.type === 'JSXElement' || n.type === 'JSXFragment') jsx++;
      if (n.type === 'JSXText') {
        const v = n.value.trim();
        if (usable(v)) strings.add(v);
      }
      if (n.type === 'StringLiteral' && usable(n.value)
        && parent?.type === 'JSXAttribute' && TEXT_PROPS.has(parent.name?.name)) strings.add(n.value);
      // ⚠ AN ALLOWLISTED PROP IS ALSO COPY WHEN ITS VALUE IS AN EXPRESSION, AND
      // MISSING THAT MADE THE ALLOWLIST BLIND TO ITS OWN HEADLINE MUTATION.
      // The branch above only fires when the literal's IMMEDIATE parent is the
      // JSXAttribute — true of `kicker="…"`, false of `kicker={'…'}`, where the
      // parent is this container. So the exact edit the allowlist exists to catch
      // (move a string out of a tr() call and into a braced prop) still passed,
      // as did every ternary and template value: `meta={live ? 'a' : 'b'}` and
      // ``eyebrow={`Week of ${n}`}`` are ordinary shapes in this tree.
      // containerStrings() is reused rather than re-derived because its pruning is
      // already right here: it steps over nested JSX and over CallExpression, so a
      // `kicker={tr('k', { defaultValue: 'v' })}` value stays COVERAGE and is never
      // counted as a hardcoded string.
      if (n.type === 'JSXExpressionContainer' && parent?.type === 'JSXAttribute'
        && TEXT_PROPS.has(parent.name?.name)) for (const v of containerStrings(n)) strings.add(v);
      if (n.type === 'JSXExpressionContainer' && (parent?.type === 'JSXElement' || parent?.type === 'JSXFragment')) {
        const tag = parent.openingElement?.name?.name;
        if (tag !== 'style' && tag !== 'script') for (const v of containerStrings(n)) strings.add(v);
      }
    });
    // Regenerating a baseline means knowing WHICH strings a surface still
    // hardcodes: `DUMP=BSGrocery node --test tests/i18n-surface-inventory.test.mjs`.
    if (process.env.DUMP === d.name) console.log(JSON.stringify({ name: d.name, tr, strings: [...strings] }, null, 1));
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
  'Client::BSCardSheetHost', 'Client::BSChatThread',
  'Client::BSClientGoals', 'Client::BSClientLibrary', 'Client::BSClientNextPlate',
  'Client::BSClientProgress', 'Client::BSCoachAdjustBanner',
  'Client::BSCodeOfConductPage', 'Client::BSCommitmentCard',
  'Client::BSConsumerHealthPage', 'Client::BSContactPage', 'Client::BSCrossoverCard',
  'Client::BSDataCompliancePage', 'Client::BSDayBriefPreview', 'Client::BSFacetAvatar',
  'Client::BSFindCoachBar', 'Client::BSFollowListSheet', 'Client::BSFollowSuggestions',
  'Client::BSGoalEditSheet', 'Client::BSGoalsContract',
  'Client::BSHeadlineEditSheet', 'Client::BSHealthIntake',
  'Client::BSHelpPage', 'Client::BSIntentStep',
  'Client::BSKitchenCard', 'Client::BSLeaderboard', 'Client::BSLegalActions',
  'Client::BSLibraryDetail', 'Client::BSLogActivity',
  'Client::BSMealLogged', 'Client::BSMessageComposer', 'Client::BSMoodSheet',
  'Client::BSNoraMemoryPage', 'Client::BSNoraProfile', 'Client::BSNoraProposal',
  'Client::BSNotifications', 'Client::BSNotifyPrefs', 'Client::BSOverallEditSheet',
  'Client::BSPlaylistCard', 'Client::BSPricingPage', 'Client::BSPrivacyPage',
  'Client::BSProfileCustomizer', 'Client::BSProfileIdentityHead', 'Client::BSProgChart',
  'Client::BSRecipeBox', 'Client::BSRecipePreview', 'Client::BSReconcile',
  'Client::BSRecordTrace', 'Client::BSReminderManager', 'Client::BSSaveButton',
  'Client::BSScoreCardDark', 'Client::BSSdTrace', 'Client::BSSearchCorner',
  'Client::BSSessionsScreen', 'Client::BSSleepHistory', 'Client::BSStepGoalSheet',
  'Client::BSStepsHistory', 'Client::BSStrengthCard', 'Client::BSStrengthHistory',
  'Client::BSSubprocessorsPage', 'Client::BSSwapSheet', 'Client::BSTermsPage',
  'Client::BSVideoCall', 'Client::BSWeekendsCard',
  'Client::BSWeeklyCheckin', 'Client::BSWeeklyReadoutCard', 'Client::BSWeighInSheet',
  // ⚠ SURFACED BY THE ATTRIBUTE-CONTAINER WALK, AND ITS ONE STRING IS AN ARIA
  // LABEL: BSSearchMsgBtn renders `aria-label={`Message ${name}`}` — invisible
  // while the walk only read direct attribute literals, so a screen-reader user
  // in Spanish hears the English verb. Registered rather than patched because
  // the honest fix is an ICU key carrying the name (`Message {name}`) authored
  // ×13 — a translation cut. Concatenating a reused verb onto the name is the
  // construction this repo already refused for ru/uk, so it is not the cheap fix
  // it looks like.
  // The launch/auth shell (BSSplash · BSWireLoading · BSWireHold · BSLogin ·
  // BSPaywall · BSPreviewBanner · BSAppShell) is localized; BSCosmicWordmark was
  // deleted (orphaned — no render site, no window export). BSTweaksPanel is the
  // developer Tweaks overlay, never shown to a member, so it stays uncovered
  // deliberately rather than shipping 15 dev-only strings to 13 locales.
  'Main::BSTweaksPanel',
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
  'Client::BSClientFeed', 'Client::BSClientHome', 'Client::BSClientTrain',
  'Client::BSCookMode',
  'Client::BSHomeWorkoutPreview', 'Client::BSLiveBoostSheet', 'Client::BSLogActivitySheet',
  'Client::BSMealPreview', 'Client::BSPostCommentsSheet', 'Client::BSPrepSession',
  'Client::BSProfileExtras', 'Client::BSProfilePlaylists', 'Client::BSScoreStandingChart',
  'Client::BSShapeKitchenRecipe', 'Client::BSSignalCoachProfile',
  // ⚠ BSSettings IS PARTIAL OVER A FORMAT EXAMPLE, NOT OVER COPY — 388 tr() calls
  // and exactly one hardcoded string: `placeholder={bsInitials(draft.name) || 'AB'}`,
  // the two-letter stand-in on the avatar-initials field. No locale changes it, for
  // the same reason none changes the shipped `+1 555 123 4567` phone example. It is
  // recorded here rather than special-cased in usable(), because excluding a single
  // spelling is the pin this file keeps paying for — and a false exclusion HIDES real
  // copy, which is the direction that makes the guard lie.
  'Client::BSSettings',
  'Client::BSTerrainProfile',
  'Marketplace::BSCoachDetailPublic', 'Marketplace::MktCoachCard',
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
  const partStrings = part.reduce((s, r) => s + r.hard, 0);
  const noneStrings = none.reduce((s, r) => s + r.hard, 0);
  console.log(`  rendering JSX ......... ${rows.length}`);
  console.log(`    fully covered ....... ${full.length}`);
  console.log(`    partial ............. ${part.length}  (${partStrings} strings left)`);
  console.log(`    zero translator ..... ${none.length}  (${noneStrings} strings)`);
  console.log(`    no user copy ........ ${rows.length - full.length - part.length - none.length}`);

  // ⚠ THE STRING TOTALS ARE THE ONE THING THE RATCHET CANNOT SEE. Membership is
  // pinned both ways by UNCOVERED/PARTIAL below — but a partial surface that
  // hardcodes ten MORE strings keeps its membership and passes. So the volumes
  // are asserted exactly: a change here is either progress (lower the number and
  // the record with it) or a regression, and both must be a deliberate edit.
  // Printed above first, so the failure message is never the only place to read them.
  // ⚠ CUT 5 (the Train path) moved four components, and only three of them are
  // arithmetic the ratchet can show you. BSBuildDoor and BSWorkoutPreview left
  // UNCOVERED fully covered; BSClientTrain left it PARTIAL, because the one
  // string it still hardcodes ("Playlists") is signed-out demo copy the house
  // deliberately does not translate — the same shape BSClientEat ended in.
  // So: noneStrings 1104 -> 1061, none.length 115 -> 112, part.length 31 -> 32,
  // partStrings 164 -> 165.
  // ⚠ THE FOURTH IS THE ONE WORTH READING. BSWeekStrip moved no-copy -> fully
  // covered without touching a single string count: its day letters live in an
  // ARRAY LITERAL, which the walk does not attribute to a component, so it read
  // `tr: 0, hard: 0` while rendering hardcoded English day letters on two
  // primary tabs. It was localized in this cut; the measurement can only see
  // the translator it gained. A component sitting at zero/zero is not evidence
  // it renders nothing — it is the blind spot cut 4 recorded, showing up in the
  // covered column this time.
  //
  // ⚠ noneStrings 1061 -> 1062 AND THE NUMBER WENT UP ON PURPOSE. The grocery
  // record-shape change moved 'Empty list' OUT of the saved list record and INTO
  // BSGroceryLibrary's render. Written into a member's record it was invisible to
  // this walk — and untranslatable, because a sentence saved at write time
  // freezes one language into their data. At the render the walk can finally see
  // it, so the count rises by exactly one while the product gets strictly better.
  // This is the BSWeekStrip blind spot in reverse: there a string was invisible
  // because it sat in an array literal; here because it sat in stored data.
  // ⚠ A number that goes UP is only honest beside the change that raised it.
  // ⚠ CUT 6 STEP 1 — THE AISLE TOKEN/LABEL SPLIT, AND THE MOVE IS ONE COMPONENT
  // WIDE ON PURPOSE. `aisle` is stored on every saved item, used as the grouping
  // key, matched against a freshly-classified aisle on every add, AND rendered as
  // a header — so it got cut 5's token/label treatment rather than a tr() sweep.
  // Only BSGroceryBuilder gained a translator by it (the pills and the per-item
  // line are the two places IT renders an aisle), so it moves UNCOVERED -> PARTIAL
  // carrying its own 17 hardcoded strings with it: noneStrings 1062 -> 1045,
  // none.length 112 -> 111, part.length 32 -> 33, partStrings 165 -> 182.
  // ⚠ BSGrocery's count does NOT move, and that is the tell that this is a data
  // change rather than a copy change: its aisle headers were never JSX literals,
  // they came out of the list record. The walk could not see them before and
  // cannot see them now — what changed is that they are translatable at all.
  // ⚠ CUT 6 STEP 2 — THE STRING SWEEP, AND ALL FOUR GROCERY COMPONENTS LAND
  // FULLY COVERED. BSGroceryLibrary (14) and BSCoachGroceryReview (5) leave
  // UNCOVERED; BSGrocery (31) and BSGroceryBuilder (17) leave PARTIAL; every one
  // of them reaches hard === 0. So: partStrings 182 -> 134, part.length 33 -> 31,
  // noneStrings 1045 -> 1026, none.length 111 -> 109, and full.length 99 -> 103.
  // ⚠ BSGrocery's `tr` COUNT DID NOT MOVE — it reads 2 before and after, while its
  // hardcoded count went 31 -> 0. The detector counts references to the translator
  // BINDING (`trG`), and this sweep calls through the injected wrapper `TG =
  // bsTrainT(trG)`, which is a derived local it does not recognise. `hard` is the
  // honest signal here, not `tr`. Worth knowing before reading a flat `tr` as a
  // component that was skipped: the two numbers answer different questions.
  // ⚠ AND ONE STRING IS DELIBERATELY LEFT: `groceryItem.meta` stays English,
  // because it is WRITTEN INTO the saved-library record, not rendered from it —
  // the record-shape rule this wave already paid for. It sits in a call argument,
  // so the walk never counted it and these numbers do not move either way; the
  // reason is written at the site and registered as its own cut.
  // ⚠ THE TEXT_PROPS WIDENING RAISED BOTH STRING TOTALS, AND A TOTAL THAT RISES IS
  // ONLY HONEST BESIDE THE CHANGE THAT RAISED IT — the mirror of this file's own
  // rule about never LOWERING one to make a red run pass. It landed in two legs:
  //   partStrings 134 -> 138 -> 164 · noneStrings 1026 -> 1109 -> 1181.
  // Leg 1, the allowlist itself: adding this codebase's own chrome props (see
  // TEXT_PROPS) surfaced 83 strings the walk could not see (+4 partial, +79
  // uncovered), plus 4 from renaming one local `Row`'s single-letter `l` prop to
  // `label` — those four notification-settings labels were always rendered copy,
  // and a one-letter name is not something to add to a shared copy allowlist.
  // No component changed bucket in leg 1: what was wrong was the volume.
  // Leg 2, walking allowlisted attributes whose value is an EXPRESSION, surfaced
  // a further 26 partial / 72 uncovered — and this one DID move surfaces, which
  // is why it is worth more than its numbers. BSSettings fell fully-covered ->
  // PARTIAL over a single initials placeholder, and BSSearchMsgBtn rose from
  // "no user copy" to UNCOVERED over an aria-label nobody could see; both are
  // registered in the baselines above with their reasons. full.length 103 -> 102
  // and the no-copy count 116 -> 115 follow from exactly those two moves.
  // ⚠ CUT 7 — THE UNIVERSAL SEARCH SURFACE, AND THE RATCHET MOVES BY LESS THAN THE
  // WORK. BSUniversalSearch (31) and BSSearchMsgBtn (1) leave UNCOVERED and
  // BSSearchFollowBtn joins them fully covered, so noneStrings 1181 -> 1149,
  // none.length 110 -> 108, full.length 102 -> 105 and the no-copy count 115 ->
  // 114. partStrings 164 and part.length 32 are UNCHANGED — the assertion that
  // certifies the cut is finished rather than half-done.
  // ⚠ BUT 32 IS A FLOOR, NOT THE WORK, AND ONE SCREEN CARRIED ALL THREE SHAPES
  // THE WALK CANNOT SEE AT ONCE: four filter labels in an ARRAY LITERAL
  // (`[['all','All'], …].map`), three role nouns in a LOCAL ARROW FUNCTION
  // (`const roleLabel = (r) => …`), and three follow-state words in a LOCAL
  // CONST TERNARY rendered as `{label}`. Ten member-facing words, invisible.
  // BSSearchFollowBtn is the sharpest case: it read `tr: 0, hard: 0` — the
  // detector's way of saying "renders no user copy" — while showing an English
  // Follow / Following / Requested in thirteen locales. Its localization moves
  // no string count at all; it only moves out of the no-copy bucket. This is
  // cut 5's BSWeekStrip lesson at a third site: a component sitting at zero/zero
  // is not evidence that it renders nothing.
  // ⚠ AND THE COUNT IS NOT A COUNT OF SENTENCES EITHER. The possessive aria-label
  // `Open ${p.name}'s profile` was two entries in the dump — "Open" and
  // "'s profile" — because a template literal splits at its placeholder. One
  // sentence, two strings; it is now one ICU key so each locale can move the
  // words (de "Profil von {name} öffnen", ru "Открыть профиль: {name}").
  // ⚠ CUT 8 — THE SELF-SERVE WORKOUT BUILDER. BSWorkoutBuilder (46) leaves
  // UNCOVERED fully covered, so noneStrings 1149 -> 1103, none.length 108 -> 107
  // and full.length 105 -> 106. partStrings 164 and part.length 32 are UNCHANGED
  // for the second cut running — the assertion that the cut is finished.
  // ⚠ AND 46 IS AGAIN A FLOOR RATHER THAN THE WORK: the cut authored 60 keys.
  // Eight are the discipline chips and three the experience chips, both declared
  // as MODULE-SCOPE ARRAY LITERALS the walk cannot attribute (cut 7's first
  // invisible shape), and six more are plain-JS toast and status strings the walk
  // never sees at all (cut 2's lesson). Splitting those chips into a canonical
  // token + a translated label therefore moves NO string count — the same
  // no-movement signature BSWeekStrip and BSSearchFollowBtn carry.
  // ⚠ THE SPLIT IS ABOUT THE WIRE, NOT A RECORD, which is narrower than cuts 5
  // and 6 and worth stating so nobody widens it by analogy: bsRepeatSpec and
  // bsMaterializeProgram both destructure `discipline` and never use it, so the
  // token is not persisted anywhere. What it DOES do is cross the wire to
  // /api/ai/draft-program as the model's prompt input, so a tr() on the chip's
  // value would have sent a translated word to the model in twelve locales.
  // ⚠ CUT 9 — THE INTEGRATIONS PAGE. BSIntegrationsPage (40) leaves UNCOVERED
  // fully covered, so noneStrings 1103 -> 1063, none.length 107 -> 106 and
  // full.length 106 -> 107. partStrings 164 and part.length 32 are UNCHANGED for
  // the third cut running.
  // ⚠ AND 40 IS THE WORST FLOOR THIS WAVE HAS RECORDED — the real surface is
  // about SEVENTY-FOUR strings, and the gap is four shapes at once. Seventeen
  // toast sentences and three confirm/error strings are PLAIN JS the walk never
  // enters. Eight provider eyebrows rode an `id=` prop that is not on TEXT_PROPS
  // — and must never be added to it, because `id` is an HTML identifier
  // tree-wide; the prop was RENAMED to `eyebrow` at its receiving component
  // instead, which is #1968's `l` -> `label` move at a second site. Three
  // statCards labels sit in a local array literal. The cut authored 57 keys.
  // ⚠ THE CUT ALSO CLOSED A TOKEN/LABEL DEFECT OF THE TRAIN-TAG CLASS, AT A
  // THIRD SITE. runAction() recovered the provider's name by regexing the
  // English word out of its own toast label — `label.replace(/\bdisconnected\b/i,'')`
  // — so the confirm dialog's subject was DERIVED FROM COPY. A tr() on that
  // label stops the regex matching in all twelve non-English locales and the
  // dialog degrades to "this app", silently, with every gate green. The name is
  // data now: it comes from the provider row and is passed explicitly.
  assert.equal(partStrings, 164, 'the partial surfaces changed how much they hardcode — update the number AND docs/WORKLOG.md');
  assert.equal(noneStrings, 1063, 'the untranslated surfaces changed how much they hardcode — update the number AND docs/WORKLOG.md');
  assert.equal(part.length, 32, 'partial-surface count moved — regenerate PARTIAL and the record');
  assert.equal(none.length, 106, 'untranslated-surface count moved — regenerate UNCOVERED and the record');
  // Floors, not equalities: a new component with a translator and no copy of its
  // own moves both of these without changing anything this file is about.
  // ⚠ The JSX floor dropped 358 → 357 when BSCosmicWordmark — an orphaned
  // wordmark with no render site and no window export — was deleted with the
  // five unreachable BSSplash style branches. Lowering a floor is only ever
  // honest alongside the deletion that caused it; it must never be lowered to
  // make a failing run pass.
  // ⚠ The floor rose 357 → 360 when the collector learned to unwrap `export`
  // wrappers and to collect ClassDeclaration. NOTHING WAS BUILT — BSDobGate,
  // BSLanguagePicker and BSErrorBoundary have rendered JSX the whole time; the
  // walk simply never saw them. A floor RISING alongside a widening is the
  // mirror of the rule above: it is honest only next to the change that caused
  // it, and it may never be raised to make a stale number look better.
  // ⚠ And it fell 360 → 359 when BSNightSky was deleted — the cosmos-splash
  // background cut 1 orphaned, unreachable since that branch died. It rendered
  // only aria-hidden decoration, so it sat in the no-copy bucket: every string
  // count, the covered count and both baselines are unchanged by its removal.
  assert.ok(rows.length >= 359, `components rendering JSX fell to ${rows.length} — expected at least 359`);
  assert.ok(full.length >= 95, `fully-localized components fell to ${full.length} — expected at least 95`);
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
    // ⚠ AND A SURFACE THAT STOPPED RENDERING COPY IS JUST AS STALE. Without this
    // an entry whose strings all moved out (or became brand nouns) keeps asserting
    // a gap that no longer exists — the ratchet vouching for code that has moved.
    else if (r.hard === 0) stale.push(`${key} — renders no user copy any more: drop the line`);
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

// ── The detector's own regression cases ─────────────────────────────────────
// ⚠ EVERY ONE OF THESE IS A REAL SHAPE THE FIRST VERSION GOT WRONG, pinned
// against the SHIPPED files rather than a fixture — the question is what the
// detector does with this tree, not what a comment claims about it.

test('the translator is found by what it is BOUND TO, not how it is spelled', () => {
  const names = translatorNames(babelParser.parse(
    `const tr = useShapeTr();\nconst trG = useShapeTr();\nconst { tr: t2 } = useTr('onboarding');\nconst notTr = somethingElse();`,
    { sourceType: 'module', plugins: ['jsx'] },
  ));
  assert.ok(names.has('tr'), 'the ordinary binding');
  assert.ok(names.has('trG'), 'BSGrocery names it trG — the regex that guessed at spelling missed it');
  assert.ok(names.has('t2'), 'destructured from useTr()');
  assert.ok(names.has('coachTr'), 'the pros module binds no hook — its translator is a plain function');
  assert.ok(!names.has('notTr'), 'a Tr-suffixed name bound to anything else is not a translator');
  assert.ok(!names.has('useShapeTr'), 'the HOOK is not the translator — counting it read a component that took it and never used it as covered');
});

// ⚠ AN EXPORT WRAPPER AND A CLASS ARE PINNED ON A FIXTURE, FOR THE REASON THE
// PRUNE BELOW SPELLS OUT. The tree today carries exactly three of these — two
// `export default function` files and one class — so pinning the rule through
// them would retire it the moment someone rewrites one. The fixture also covers
// the two shapes the tree does NOT contain (`export function`, `export const`,
// `export default class`), which is the whole point of collecting through the
// wrapper rather than listing the wrappers that happen to exist.
test('an export wrapper does not hide a component, and a class is a component', () => {
  // ⚠ ONE DEFAULT EXPORT PER MODULE, so each default shape gets its own fixture
  // — the first cut of this guard put three in one string and died on a parse
  // error, which at least failed loudly rather than passing over source that is
  // not JavaScript.
  const named = new Map(componentsOfSource(`
    export function ExportedNamed() { return <div>Named copy</div>; }
    export const ExportedConst = () => <div>Const copy</div>;
    class PlainClass extends React.Component {
      render() { return <div>Plain class copy</div>; }
    }
  `).map((r) => [r.name, r]));
  for (const n of ['ExportedNamed', 'ExportedConst', 'PlainClass']) {
    assert.ok(named.has(n), `${n} must be collected — an export wrapper is not a hiding place`);
  }
  assert.equal(named.get('PlainClass').hard, 1, "a class component's copy lives in render() — it must be counted, not skipped");

  const [fn] = componentsOfSource('export default function ExportedDefault() { return <div>Default copy</div>; }');
  assert.equal(fn?.name, 'ExportedDefault', 'export default function — the shape that hid BSDobGate and BSLanguagePicker');
  assert.equal(fn.hard, 1, 'and its copy is attributed, not merely its name');

  const [cls] = componentsOfSource(`
    export default class ExportedClass extends React.Component {
      render() { return <div>Class copy</div>; }
    }
  `);
  assert.equal(cls?.name, 'ExportedClass', 'export default class — both wrappers at once');
  assert.equal(cls.hard, 1);

  // ⚠ ANONYMOUS STAYS UNCOLLECTABLE, and that is a property of the source rather
  // than a hole in the walk: `export default () => …` carries no name, so there
  // is nothing to attribute the string to and nothing a baseline could pin. A
  // component that wants to be measured has to be nameable.
  assert.deepEqual(componentsOfSource('export default () => <div>Anonymous copy</div>;'), [],
    'an anonymous default export has no name to attribute copy to');
});

test('the shipped tree answers the way the derivation claims', () => {
  const byKey = new Map(inventory().map((r) => [r.key, r]));
  // BSGrocery reaches the translator only as `trG` — the CodeRabbit finding.
  assert.ok(byKey.get('Client::BSGrocery').tr > 0, 'BSGrocery holds a translator (trG) and must not read as uncovered');
  // The two marketplace cards never CALL tr — they inject it into a module-scope
  // helper that cannot hold a hook. A call-only count read them as uncovered.
  // Exactly one: the `tr` handed to bsmRoleWord. The BINDING (`const tr = …`) and
  // the HOOK NAME are not references to a translator — a spelling-matcher counts
  // both and reads 2, which is how a wrong rule hides inside a right answer.
  assert.equal(byKey.get('Marketplace::MktCoachCard').tr, 1, 'an injected translator counts once — the binding and the hook do not');
});

// ⚠ THE PARAMETER-SHADOW PRUNE IS PINNED ON A FIXTURE, NOT ON THE TREE. It used
// to be pinned through the two real instances — `getTracks().forEach(tr => tr.stop())`
// (a MediaStreamTrack) and `list.map((tr, i) => …)` in BSPlaylistCard (a playlist
// track). Both were renamed to `track` while localizing the session player and the
// meal logger, so those assertions stopped testing the rule: those components now
// read 0 because they hold no translator at all, and would read 0 with the prune
// deleted. A rule only tested while the tree happens to contain a violation is a
// rule that retires itself the moment someone fixes the violation — which is this
// file's own 'a wrong rule hiding inside a right answer' trap, one layer up.
test('a parameter named like a translator is not the translator', () => {
  const rows = componentsOfSource(`
    const BSFixtureCovered = () => {
      const tr = useShapeTr();
      return <div>{tr('ns:key', { defaultValue: 'Hello there' })}</div>;
    };
    const BSFixtureShadow = ({ stream, list }) => {
      stream.getTracks().forEach((tr) => tr.stop());
      return <ul>{list.map((tr, i) => <li key={i}>{tr.label}</li>)}</ul>;
    };
  `);
  const byName = new Map(rows.map((r) => [r.name, r]));
  // The POSITIVE CONTROL is what stops this passing vacuously: `tr` reaches
  // `isTr` only because something in the source binds it from a use*Tr() hook —
  // exactly as the real module does. Without it both rows would read 0 for the
  // uninteresting reason that the detector never considered the name at all.
  assert.equal(byName.get('BSFixtureCovered').tr, 1, 'the call counts; the binding site does not');
  assert.equal(byName.get('BSFixtureShadow').tr, 0, 'a function that re-binds the name shadows it — the params and their uses are not the translator');
});
