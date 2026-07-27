// Mission Control triage — the pure classifier behind /console's COUNTDOWN.
//
// Takes the War Room checklist (513 essay-length items) and makes the OPEN
// ones scannable: who each item is waiting on (YOU / EXT / ENG) + a
// deterministic one-line summary. The full label is never altered — the
// console renders it verbatim on expand. Misclassification is this feature's
// main risk, so this module is the tested surface (tests/console-triage.test.mjs).
//
// Shared by the /console page (server), ConsoleClient (browser re-poll), and
// the Node test runner — the funnel.mjs + funnel.d.ts pattern.

// Named outsiders: an item that waits on one of these is EXT regardless of
// status. Deliberately specific (counsel/attorney, not the broad "legal" —
// plenty of ENG items mention legal pages).
const EXT_RE =
  /apple|apns|ios build|app store|xcode|testflight|garmin|spotify|stripe connect|radio\.co|counsel|attorney|photograph|translation review|human review/i;

// A `pending` item that names an owner act is still YOURS, not engineering's.
const YOU_RE = /\bOWNER\b|owner call|owner ruling|owner's word|on-device/i;

/**
 * @param {{label?: string, status?: string}} item
 * @returns {'you' | 'ext' | 'eng' | null}
 */
export function classifyWho(item) {
  const status = item?.status;
  if (status !== 'pending' && status !== 'manual') return null; // done → not open
  const label = String(item?.label || '');
  if (EXT_RE.test(label)) return 'ext';
  if (status === 'manual') return 'you';
  return YOU_RE.test(label) ? 'you' : 'eng';
}

/**
 * First-clause summary, deterministic: cut at the earliest strong break
 * (' — ', '. ', ' · ') that lands past 24 chars; otherwise word-boundary
 * truncate at `max`. Anything shortened gains ' …'.
 * @param {string} label @param {number} [max]
 */
export function shortLabel(label, max = 160) {
  const s = String(label || '').trim();
  if (!s) return '';
  let cut = s.length;
  for (const sep of [' — ', '. ', ' · ']) {
    const i = s.indexOf(sep);
    if (i >= 24 && i < cut) cut = i;
  }
  if (cut >= s.length && s.length <= max) return s;
  let out = s.slice(0, Math.min(cut, max));
  if (out.length === max && cut > max) {
    const sp = out.lastIndexOf(' ');
    if (sp > 40) out = out.slice(0, sp);
  }
  return out.replace(/[\s.·—-]+$/, '') + ' …';
}

const WHO_ORDER = { you: 0, ext: 1, eng: 2 };

/**
 * @param {Array<{section?: string, items?: Array<{label?: string, status?: string}>}>} sections
 */
export function triageChecklist(sections) {
  const open = [];
  let done = 0;
  let total = 0;
  for (const sec of Array.isArray(sections) ? sections : []) {
    const sectionName = String(sec?.section || '');
    for (const item of Array.isArray(sec?.items) ? sec.items : []) {
      total++;
      const who = classifyWho(item);
      if (!who) {
        done++;
        continue;
      }
      open.push({
        section: sectionName,
        label: String(item.label || ''),
        // classifyWho returned non-null, so status is one of the open pair.
        status: /** @type {'pending' | 'manual'} */ (item.status),
        who,
        short: shortLabel(item.label || ''),
      });
    }
  }
  // Deterministic: YOU → EXT → ENG, then section name (code-unit order —
  // locale collation varies by ICU build), then original encounter order.
  open.sort((a, b) => {
    const w = WHO_ORDER[a.who] - WHO_ORDER[b.who];
    if (w) return w;
    return a.section < b.section ? -1 : a.section > b.section ? 1 : 0;
  });
  const counts = { you: 0, ext: 0, eng: 0 };
  for (const o of open) counts[o.who]++;
  return { open, counts: { ...counts, open: open.length, done, total } };
}
