// Mutation spec for where a checkout that didn't start sends the visitor, and the shell's line for
// it (pageShell.jsx, "Checkout notices"). A form missing its coach went to `/?error=invalid_…`,
// which the root redirect drops, and the membership detour's Cancel came back with no code; either
// way the visitor heard nothing. Every mutation must be killed. Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/checkout-returns-2026-10-30.mutations.mjs --fail-on-skipped
const PURCHASE = 'src/app/purchase/actions.ts';
const SUBSCRIBE = 'src/app/subscribe/actions.ts';
const DETOUR = 'src/lib/membership-detour.ts';
const SHELL = 'public/newdesign/pageShell.jsx';

const spec = {
  test: 'node --test tests/checkout-notice.test.mjs tests/membership-first.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // ── Where it comes back ──
    { name: 'a purchase form missing its coach goes to the homepage again', file: PURCHASE,
      find: "redirect('/newdesign/Coaches.html?error=invalid_purchase');",
      replace: "redirect('/?error=invalid_purchase');" },
    { name: 'a subscribe form missing its coach goes to the homepage again', file: SUBSCRIBE,
      find: "redirect('/newdesign/Coaches.html?error=invalid_subscribe');",
      replace: "redirect('/?error=invalid_subscribe');" },
    { name: 'the detour\'s Cancel comes back with no code', file: DETOUR,
      find: 'cancelPath: `${backHref}&error=membership_cancelled`',
      replace: 'cancelPath: backHref' },
    { name: 'the detour\'s Cancel comes back with a code nothing reads', file: DETOUR,
      find: 'cancelPath: `${backHref}&error=membership_cancelled`',
      replace: 'cancelPath: `${backHref}&error=membership_canceled`' },

    // ── The lines ──
    { name: 'the shell has no line for a cancelled membership checkout', file: SHELL,
      find: "  membership_cancelled: [\"info\", \"Membership checkout cancelled, so coaching didn't start. Nothing was charged.\"],\n",
      replace: '' },
    { name: 'a cancelled membership checkout reads as an alert', file: SHELL,
      find: "  membership_cancelled: [\"info\",",
      replace: "  membership_cancelled: [\"error\"," },
    { name: 'the shell has no line for an incomplete purchase form', file: SHELL,
      find: "  invalid_purchase: [\"error\", \"That checkout didn't say which coach or plan, so it didn't start. Nothing was charged. Choose the coach again.\"],\n",
      replace: '' },
    { name: 'the shell has no line for an incomplete subscribe form', file: SHELL,
      find: "  invalid_subscribe: [\"error\", \"That checkout didn't say which coach, so it didn't start. Nothing was charged. Choose the coach again.\"],\n",
      replace: '' },
  ],
};

// ── 2026-11-10: hiring a coach no longer detours through the $5 checkout (owner: an account is free), so the detour has no Cancel of its own; the two mutations on it go, and one holds that it never comes back ──
const RETARGET = {
};
const DROP = ["the detour's Cancel comes back with no code", "the detour's Cancel comes back with a code nothing reads"];
const ADDED = [
  { name: "the detour opens the $5 checkout again", file: DETOUR,
    find: "  if (membership.isKnownMinor) return `${backHref}&error=age_restricted`;\n  return null;",
    replace: "  if (membership.isKnownMinor) return `${backHref}&error=age_restricted`;\n  if (!membership.isMember) return `${backHref}&error=membership_required`;\n  return null;" },
];
spec.mutations = [...spec.mutations.filter((m) => !DROP.includes(m.name)).map((m) => (RETARGET[m.name] ? { ...m, ...RETARGET[m.name] } : m)), ...ADDED];
export default spec;
