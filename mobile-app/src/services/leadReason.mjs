// Home's lead reason in the member's words, language and units: one sentence for every surface that
// says it. Home and the Shape Daily splash call it through BSCheckinCard.jsx bsCiLeadReason, which
// passes the app's locale and units preference; the push and the bell row call it on the server
// (src/lib/ai/notifications.mjs memberMoveLine) with the member's stored language and units. Pure:
// no React, no window, the translator and the locale passed in.
//
// The check-in words and the helpers the sentence is built with live here too, so the card, Your
// mornings and the server read one copy (BSCheckinCard.jsx re-exports them under the same names).

// A stored 1-10 value → its word (0..4): 1-2 → 0, 3-4 → 1, 5-6 → 2, 7-8 → 3, 9-10 → 4.
export function bsCiWordIndex(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.max(0, Math.min(4, Math.ceil(Math.min(10, n) / 2) - 1));
}

export function bsCiIso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Hours as hours and minutes. `say(hh, mm)` words it in the member's language (the card passes
// home:checkin.hm / hOnly; Russian reads "7 ч 30"); without one it is "7h 30".
export function bsCiHM(h, say) {
  const n = h == null ? NaN : Number(h);
  if (!Number.isFinite(n)) return '—';
  const total = Math.round(n * 60); // in whole minutes first, so 7.999h reads 8h, never 7h 60
  const hh = Math.floor(total / 60);
  const mm = String(total % 60).padStart(2, '0');
  if (say) return say(hh, total % 60 ? mm : null);
  return total % 60 ? `${hh}h ${mm}` : `${hh}h`;
}

// The five words of each scale in the member's language: E energy, H hunger between meals, R How did
// you wake up? (Rested). The card and Your mornings both say a value with these, and a value, stored
// or averaged, becomes its word only through bsCiWordIndex (ruling 11). The keys are written out so
// the i18n gates check every one.
export function bsCiWords(tr) {
  return {
    E: [
      tr('home:checkin.e0', { defaultValue: 'Drained' }),
      tr('home:checkin.e1', { defaultValue: 'Low' }),
      tr('home:checkin.e2', { defaultValue: 'OK' }),
      tr('home:checkin.e3', { defaultValue: 'Good' }),
      tr('home:checkin.e4', { defaultValue: 'Great' }),
    ],
    H: [
      tr('home:checkin.h0', { defaultValue: 'Not hungry' }),
      tr('home:checkin.h1', { defaultValue: 'A little' }),
      tr('home:checkin.h2', { defaultValue: 'Normal' }),
      tr('home:checkin.h3', { defaultValue: 'Hungry' }),
      tr('home:checkin.h4', { defaultValue: 'Starving' }),
    ],
    R: [
      tr('home:checkin.r0', { defaultValue: 'Wrecked' }),
      tr('home:checkin.r1', { defaultValue: 'Tired' }),
      tr('home:checkin.r2', { defaultValue: 'OK' }),
      tr('home:checkin.r3', { defaultValue: 'Rested' }),
      tr('home:checkin.r4', { defaultValue: 'Fresh' }),
    ],
  };
}

// A word mid-sentence starts lower case in the member's language: "Mostly good mornings this week",
// "Diese Woche meist gut". Only its first letter is lowered, so a noun inside it keeps its capital
// ("kein Hunger", never "kein hunger"), and a word in capitals stays as it is ("Mostly OK", never
// "Mostly ok"; review on part 2). `locale` is an Intl locale, or undefined for the runtime's own.
export function bsCiLowerIn(w, locale) {
  const s = String(w);
  const up = (x) => { try { return x.toLocaleUpperCase(locale); } catch (e) { return x.toUpperCase(); } };
  if (s.length > 1 && s === up(s)) return s;
  try { return s.charAt(0).toLocaleLowerCase(locale) + s.slice(1); } catch (e) { return s.charAt(0).toLowerCase() + s.slice(1); }
}

// The stored units preference read as metric or not, by the app's rule: Settings saves the option's
// label ('Metric · kg / km'), and anything naming metric, kg or km is metric. Imperial is the default.
// ⚠ TWIN: bsNormalizeUnits in iosAppBroadsheet.jsx is this rule for the app's ShapeUnits. Change one
// and change both (tests/member-push-copy.test.mjs holds them to the same answers).
export function bsUnitsMetric(v) {
  return /metric|\bkg\b|\bkm\b/i.test(String(v == null ? '' : v));
}

// The engine's figures said in the member's language and units (bsLeadReason, below). Each line
// says what the engine's English reason says, from the numbers that reason was built from
// (directive.evidence, the flag's `figures`). A figure that is missing, or is not what its rule
// makes (a count that is not a whole number, a date that is not a date), gives no line, and the
// caller keeps the engine's reason: nothing is said that the figures do not hold. `opts.locale` is
// the Intl locale for a date or a number, and `opts.metric` the units preference water is said in,
// with its default, imperial.
const BS_CI_L_TO_OZ = 33.814;
function bsCiFigureReason(ev, tr, opts) {
  const key = ev && ev.key;
  const whole = (v, min) => (Number.isInteger(v) && v >= min ? v : null);
  const locale = (opts && opts.locale) || undefined;
  const num = (n, digits) => { try { return new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(n); } catch (e) { return String(n); } };
  if (key === 'checkin_overdue') {
    if (ev.first === true) return tr('home:lead.reason.checkinFirst', { defaultValue: "You haven't sent a first weekly check-in yet." });
    const weeks = whole(ev.missedWeeks, 1);
    if (weeks != null && weeks >= 2) return tr('home:lead.reason.checkinWeeks', { defaultValue: 'No weekly check-in for {weeks, plural, one {# week} other {# weeks}}.', weeks });
    const m = weeks === 1 && typeof ev.lastWeekOf === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(ev.lastWeekOf) : null;
    if (!m) return null;
    // The engine's Monday is a local day, so it is read at local noon, as bsCiShift reads one.
    const day = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
    if (bsCiIso(day) !== ev.lastWeekOf) return null;
    let date;
    try { date = new Intl.DateTimeFormat(locale, { month: 'long', day: 'numeric' }).format(day); } catch (e) { return null; }
    return tr('home:lead.reason.checkinDue', { defaultValue: 'Your weekly check-in is due. The last one was for the week of {date}.', date });
  }
  if (key === 'goal_slip') {
    // The goal's own name is the member's or their coach's words, set in the locale's quotes. The
    // untitled weight goal, whose name in the engine is its English stand-in, is named by the catalog.
    const goal = typeof ev.goal === 'string' && ev.goal.trim() ? ev.goal.trim() : null;
    if (!goal && ev.untitled !== true) return null;
    if (ev.lost === true) {
      return goal
        ? tr('home:lead.reason.goalLost', { defaultValue: '“{goal}” lost its projected date. The pace flattened this week.', goal })
        : tr('home:lead.reason.weightLost', { defaultValue: 'Your goal weight lost its projected date. The pace flattened this week.' });
    }
    const days = whole(ev.days, 1);
    if (days == null) return null;
    return goal
      ? tr('home:lead.reason.goalSlip', { defaultValue: '“{goal}” slipped. Its projected finish moved {days, plural, one {# day} other {# days}} later this week.', goal, days })
      : tr('home:lead.reason.weightSlip', { defaultValue: 'Your goal weight slipped. Its projected finish moved {days, plural, one {# day} other {# days}} later this week.', days });
  }
  if (key === 'streak_broken') {
    // The engine's figure is the streak's longest run in what the record holds (the member's own: the
    // longest run of logged days in the last 30), so the line calls it that, never the run that broke.
    const days = whole(ev.best, 1);
    // The window is the nutrition route's 30 days (src/app/api/client/nutrition/route.ts), so the line
    // says it: a run that started before it is longer than the figure (review on #2415).
    return days == null ? null : tr('home:lead.reason.streakBroken', { defaultValue: 'Your streak broke. Your longest run in the last 30 days was {days, plural, one {# day} other {# days}}.', days });
  }
  if (key === 'hydration_low') {
    const avgL = typeof ev.avgL === 'number' && Number.isFinite(ev.avgL) && ev.avgL >= 0 ? ev.avgL : null;
    const targetL = typeof ev.targetL === 'number' && Number.isFinite(ev.targetL) && ev.targetL > 0 ? ev.targetL : null;
    if (avgL == null || targetL == null) return null;
    const metric = !!(opts && opts.metric === true);
    // The target as the water line shows it (to the centilitre, or the whole ounce); the week's
    // average to the decilitre, as the engine rounds it, or the whole ounce.
    const say = (l, digits) => (metric ? `${num(Math.round(l * 10 ** digits) / 10 ** digits, digits)} L` : `${num(Math.round(l * BS_CI_L_TO_OZ), 0)} oz`);
    return tr('home:lead.reason.water', { defaultValue: 'On days you logged water, you averaged {amount} of your {target} target. A glass with each meal closes most of it.', amount: say(avgL, 1), target: say(targetL, 2) });
  }
  if (key === 'food_gap') {
    if (ev.lastWeek === true) return tr('home:lead.reason.foodWeek', { defaultValue: 'No food logged in the last week.' });
    const days = whole(ev.days, 1);
    if (days == null) return null;
    return ev.sinceJoined === true
      ? tr('home:lead.reason.foodJoined', { defaultValue: 'No food logged in the {days, plural, one {# day} other {# days}} since you joined.', days })
      : tr('home:lead.reason.foodDays', { defaultValue: 'No food logged in {days, plural, one {# day} other {# days}}.', days });
  }
  if (key === 'score_drop') {
    const drop = whole(ev.drop, 1);
    return drop == null ? null : tr('home:lead.reason.scoreDrop', { defaultValue: 'Your Shape Score is {drop, number} lower than the week before.', drop });
  }
  return null;
}

// ⚠ HOME'S LEAD SAYS EVERY ENGINE REASON IN THE MEMBER'S WORDS (part 2; rulings 11 and 13). The
// engine's own member reason is English, so every surface that shows it says it again from the
// catalog out of directive.evidence: Home, the Shape Daily splash (bsWireLines' opts.reason in
// iosAppBroadsheetMain.jsx), and the push and the bell row it leaves (memberMoveLine on the server).
// The morning check-in's energy, hunger and sleep flags come from the flag's raw average: in the week
// line's own keys and the card's word rule, so the lead and the summary say one thing. An average is said as one ("low on average"),
// never "mostly": Your mornings' "Most days" is the word most days had, and an average of Drained
// and Great days is Low without one Low day (review on part 2). Sleep is to the 5 minutes, as the
// week line has it. Every other flag comes from its figures (bsCiFigureReason): the check-in's
// weeks and the Monday it names, a goal's slip, the streak's longest run, water in the member's units,
// a food gap, a Score drop. A coach's own reason (source 'coach'), an engine lead with no figures it
// can say, and a key it does not know are said as they came.
// `opts`: { locale, metric } — the Intl locale words and numbers are said in, and the units
// preference water is said in (imperial unless `metric` is true).
export function bsLeadReason(dir, tr, opts) {
  if (!dir) return null;
  const locale = (opts && opts.locale) || undefined;
  const ev = dir.source === 'engine' && dir.evidence ? dir.evidence : null;
  const avg = ev && typeof ev.avg === 'number' && Number.isFinite(ev.avg) ? ev.avg : null;
  if (avg == null) return (ev && bsCiFigureReason(ev, tr, opts)) || dir.reason;
  const i = bsCiWordIndex(avg);
  if (ev.key === 'energy_low' && i != null) {
    return tr('home:checkin.weekEnergyLow', { defaultValue: 'Your energy has been {word} on average this week. A lighter session still counts.', word: bsCiLowerIn(bsCiWords(tr).E[i], locale) });
  }
  if (ev.key === 'hunger_high' && i != null) {
    return tr('home:lead.hungerReason', { defaultValue: "You've been {word} between meals on average this week. The plan may be running light on fuel.", word: bsCiLowerIn(bsCiWords(tr).H[i], locale) });
  }
  if (ev.key === 'sleep_low' && avg > 0) {
    const say = (hh, mm) => (mm == null ? tr('home:checkin.hOnly', { defaultValue: '{h}h', h: hh }) : tr('home:checkin.hm', { defaultValue: '{h}h {m}', h: hh, m: mm }));
    return tr('home:checkin.weekSleepShort', { defaultValue: 'Short on sleep this week: {hours} a night.', hours: bsCiHM(Math.round(avg * 12) / 12, say) });
  }
  return dir.reason;
}

// One engine flag (evaluateClient's, which carries its `figures`) said as Home would lead with it:
// the goal-slip and Score-dip notices name their reason with this. A flag with no figures it can say
// keeps its own reason.
export function bsFlagReason(flag, tr, opts) {
  if (!flag || typeof flag !== 'object') return null;
  const evidence = { key: flag.key, avg: flag.avg != null ? flag.avg : null, n: flag.n != null ? flag.n : null };
  if (flag.figures && typeof flag.figures === 'object') {
    for (const k in flag.figures) if (Object.prototype.hasOwnProperty.call(flag.figures, k)) evidence[k] = flag.figures[k];
  }
  return bsLeadReason({ source: 'engine', reason: flag.reason, evidence }, tr, opts);
}
