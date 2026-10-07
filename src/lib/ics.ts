// iCalendar (RFC 5545) text, written by hand: the coach feed is a few dozen events and a
// dependency would be the largest thing in it. Pure — no clock, no I/O.
//
// The four rules a calendar app actually enforces, each held by tests/calendar-feed.test.mjs:
//   1. every line ends CRLF;
//   2. a content line longer than 75 OCTETS is folded (CRLF + one space) and never inside a
//      UTF-8 sequence — "Zoë" counts its ë as two octets, and a fold through it turns the
//      name into mojibake in Outlook;
//   3. a TEXT value escapes backslash, semicolon, comma and newline, so a client named
//      "Lee, Sam" does not end the SUMMARY at the comma;
//   4. a time is UTC ("…Z"), a DATE for an all-day row, or floating (no zone at all) when the
//      wall clock's zone is unknown — so the feed never needs a VTIMEZONE block.

export type IcsTime =
  | { utc: number }                 // an instant, ms since epoch
  | { date: string }                // 'YYYY-MM-DD', all day
  | { floating: string };           // 'YYYY-MM-DDTHH:MM', a wall clock in no named zone

export type IcsEvent = {
  uid: string;
  start: IcsTime;
  end: IcsTime;
  stamp: number;                    // DTSTAMP, ms — when the row last changed
  summary: string;
  description?: string;
  location?: string;
  url?: string;
  status?: 'CONFIRMED' | 'TENTATIVE' | 'CANCELLED';
  transparent?: boolean;            // true = shows as free time
  lastModified?: number;
};

export type IcsCalendar = {
  name: string;
  description?: string;
  refreshMinutes?: number;
  events: IcsEvent[];
};

const CRLF = '\r\n';
const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** A TEXT value, escaped. Control characters other than a newline are dropped. */
export function icsText(value: unknown): string {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/** One content line, folded at 75 octets without splitting a UTF-8 sequence. */
export function icsFold(line: string): string {
  const enc = new TextEncoder();
  const parts: string[] = [];
  let cur = '';
  let bytes = 0;
  let limit = 75;                    // the first line; a continuation's space counts toward its 75
  for (const ch of line) {           // for…of walks code points, so a surrogate pair stays whole
    const n = enc.encode(ch).length;
    if (bytes + n > limit) {
      parts.push(cur);
      cur = '';
      bytes = 0;
      limit = 74;
    }
    cur += ch;
    bytes += n;
  }
  parts.push(cur);
  return parts.join(CRLF + ' ');
}

/** ms → 'YYYYMMDDTHHMMSSZ'. */
export function icsUtc(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getUTCFullYear(), 4)}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function timeProp(name: string, t: IcsTime): string {
  if ('utc' in t) return `${name}:${icsUtc(t.utc)}`;
  if ('date' in t) return `${name};VALUE=DATE:${t.date.replace(/-/g, '')}`;
  return `${name}:${t.floating.replace(/[-:]/g, '')}00`;
}

/** A URI value: only http(s), and nothing that could end the line or the property. */
function safeUri(u: unknown): string | null {
  const s = String(u ?? '').trim();
  return /^https?:\/\/[^\s"<>\\]+$/i.test(s) ? s : null;
}

/** The whole VCALENDAR, CRLF-terminated. */
export function icsCalendar(cal: IcsCalendar): string {
  const out: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Shape//Coach calendar feed//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `NAME:${icsText(cal.name)}`,
    `X-WR-CALNAME:${icsText(cal.name)}`,
  ];
  if (cal.description) {
    out.push(`DESCRIPTION:${icsText(cal.description)}`, `X-WR-CALDESC:${icsText(cal.description)}`);
  }
  if (cal.refreshMinutes && cal.refreshMinutes > 0) {
    // A hint, which Apple honours and Google ignores (it refreshes on its own schedule).
    const m = Math.round(cal.refreshMinutes);
    out.push(`REFRESH-INTERVAL;VALUE=DURATION:PT${m}M`, `X-PUBLISHED-TTL:PT${m}M`);
  }
  for (const e of cal.events) {
    out.push('BEGIN:VEVENT');
    out.push(`UID:${e.uid.replace(/[^A-Za-z0-9@._-]/g, '')}`);
    out.push(`DTSTAMP:${icsUtc(e.stamp)}`);
    out.push(timeProp('DTSTART', e.start));
    out.push(timeProp('DTEND', e.end));
    out.push(`SUMMARY:${icsText(e.summary)}`);
    if (e.description) out.push(`DESCRIPTION:${icsText(e.description)}`);
    if (e.location) out.push(`LOCATION:${icsText(e.location)}`);
    const url = safeUri(e.url);
    if (url) out.push(`URL:${url}`);
    if (e.status) out.push(`STATUS:${e.status}`);
    out.push(`TRANSP:${e.transparent ? 'TRANSPARENT' : 'OPAQUE'}`);
    if (e.lastModified != null && Number.isFinite(e.lastModified)) out.push(`LAST-MODIFIED:${icsUtc(e.lastModified)}`);
    out.push('END:VEVENT');
  }
  out.push('END:VCALENDAR');
  return out.map(icsFold).join(CRLF) + CRLF;
}
