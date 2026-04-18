// Thin Resend HTTP wrapper + .ics builder for consultation confirmations.
// No SDK — just POST JSON to api.resend.com. Fails quietly: a session
// booking must succeed even if the email service is down or unconfigured.

type EmailArgs = {
  to: string;
  subject: string;
  html: string;
  text: string;
  ics?: string;
  icsFilename?: string;
};

type IcsArgs = {
  uid: string;
  start: Date;
  durationMin: number;
  summary: string;
  description: string;
  organizerEmail: string;
  organizerName: string;
  attendeeEmail: string;
  attendeeName: string;
  location?: string;
};

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function toIcsDate(d: Date): string {
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  );
}

function escapeIcsText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

export function buildIcs(args: IcsArgs): string {
  const end = new Date(args.start.getTime() + args.durationMin * 60 * 1000);
  const now = new Date();
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Shape//Consultation//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${args.uid}@theshapecommunity.com`,
    `DTSTAMP:${toIcsDate(now)}`,
    `DTSTART:${toIcsDate(args.start)}`,
    `DTEND:${toIcsDate(end)}`,
    `SUMMARY:${escapeIcsText(args.summary)}`,
    `DESCRIPTION:${escapeIcsText(args.description)}`,
    args.location ? `LOCATION:${escapeIcsText(args.location)}` : '',
    `ORGANIZER;CN=${escapeIcsText(args.organizerName)}:mailto:${args.organizerEmail}`,
    `ATTENDEE;CN=${escapeIcsText(args.attendeeName)};RSVP=TRUE:mailto:${args.attendeeEmail}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.filter(Boolean).join('\r\n');
}

export async function sendEmail(args: EmailArgs): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM ?? 'Shape <notifications@theshapecommunity.com>';
  if (!key) {
    console.warn('[shape-app] RESEND_API_KEY not set — skipping email to', args.to);
    return { ok: false, error: 'email_not_configured' };
  }

  const body: Record<string, unknown> = {
    from,
    to: [args.to],
    subject: args.subject,
    html: args.html,
    text: args.text,
  };
  if (args.ics) {
    body.attachments = [
      {
        filename: args.icsFilename ?? 'invite.ics',
        content: Buffer.from(args.ics, 'utf8').toString('base64'),
      },
    ];
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => '');
      console.error('[shape-app] Resend send failed', res.status, msg);
      return { ok: false, error: `resend_${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    console.error('[shape-app] Resend send threw', e);
    return { ok: false, error: 'resend_network' };
  }
}
