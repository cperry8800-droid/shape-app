// The ticket /api/apply/uploads hands back with its signed upload links, and /api/apply checks.
//
// An application's documents are uploaded straight to the private bucket under
// website/<draftId>/..., and the application row then takes the draft's id. The ticket is the
// server's word that it issued that id, for that role, after the bot check: /api/apply reads
// documents only under the ticket's own prefix, so a caller cannot point an application at
// anybody else's files, and the row's primary key makes one ticket one application.
//
// `<draftId>.<role>.<exp>.<mac>`; HMAC-SHA256 under a server secret that is never the raw
// service key (the delete-confirm and proposal secrets' derivation).

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const UPLOAD_TICKET_TTL_S = 2 * 60 * 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function secret(): string {
  if (process.env.APPLICATION_UPLOAD_SECRET) return process.env.APPLICATION_UPLOAD_SECRET;
  if (process.env.RATE_LIMIT_SECRET) return process.env.RATE_LIMIT_SECRET;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return serviceKey ? createHash('sha256').update(`shape-application-upload:${serviceKey}`).digest('hex') : '';
}

function mac(s: string, body: string): string {
  return createHmac('sha256', s).update(`application-upload:${body}`).digest('hex');
}

/** A ticket for this draft and role, or null when the server has no secret (the route answers 503). */
export function issueUploadTicket(draftId: string, role: string, now: number = Date.now()): { ticket: string; expiresAt: number } | null {
  const s = secret();
  if (!s || !UUID_RE.test(draftId) || (role !== 'trainer' && role !== 'nutritionist')) return null;
  const expiresAt = Math.floor(now / 1000) + UPLOAD_TICKET_TTL_S;
  const body = `${draftId}.${role}.${expiresAt}`;
  return { ticket: `${body}.${mac(s, body)}`, expiresAt };
}

/** The draft id a ticket was issued for, for this role and still in date, or null. */
export function readUploadTicket(ticket: unknown, role: string, now: number = Date.now()): string | null {
  const s = secret();
  if (!s || typeof ticket !== 'string') return null;
  const parts = ticket.split('.');
  if (parts.length !== 4) return null;
  const [draftId, ticketRole, exp, given] = parts;
  if (!UUID_RE.test(draftId) || ticketRole !== role || !/^\d{1,12}$/.test(exp)) return null;
  if (Number(exp) * 1000 < now) return null;
  const expected = mac(s, `${draftId}.${ticketRole}.${exp}`);
  if (!/^[0-9a-f]{64}$/.test(given)) return null;
  if (!timingSafeEqual(Buffer.from(given, 'hex'), Buffer.from(expected, 'hex'))) return null;
  return draftId;
}
