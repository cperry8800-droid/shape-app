// Mutation spec for reading a step's time in every language the app ships (2026-10-08).
// Each mutation breaks one rule; every one must be killed. Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/step-timers-i18n-2026-10-08.mutations.mjs --fail-on-skipped
const COOKABLE = 'mobile-app/src/services/cookable.mjs';

export default {
  test: 'node --test tests/step-timers-i18n.test.mjs tests/coach-step-lengths.test.mjs tests/cookable.test.mjs tests/cook-steps.test.mjs',
  timeoutMs: 180_000,
  mutations: [
    { name: "a unit ends only at a Latin letter", file: COOKABLE, find: "  `(\\\\d+(?:\\\\s*[–-]\\\\s*\\\\d+)?)${BS_TIMER_GAP}(${BS_TIMER_UNITS})(?!\\\\p{L})(\\\\s*\\\\/\\\\s*side|\\\\s+per\\\\s+side)?`,", replace: "  `(\\\\d+(?:\\\\s*[–-]\\\\s*\\\\d+)?)${BS_TIMER_GAP}(${BS_TIMER_UNITS})(?![a-z])(\\\\s*\\\\/\\\\s*side|\\\\s+per\\\\s+side)?`," },
    { name: "the other languages' hour words go", file: COOKABLE, find: "const BS_TIMER_UNITS_HR = 'hours?|hrs?|stunden?|std|horas?|heures?|or[ae]|h|час(?:а|ов)?|ч|год(?:ин[аиу]?)?|saat|giờ|tiếng|jam';", replace: "const BS_TIMER_UNITS_HR = 'hours?|hrs?|h';" },
    { name: "Cyrillic minutes go", file: COOKABLE, find: "const BS_TIMER_UNITS_MIN = 'minutes?|mins?|minuten|minut[oi]s?|mn|мин(?:ут[аыу]?)?|хв(?:илин[аиу]?)?|dakika|dk|phút|menit|mnt';", replace: "const BS_TIMER_UNITS_MIN = 'minutes?|mins?|minuten|minut[oi]s?|mn|dakika|dk|phút|menit|mnt';" },
    { name: "Hausa's unit-first times are not read", file: COOKABLE, find: "  while ((m = TIMER_UNIT_FIRST_RE.exec(t))) add(m[2], m[1], null, m.index, m.index + m[0].length);", replace: "  while (false && (m = TIMER_UNIT_FIRST_RE.exec(t))) add(m[2], m[1], null, m.index, m.index + m[0].length);" },
    { name: "spans stay in the order each pattern found them", file: COOKABLE, find: "  return found.sort((x, y) => x.at - y.at).slice(0, 4);", replace: "  return found.slice(0, 4);" },
    { name: "a localized hour reads as seconds", file: COOKABLE, find: "const UNIT_HR_RE = new RegExp(`^(?:${BS_TIMER_UNITS_HR}|awa|sa['’]?a)$`, 'iu');", replace: "const UNIT_HR_RE = /^(?:hours?|hrs?|h)$/iu;" },
    { name: "a range connector is English only", file: COOKABLE, find: "const BS_AUTHOR_RANGE_LOW_RE = /(\\d+)\\s+(?:to|bis|a|à|al|до|ile|đến|sampai|hingga)\\s+$/iu;", replace: "const BS_AUTHOR_RANGE_LOW_RE = /(\\d+)\\s+to\\s+$/iu;" },
    { name: "\"hasta\" without a number counts as storage", file: COOKABLE, find: "  'hasta\\\\s+\\\\d', 'nevera', 'frigor[ií]fico', 'congel\\\\p{L}*', 'toda\\\\s+la\\\\s+noche', 'guard[ae]\\\\p{L}*', 'remoj\\\\p{L}*', 'd[ií]as?',", replace: "  'hasta', 'nevera', 'frigor[ií]fico', 'congel\\\\p{L}*', 'toda\\\\s+la\\\\s+noche', 'guard[ae]\\\\p{L}*', 'remoj\\\\p{L}*', 'd[ií]as?'," },
    { name: "\"marina\" is not storage", file: COOKABLE, find: "  'marin(?:a|ar|ad[oa]s?|ez|er|ade|ato|ata|are)',", replace: "  'marin(?:ar|ad[oa]s?|ez|er|ade|ato|ata|are)'," },
    { name: "a range's \"до\" reads as \"up to\"", file: COOKABLE, find: "  '(?<!\\\\d\\\\s{0,3})до\\\\s+\\\\d', 'холодильник\\\\p{L}*', 'замороз\\\\p{L}*', 'на\\\\s+ночь', 'на\\\\s+ніч', 'хран\\\\p{L}*', 'зберіга\\\\p{L}*', 'маринад\\\\p{L}*', 'марину\\\\p{L}*', 'мариновать', 'замоч\\\\p{L}*', 'замачива\\\\p{L}*', 'дн(?:я|ей|і|ів)', 'день', 'заранее', 'заздалегідь',", replace: "  'до\\\\s+\\\\d', 'холодильник\\\\p{L}*', 'замороз\\\\p{L}*', 'на\\\\s+ночь', 'на\\\\s+ніч', 'хран\\\\p{L}*', 'зберіга\\\\p{L}*', 'маринад\\\\p{L}*', 'марину\\\\p{L}*', 'мариновать', 'замоч\\\\p{L}*', 'замачива\\\\p{L}*', 'дн(?:я|ей|і|ів)', 'день', 'заранее', 'заздалегідь'," },
    { name: "\"and\" is English only", file: COOKABLE, find: "const BS_AUTHOR_AND_RE = /^\\s*(?:(?:and|und|y|et|e|и|і|й|ve|và|dan|da)\\s+)?$/iu;", replace: "const BS_AUTHOR_AND_RE = /^\\s*(?:and\\s+)?$/iu;" },
    { name: "a full stop never joins an hour and its minutes", file: COOKABLE, find: "  const between = t.slice(span.end, next ? next.at : span.end).replace(unit.length <= 3 ? /^\\./ : /^$/, '');", replace: "  const between = t.slice(span.end, next ? next.at : span.end).replace(/^$/, '');" },
    { name: "any full stop joins an hour and its minutes", file: COOKABLE, find: "  const between = t.slice(span.end, next ? next.at : span.end).replace(unit.length <= 3 ? /^\\./ : /^$/, '');", replace: "  const between = t.slice(span.end, next ? next.at : span.end).replace(/^\\./, '');" },
    { name: "per side written first is not read", file: COOKABLE, find: "    || BS_AUTHOR_PER_SIDE_BEFORE_RE.test(low ? head.slice(0, low.index) : head);", replace: "    || false;" },
    { name: "German per side is not read", file: COOKABLE, find: "  '(?:pro|je)\\\\s+Seite', 'auf\\\\s+jeder\\\\s+Seite',              // de", replace: "" },
    { name: "a storage word matches inside a longer word", file: COOKABLE, find: "  'firji', 'firiji', 'daskare', 'cikin\\\\s+dare', 'ajiye', 'kwana', 'jiƙa',\n].join('|')})(?!\\\\p{L})`, 'iu');", replace: "  'firji', 'firiji', 'daskare', 'cikin\\\\s+dare', 'ajiye', 'kwana', 'jiƙa',\n].join('|')})`, 'iu');" },
    { name: "a timer in another language is named with English rules", file: COOKABLE, find: "  if (mine && !mine.en) return '';", replace: "" },
    { name: "every unit counts as English for a timer's name", file: COOKABLE, find: "const UNIT_EN_RE = /^(?:hours?|hrs?|minutes?|mins?|seconds?|secs?)$/i;", replace: "const UNIT_EN_RE = /./;" },
  ],
};
