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

// Named outsiders: an item whose SUBJECT is one of these is EXT. Deliberately
// specific (counsel/attorney, not the broad "legal" — plenty of ENG items
// mention legal pages).
const EXT_RE =
  /apple|apns|ios build|app store|xcode|testflight|garmin|spotify|stripe connect|radio\.co|counsel|attorney|photograph|translation review|human review|native(?:-speaker)? pass/i;

// EXT is matched against the subject, with parenthetical asides removed. In
// these records parentheses carry explanation, not the dependency: "compute
// BPM at ingest then (Spotify tempo API deprecated for new apps)" names a dead
// end we are NOT waiting on. A queue we are actually sitting in gets named in
// the item's own subject ("Garmin Health/Activity API access", "Spotify
// Extended Quota Mode approved").
const subjectOf = (label) => label.replace(/\([^)]*\)/g, ' ');

// A `pending` item that names an OUTSTANDING owner act is still YOURS, in one
// of three shapes. Deliberately action-shaped: the records are full of CLOSED
// owner decisions ("the owner ruled C", "owner pick K", "(owner call)"), and
// matching those would drag engineering work into the YOU lane and corrupt the
// counts — which is the whole point of the lane. When in doubt the item stays
// ENG: engineering triage is the safe default, a false YOU is not.

// (a) The item names the owner as the actor on something still outstanding.
const OWNER_NAMED = String.raw`\bOWNER\s*(?:ACTION|MIGRATION|RUNS|PASS|APPLIES|SETS|CONFIRMS|\(optional\)|:)|\bowner\s+(?:runs|applies|must|needs|to run|sign-?off)|needs? the owner|awaiting (?:the )?owner|pending (?:the )?owner|still owed by the owner|owner['’]s (?:go|word) (?:is )?(?:still )?(?:needed|pending|outstanding)|\bunruled\b|needs? a house (?:call|ruling)|brand-voice call`;

// (b) A verification act on real hardware — someone has to hold the phone and
// look at the screen. Phrased many ways in the records ("on-device pass",
// "On-device WebGL verification", "a manual browser/device pass"), so this
// matches the on-device/device subject with its verification verb, not one
// fixed phrase. "Device password reset" is not a match: `\bpass\b` needs the
// word boundary.
const HANDS_ON = String.raw`\bon[-\s]?device\b[^.·]{0,30}?\b(?:pass(?:es)?|verification|check)\b|\b(?:browser|device)[\w/ -]{0,12}\bpass\b`;

// (c) Acts outside the agent's reach whoever writes the code: a native
// toolchain build (Xcode/Android Studio on the owner's machine) and repo admin
// settings. These read as engineering work but no engineering can close them.
const PRIVILEGED = String.raw`\bnative build\b|\brepo(?:sitory)? settings\b`;

const YOU_RE = new RegExp([OWNER_NAMED, HANDS_ON, PRIVILEGED].join('|'), 'i');
const OWNER_NAMED_RE = new RegExp(OWNER_NAMED, 'i');

// The records' own prefix marker for an owner task: "OWNER — apply migration",
// "OWNER: confirm the key". Case-SENSITIVE and anchored to the label (or a
// bullet) on purpose — lowercase "owner-paid" / "product-photography owner
// item" are prose about the owner, not a task assigned to them.
const OWNER_MARKER = /(?:^|[·|]\s*)OWNER\s*[—–:-]/;

/**
 * @param {{label?: string, status?: string}} item
 * @returns {'you' | 'ext' | 'eng' | null}
 */
export function classifyWho(item) {
  const status = item?.status;
  if (status !== 'pending' && status !== 'manual') return null; // done → not open
  const label = String(item?.label || '');
  // An item that names YOU as the actor is yours even when it also names an
  // outsider — "OWNER — apply migration + set station row (<Radio.co URL>)"
  // waits on you, not on Radio.co. Owner precedence runs before EXT so a
  // supplier mentioned inside your own task can't capture the lane.
  if (OWNER_MARKER.test(label) || OWNER_NAMED_RE.test(label)) return 'you';
  if (EXT_RE.test(subjectOf(label))) return 'ext';
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
