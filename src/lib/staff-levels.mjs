// src/lib/staff-levels.mjs
//
// Who on the Shape team can open what in the admin console (/admin). Pure: no I/O, so the rules
// are tested directly (tests/admin-console.test.mjs) and the server code only asks them.
//
// THE LEVELS, lowest to highest. Each level opens everything the levels below it open.
//   analyst  the Overview (Shape's totals, no one person's numbers)
//   support  + each coach's and each member's progress, one account's page, freezing and
//            unfreezing an account, the members' account requests, and the help desk
//   admin    + suspending a coach listing, removing an account, every other admin tool
//            (applications, credentials, refunds, claim, Nora's library, the War Room and
//            Mission Control) and the activity log
//   owner    + the Staff page: adding, changing and removing staff
//
// WHERE A LEVEL COMES FROM (resolveStaffLevel):
//   owner    the owner's own addresses, named in code (src/lib/admin-access.ts). Never a row in
//            staff_members, so nobody can add, demote or remove an owner from the console.
//   admin    an address in the ADMIN_EMAILS setting (how admins were added before the console).
//   any      a staff_members row (admin, support or analyst), added on the Staff page.
// The highest of these wins, and nothing counts until Supabase has confirmed the address.

export const STAFF_LEVELS = ['analyst', 'support', 'admin', 'owner'];
export const ASSIGNABLE_LEVELS = ['admin', 'support', 'analyst'];

export const LEVEL_LABELS = { owner: 'Owner', admin: 'Admin', support: 'Support', analyst: 'Analyst' };

export const LEVEL_SUMMARIES = {
  owner: 'Everything, including adding and removing staff.',
  admin: 'Everything except managing staff, including suspending listings and removing accounts.',
  support: 'The Overview, each coach’s and member’s progress, freezing accounts, account requests and the help desk.',
  analyst: 'The Overview only.',
};

export function levelRank(level) {
  return STAFF_LEVELS.indexOf(level);
}

/** True when `level` opens what `min` opens. An unknown or missing level opens nothing. */
export function atLeast(level, min) {
  // An unknown level ranks -1, below every requirement; an unknown requirement opens for nobody.
  const need = levelRank(min);
  return need >= 0 && levelRank(level) >= need;
}

function lowerList(list) {
  return (Array.isArray(list) ? list : []).map((e) => String(e || '').trim().toLowerCase()).filter(Boolean);
}

/**
 * The level an account holds, or null. `tableLevel` is its staff_members row's level (or
 * null); `ownerEmails` and `adminEmails` are the code's owners and the ADMIN_EMAILS setting.
 */
export function resolveStaffLevel({ email, confirmed, ownerEmails, adminEmails, tableLevel } = {}) {
  const e = String(email || '').trim().toLowerCase();
  if (!e || !confirmed) return null;
  const found = [];
  if (lowerList(ownerEmails).includes(e)) found.push('owner');
  if (lowerList(adminEmails).includes(e)) found.push('admin');
  if (ASSIGNABLE_LEVELS.includes(tableLevel)) found.push(tableLevel);
  if (!found.length) return null;
  return found.reduce((best, l) => (levelRank(l) > levelRank(best) ? l : best));
}

/** The console's own pages, each with the lowest level that opens it. */
export const CONSOLE_PAGES = [
  { href: '/admin', label: 'Overview', min: 'analyst' },
  { href: '/admin/coaches', label: 'Coaches', min: 'support' },
  { href: '/admin/members', label: 'Members', min: 'support' },
  { href: '/admin/requests', label: 'Account requests', min: 'support' },
  { href: '/dashboard/support', label: 'Help requests', min: 'support' },
  { href: '/admin/activity', label: 'Activity log', min: 'admin' },
  { href: '/admin/staff', label: 'Staff', min: 'owner' },
];

/** The admin tools that predate the console, all admin and up. */
export const ADMIN_TOOLS = [
  { href: '/dashboard/applications', label: 'Applications' },
  { href: '/dashboard/credentials', label: 'Credentials' },
  { href: '/dashboard/refunds', label: 'Refunds' },
  { href: '/dashboard/claim', label: 'Claim profile' },
  { href: '/dashboard/radio', label: 'Nora’s library' },
  { href: '/warroom', label: 'War Room' },
  { href: '/console', label: 'Mission Control' },
];

export function pagesFor(level) {
  return CONSOLE_PAGES.filter((p) => atLeast(level, p.min));
}

export function toolsFor(level) {
  return atLeast(level, 'admin') ? ADMIN_TOOLS : [];
}

/** Whether `level` opens the console page or admin tool at `href` (an unlisted href: no). */
export function canOpen(level, href) {
  const page = CONSOLE_PAGES.find((p) => p.href === href);
  if (page) return atLeast(level, page.min);
  return ADMIN_TOOLS.some((t) => t.href === href) && atLeast(level, 'admin');
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A typed address, trimmed and lowercased, or '' when it is not an address. */
export function cleanStaffEmail(value) {
  const e = String(value ?? '').trim().toLowerCase();
  return e.length <= 254 && EMAIL_RE.test(e) ? e : '';
}

/** A level the Staff page may give, or ''. 'owner' is never one. */
export function parseAssignableLevel(value) {
  const l = String(value ?? '').trim().toLowerCase();
  return ASSIGNABLE_LEVELS.includes(l) ? l : '';
}

const ACTIONS = {
  'staff.add': (r) => `added ${r.target} as ${label(r.details?.level)}`,
  'staff.change_level': (r) => `changed ${r.target} from ${label(r.details?.from)} to ${label(r.details?.level)}`,
  'staff.remove': (r) => `removed ${r.target} from staff (was ${label(r.details?.level)})`,
  lookup: (r) => `looked up ${r.target} through Nora${r.details?.found === false ? ' (no account)' : ''}`,
  'account.view': (r) => `opened ${r.target}'s account`,
  'account.freeze': (r) => `froze ${r.target}${because(r)}`,
  'account.unfreeze': (r) => `unfroze ${r.target}`,
  'account.remove': (r) => `removed ${r.target}'s account${r.details?.subscriptions ? ` and cancelled ${count(r.details.subscriptions, 'subscription')}` : ''}`,
  'listing.suspend': (r) => `suspended ${listing(r)} (${r.target})${because(r)}`,
  'listing.lift': (r) => `put ${listing(r)} (${r.target}) back on the marketplace`,
  'request.done': (r) => `marked ${r.target}'s ${request(r)} request done`,
  'request.declined': (r) => `declined ${r.target}'s ${request(r)} request`,
};

function because(r) {
  return r.details?.reason ? `: "${r.details.reason}"` : '';
}

function listing(r) {
  const role = r.details?.role === 'nutritionist' ? 'nutritionist' : 'trainer';
  return r.details?.name ? `the ${role} listing "${r.details.name}"` : `a ${role} listing`;
}

function request(r) {
  return ['Pause', 'Export', 'Delete'].includes(r.details?.action) ? r.details.action : 'account';
}

function count(n, word) {
  const v = Number(n) || 0;
  return `${v} ${word}${v === 1 ? '' : 's'}`;
}

function label(level) {
  return LEVEL_LABELS[level] || 'no level';
}

/** One activity row as a sentence, from the staff member's side ("added … as Support"). */
export function describeActivity(row) {
  const target = row?.target_email || row?.target_user_id || 'an account';
  const fn = ACTIONS[row?.action];
  return fn ? fn({ ...row, target }) : `${row?.action || 'did something'} on ${target}`;
}
