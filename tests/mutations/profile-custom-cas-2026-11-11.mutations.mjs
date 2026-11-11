// Mutation spec for compare-and-set across every profile_custom writer (owner, 2026-11-11, on #2707: "Merge
// now, CAS later"): each mutation undoes one guard, and the suites below must fail on every one.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/profile-custom-cas-2026-11-11.mutations.mjs --fail-on-skipped
const PC = 'public/newdesign/profileCustom.mjs';
const DK = 'public/newdesign/livingDesktop.jsx';
const MIY = 'mobile-app/src/broadsheet/BSMakeItYours.jsx';
const CUST = 'mobile-app/src/broadsheet/BSProfileCustomizer.jsx';
const SYNC = 'public/newdesign/settingsSync.mjs';
const NORA = 'src/lib/ai/accountSetup.mjs';

export default {
  test: 'node --test tests/profile-custom-cas.test.mjs tests/profile-identity-web.test.mjs tests/coach-public-stats.test.mjs tests/nora-account-setup.test.mjs tests/settings-sync.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // The helper.
    { name: 'the write does not move the rev on', file: PC,
      find: '      const next = { ...made, rev: bsProfileRev(cur) + 1 };',
      replace: '      const next = { ...made, rev: bsProfileRev(cur) };' },
    { name: 'a conflict is taken as saved', file: PC,
      find: '      if (res && res.conflict) continue;',
      replace: '      if (res && res.conflict) return { ok: true, doc: next };' },
    { name: 'the write compares on no rev', file: PC,
      find: '        ? await db.saveUserGoalsIfRev(BS_PROFILE_CUSTOM_KIND, next, bsProfileRevToken(cur), uid)',
      replace: '        ? await db.saveUserGoalsIfRev(BS_PROFILE_CUSTOM_KIND, next, null, uid)' },
    { name: 'the read is not bound to the account', file: PC,
      find: '      const cur = given !== undefined ? given : await db.getUserGoals(BS_PROFILE_CUSTOM_KIND, { expectedUserId: uid });',
      replace: '      const cur = given !== undefined ? given : await db.getUserGoals(BS_PROFILE_CUSTOM_KIND);' },
    { name: 'a read that failed writes over the doc', file: PC,
      find: "      if (!cur || typeof cur !== 'object' || Array.isArray(cur)) return { ok: false, reason: 'unreadable' };\n",
      replace: '' },
    { name: "the caller's read is used on every try", file: PC,
      find: '      given = undefined;\n',
      replace: '' },
    { name: 'the fallback upsert is not bound to the account', file: PC,
      find: '        : await db.saveUserGoals(BS_PROFILE_CUSTOM_KIND, next, { expectedUserId: uid });',
      replace: '        : await db.saveUserGoals(BS_PROFILE_CUSTOM_KIND, next, {});' },
    { name: 'an account switch reads as a failed write', file: PC,
      find: "      if (res && res.accountChanged) return { ok: false, reason: 'account-changed', error: res.error };\n",
      replace: '' },
    // The writers.
    { name: 'the website editor merges over the doc it first read', file: DK,
      find: '      const doc = dkMergeProfileFields(base, fields, openedFields.current);',
      replace: '      const doc = dkMergeProfileFields(stored, fields, openedFields.current);' },
    { name: 'Make it yours puts its changes over the doc it first read', file: MIY,
      find: "      (stored) => bsNormalizeProfileCustom(withChanges(stored), uid,",
      replace: "      (stored) => bsNormalizeProfileCustom(withChanges(base), uid," },
    { name: 'Customize puts its area over the doc it first read', file: CUST,
      find: '      const doc = { ...base, ...areaFields(key, form) };',
      replace: '      const doc = { ...stored, ...areaFields(key, form) };' },
    { name: "settingsSync's links upsert the profile doc", file: SYNC,
      find: '  if(kind===BS_PROFILE_CUSTOM_KIND) {',
      replace: '  if(false) {' },
    { name: "Nora's account setup leaves the rev as it was", file: NORA,
      find: '        data.rev = bsProfileRev(row ? row.data : null) + 1;\n',
      replace: '' },
  ],
};
