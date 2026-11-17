// HOME, BY WHO THE MEMBER HAS HIRED (owner, 2026-11-17: "ok make new home screens live", "build those.
// Please make it look like the preview", "on the app"). Home reads one of three ways: no coach, one
// coach, or a team (a trainer and a nutritionist). Pure, so the tests run it.
//
// The coaches are the ones the member pays (homeWeek.mjs's bsHomeCoachesOf): { role, name, providerId,
// conversationId, photo }, a role that is not 'nutritionist' being a trainer's.

// A coach's first name for a title or a line ("Your goal, with Maya"): the first word that is not a
// title, so "Dr. Maya Patel" reads Maya, not "Dr.".
const BS_CARE_TITLES = /^(dr|dra|mr|mrs|ms|miss|mx|prof|sr|sra|srta|mme|mlle)\.?$/i;
export function bsCareFirstName(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  return words.find((w) => !BS_CARE_TITLES.test(w)) || words[0] || '';
}
// Their initials, for a portrait with no photo: the first two words that are not a title ("Dr. Maya
// Patel" is MP).
export function bsCareInitials(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  const named = words.filter((w) => !BS_CARE_TITLES.test(w));
  return (named.length ? named : words).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

// Which Home the member gets.
//   'none'     no coach;
//   'one'      exactly one coach: the other discipline is an open seat, and Home may invite;
//   'coaches'  two or more coaches of one discipline (rare): the other is still open, with no seat
//              drawn and no invitation (the owner's plate is for a member with one coach);
//   'team'     at least one trainer and one nutritionist.
// `coaches` are the trainers then the nutritionists, `only` the one coach of 'one', and `openRole` the
// discipline nobody coaches yet ('trainer' | 'nutritionist' | null).
export function bsHomeCare(coaches) {
  const list = (Array.isArray(coaches) ? coaches : []).filter(Boolean);
  const trainers = list.filter((c) => c.role !== 'nutritionist');
  const nutris = list.filter((c) => c.role === 'nutritionist');
  const kind = !list.length ? 'none' : trainers.length && nutris.length ? 'team' : list.length === 1 ? 'one' : 'coaches';
  const openRole = kind === 'none' || kind === 'team' ? null : (trainers.length ? 'nutritionist' : 'trainer');
  return { kind, coaches: [...trainers, ...nutris], trainers, nutris, only: kind === 'one' ? list[0] : null, openRole, seat: kind === 'one', invite: kind === 'one' };
}

// The goal plate's title: 'yours' (Your goal), 'with' (Your goal, with {name}), 'coach' (one coach whose
// name could not be read), 'coaches' (several of one discipline) or 'team' (Your team's goal).
export function bsCareGoalTitle(care) {
  const c = care || {};
  if (c.kind === 'team') return 'team';
  if (c.kind === 'coaches') return 'coaches';
  if (c.kind === 'one') return bsCareFirstName(c.only && c.only.name) ? 'with' : 'coach';
  return 'yours';
}

// ── The two trails into the start of the climb ────────────────────────────────────────────────────
// A short trail a discipline, in its role's colour, leading into the foot of the route (homeClimb.mjs's
// bsClimbPoint(0)): the trainer's from the left, the nutritionist's from below. With a coach on it the
// trail is solid; a discipline nobody coaches yet is dashed (`open`). A member with no coach has none.
export const BS_CARE_TRAIL = {
  trainer: 'M6,118 C24,118 40,116 58,112',
  nutritionist: 'M22,142 C36,134 48,124 58,112',
};
export function bsCareTrails(care) {
  if (!care || care.kind === 'none' || !care.kind) return [];
  return ['trainer', 'nutritionist'].map((role) => ({
    role, d: BS_CARE_TRAIL[role], open: !(role === 'trainer' ? care.trainers : care.nutris).length,
  }));
}

// ── The roles' colours, as the approved Home pairs them ───────────────────────────────────────────
// A solid mark (the bar beside a row), the week strip's bar, a line (a portrait's ring, a trail, a dashed
// seat) and the words, lighter than the mark on a dark paper and darker on a light one so they read.
export function bsCareRoleInk(isLight, role) {
  return role === 'nutritionist'
    ? { mark: isLight ? '#a07a2e' : '#d3a64b', bar: '#a07a2e', line: isLight ? '#a07a2e' : '#d3a64b', text: isLight ? '#7a5a1e' : '#d3a64b' }
    : { mark: '#c0533b', bar: '#c0533b', line: isLight ? '#c0533b' : '#e0694f', text: isLight ? '#9c3b26' : '#ec8a6f' };
}

// ── "Not now" on the invitation ──────────────────────────────────────────────────────────────────
// The plate under the goal, for a member with exactly one coach. "Not now" puts it away for a fortnight,
// on this device, for this account and this coach (a stamp in localStorage, as the past-due row's ×): a
// new coach, another account, or the fortnight over, and it is back. Never for good.
export const BS_CARE_INVITE_KEY = 'shape.homeCareInvite';
export const BS_CARE_INVITE_DAYS = 14;
export function bsCareCoachKey(c) {
  return c ? `${c.role === 'nutritionist' ? 'n' : 't'}:${c.providerId != null ? c.providerId : (c.name || '')}` : '';
}
export function bsCareInviteStamp({ uid = null, coach = null, day = '' } = {}) {
  return [uid || 'preview', bsCareCoachKey(coach), day].join('|');
}
const bsCareDayMs = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : NaN;
};
export function bsCareInviteShown({ care = null, uid = null, day = '', stamp = null } = {}) {
  if (!care || !care.invite || !care.only) return false;
  const s = String(stamp || '');
  const a = s.indexOf('|'), b = s.lastIndexOf('|');
  if (a < 0 || b <= a) return true;
  // Another account's, or another coach's: not this plate's "Not now".
  if (s.slice(0, a) !== (uid || 'preview') || s.slice(a + 1, b) !== bsCareCoachKey(care.only)) return true;
  const days = Math.round((bsCareDayMs(day) - bsCareDayMs(s.slice(b + 1))) / 86400000);
  // Put away from the day of the tap for a fortnight. A stamp that cannot be read, or one dated after
  // today (a clock set back), hides nothing.
  return !(Number.isFinite(days) && days >= 0 && days < BS_CARE_INVITE_DAYS);
}

// ⚠ THE DEVICE KEEPS ONE STAMP AN ACCOUNT AND COACH, NOT ONE STAMP: { "<uid>|<coach key>": "<day>" } as
// JSON under BS_CARE_INVITE_KEY. In one slot a second account's "Not now", or the same member's for a
// new coach, wiped the first's fortnight, and the plate came back early (Codex P2 on #2750).
function bsCareInviteMap(stored) {
  try {
    const m = JSON.parse(String(stored || ''));
    return m && typeof m === 'object' && !Array.isArray(m) ? m : {};
  } catch (e) { return {}; }
}
const bsCareInviteSlot = ({ uid = null, coach = null } = {}) => `${uid || 'preview'}|${bsCareCoachKey(coach)}`;
// This account and coach's stamp out of what the device holds, or null.
export function bsCareInviteRead(stored, who) {
  const slot = bsCareInviteSlot(who || {});
  const day = bsCareInviteMap(stored)[slot];
  return typeof day === 'string' && day ? `${slot}|${day}` : null;
}
// What the device holds after a "Not now" on `day`: this account and coach's stamp, and every other one
// still inside its fortnight (the rest are dropped, so the map never grows without end).
export function bsCareInviteWrite(stored, who, day) {
  const next = {};
  for (const [slot, d] of Object.entries(bsCareInviteMap(stored))) {
    const days = Math.round((bsCareDayMs(day) - bsCareDayMs(d)) / 86400000);
    if (typeof d === 'string' && Number.isFinite(days) && days >= 0 && days < BS_CARE_INVITE_DAYS) next[slot] = d;
  }
  next[bsCareInviteSlot(who || {})] = day;
  return JSON.stringify(next);
}
