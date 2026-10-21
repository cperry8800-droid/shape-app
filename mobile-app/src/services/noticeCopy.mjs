// A server notice in its reader's language (owner, 2026-10-21: "fix the other server notices wording
// too"). The notifications table keeps the English a notice was written in: the website reads it, and
// so does anyone reading in English. The app's bell list and push dispatch (its push and its email)
// say it again for everyone else, from the `notice` catalog. Pure: the translator and the locale are
// passed in, so the app (BSNotifications.jsx) and the server (src/app/api/push/dispatch/route.ts,
// src/lib/notify.ts) run the same code.
//
// Two kinds of row:
//   • A row a server route writes carries its copy: `data.copy = { title: [key, vars], body: [key,
//     vars] }`, keys under notice:, vars raw (a name as written, a time with its zone, an amount in
//     cents). A part that is the writer's or a person's own words (a reminder's label, a coach's
//     notes, a message) has no copy, and its text is said as written.
//   • A row a database trigger writes (a message, a coach's workout, a week, a plan, a grocery list,
//     a co-sign, a follow, a tier-up) carries none, and its English is matched by its fixed shape
//     (triggerCopy, below), the names in it read back out.
// A row the AI notify layer writes (ai_*) is already in its reader's language (notifications.mjs).

// ── the parts a writer stores ──────────────────────────────────────────────
export const np = (key, vars) => (vars ? [key, vars] : [key]);
// A moment in a zone: "Oct 21, 9:00 AM" in the reader's language, on the clock the writer named.
// With no zone it is UTC and says so, as the English did (sessions/manage memberClock).
export const atTime = (iso, tz, weekday) => ({ $at: iso, ...(tz ? { tz } : {}), ...(weekday ? { weekday: true } : {}) });
// A calendar day, YYYY-MM-DD: "Oct 21" (short) or "October 21, 2026" (long).
export const onDay = (ymd, style) => ({ $day: ymd, ...(style ? { style } : {}) });
export const usdOf = (cents) => ({ $usd: cents });
// A phrase of the catalog's own (an activity, a reason), said in the reader's language.
export const phrase = (key, vars) => ({ $key: key, ...(vars ? { vars } : {}) });
// A list of values, joined as the reader's language joins them ("a, b and c").
export const listOf = (items) => ({ $list: items });
// A weekday, 0 = Monday (prepAhead.mjs DAY).
export const weekdayOf = (i) => ({ $weekday: i });

const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);

function dateIn(locale, d, opts) {
  try { return new Intl.DateTimeFormat(locale, opts).format(d); } catch (e) {
    try { return new Intl.DateTimeFormat('en-US', opts).format(d); } catch (e2) { return null; }
  }
}

// A stored value, said in the reader's language. Anything unreadable gives null, and the part that
// needed it keeps its English.
function resolve(v, tr, locale) {
  if (v == null) return null;
  if (typeof v === 'string' || typeof v === 'number') return v;
  if (Array.isArray(v)) return null;
  if (!isObj(v)) return null;
  if (typeof v.$at === 'string') {
    const d = new Date(v.$at);
    if (isNaN(d.getTime())) return null;
    const tz = typeof v.tz === 'string' && v.tz ? v.tz : null;
    const opts = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: tz || 'UTC', ...(v.weekday ? { weekday: 'short' } : {}), ...(tz ? {} : { timeZoneName: 'short' }) };
    return dateIn(locale, d, opts);
  }
  if (typeof v.$day === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.$day);
    if (!m) return null;
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
    return dateIn(locale, d, v.style === 'long' ? { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' } : { month: 'short', day: 'numeric', timeZone: 'UTC' });
  }
  if (typeof v.$usd === 'number' && Number.isFinite(v.$usd)) {
    try { return new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(Math.max(0, v.$usd) / 100); } catch (e) { return null; }
  }
  if (typeof v.$weekday === 'number' && v.$weekday >= 0 && v.$weekday <= 6) {
    // 2024-01-01 was a Monday.
    return dateIn(locale, new Date(Date.UTC(2024, 0, 1 + v.$weekday, 12)), { weekday: 'long', timeZone: 'UTC' });
  }
  if (typeof v.$key === 'string') return sayKey(v.$key, v.vars, tr, locale);
  if (Array.isArray(v.$list)) {
    const items = v.$list.map((x) => resolve(x, tr, locale));
    if (!items.length || items.some((x) => x == null || x === '')) return null;
    try { return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(items.map(String)); } catch (e) { return items.join(', '); }
  }
  return null;
}

function sayKey(key, vars, tr, locale) {
  if (typeof key !== 'string' || !key || typeof tr !== 'function') return null;
  const out = {};
  if (isObj(vars)) {
    for (const k of Object.keys(vars)) {
      const r = resolve(vars[k], tr, locale);
      if (r == null) return null;
      out[k] = r;
    }
  }
  const full = 'notice:' + key;
  let s;
  try { s = tr(full, { ...out, defaultValue: '' }); } catch (e) { return null; }
  // i18next answers a key it lacks with the key, without its namespace, when the default is empty.
  return typeof s === 'string' && s.trim() && s !== full && s !== key && !/[{}]/.test(s) ? s : null;
}

// One stored part ([key, vars]) said in the reader's language, or null.
export function sayPart(part, tr, locale) {
  if (!Array.isArray(part) || typeof part[0] !== 'string') return null;
  return sayKey(part[0], part[1], tr, locale);
}

// ── rows a database trigger writes ─────────────────────────────────────────
// Each shape is the English of the trigger's latest definition in supabase-migrations/ (named on
// each line). A row whose English does not match is said as written.
const ACTIVITIES = new Set(['workout', 'run', 'swim', 'cycle', 'ride', 'walk', 'hike', 'strength', 'recovery', 'yoga']);
const GROCERY = / loaded your meal plan into grocery lists(?: — (.+))?$/;
export function triggerCopy(row) {
  const type = row && row.type;
  const title = String((row && row.title) || '');
  const body = String((row && row.body) || '');
  const data = row && isObj(row.data) ? row.data : {};
  switch (type) {
    // notify_on_new_message (2026-10-18-coach-access-past-due.sql): the body is the message.
    case 'message':
      return title === 'New message' ? { title: np('message.title') } : null;
    // notify_on_client_workout, notify_on_pushed_item, publish_client_week: the body is the coach's
    // title for it, or the week's count.
    case 'workout':
      if (title === 'New workout from your coach') return { title: np('workout.title') };
      if (title === 'New exercise from your coach') return { title: np('exercise.title') };
      if (title === 'Your week from your coach') {
        const n = Number(data.sessions);
        const week = typeof data.weekStartISO === 'string' ? data.weekStartISO : null;
        return { title: np('week.title'), ...(Number.isInteger(n) && n >= 0 && week ? { body: np('week.body', { count: n, day: onDay(week) }) } : {}) };
      }
      return null;
    // notify_on_program_assignment (2026-05-31-ALL-pending.sql); the meal plan route writes its own.
    case 'program':
      return title === 'New training program from your coach' ? { title: np('program.title') } : null;
    case 'meal_plan':
      return title === 'New meal plan from your coach' ? { title: np('mealPlan.title') } : null;
    // notify_grocery_list, notify_on_pushed_item (2026-06-07-grocery-*.sql).
    case 'grocery': {
      if (title === 'New meal + grocery items') return { title: np('grocery.items.title') };
      if (title !== 'Grocery list ready') return null;
      const m = GROCERY.exec(body);
      const coach = m ? body.slice(0, m.index).trim() : '';
      if (!m || !coach) return { title: np('grocery.ready.title') };
      const by = coach === 'Your coach' ? null : coach;
      const key = m[1] ? (by ? 'grocery.ready.bodyList' : 'grocery.ready.bodyListAnon') : (by ? 'grocery.ready.body' : 'grocery.ready.bodyAnon');
      return { title: np('grocery.ready.title'), body: np(key, { ...(by ? { coach: by } : {}), ...(m[1] ? { list: m[1] } : {}) }) };
    }
    // post_coach_cosign (2026-06-14-coach-cosign.sql): "<coach> co-signed your <activity_type>".
    case 'cosign': {
      const m = /^(.+) co-signed your (.+)$/.exec(title);
      if (!m) return null;
      const activity = ACTIVITIES.has(m[2]) ? phrase('activity.' + m[2]) : m[2];
      return { title: np('cosign.title', { coach: m[1], activity }) };
    }
    // toggle_follow / respond_follow_request (2026-06-08-follow-requests.sql).
    case 'follow': {
      const m = /^(.+) started following you$/.exec(title);
      return m ? { title: np('follow.started', { name: m[1] }) } : null;
    }
    case 'follow_request': {
      const m = /^(.+) requested to follow you$/.exec(title);
      return m ? { title: np('follow.requested', { name: m[1] }) } : null;
    }
    case 'follow_accept': {
      const m = /^(.+) accepted your follow request$/.exec(title);
      return m ? { title: np('follow.accepted', { name: m[1] }) } : null;
    }
    // award_tier_bonuses (2026-10-16-tier-up-notice.sql). A tier's name is Shape's, said as it is.
    case 'tier_up': {
      const tier = typeof data.tier === 'string' && data.tier ? data.tier : null;
      return tier && title === 'You reached ' + tier ? { title: np('tier.title', { tier }), body: np('tier.body', { tier }) } : null;
    }
    default:
      return null;
  }
}

// ⚠ ENGLISH IS SAID AS STORED. The stored text is the English the writer wrote, word for word, and
// the website and every English reader see it; only another language is said again. `opts`:
// { english, locale } — `english` true when the reader reads English (the app's language, or the
// recipient's stored one), `locale` the Intl locale a time, a date or an amount is said in.
export function noticeText(row, tr, opts) {
  const title = String((row && row.title) || '');
  const body = String((row && row.body) || '');
  const o = opts || {};
  if (o.english !== false || typeof tr !== 'function' || !row) return { title, body };
  if (typeof row.type === 'string' && row.type.startsWith('ai_')) return { title, body };
  const data = isObj(row.data) ? row.data : {};
  const copy = isObj(data.copy) ? data.copy : triggerCopy(row);
  if (!copy) return { title, body };
  const t = copy.title ? sayPart(copy.title, tr, o.locale) : null;
  const b = copy.body ? sayPart(copy.body, tr, o.locale) : null;
  return { title: t || title, body: b != null ? b : body };
}
