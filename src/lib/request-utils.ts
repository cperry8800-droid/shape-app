import { NextResponse } from 'next/server';

export function cleanText(value: unknown, max = 500): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// Default max JSON body for API routes (1 MB). Upload routes that read files
// set their own larger ceiling; the proxy enforces a matching cap up front.
export const JSON_BODY_LIMIT = 1_000_000;

export type JsonBody<T> = { ok: true; data: T } | { ok: false; response: NextResponse };

// Size-bounded, malformed-safe JSON body reader. Rejects oversized (413),
// empty (400), and unparseable (400) payloads so a handler never processes junk
// or blows up memory on a huge body. Use at the top of a POST/PUT/PATCH:
//   const parsed = await readJson<MyShape>(req);
//   if (!parsed.ok) return parsed.response;
//   const body = parsed.data;
export async function readJson<T = unknown>(
  req: Request,
  opts?: { maxBytes?: number; allowEmpty?: boolean }
): Promise<JsonBody<T>> {
  const max = opts?.maxBytes ?? JSON_BODY_LIMIT;
  const reject = (status: number, error: string): JsonBody<T> => ({
    ok: false,
    response: NextResponse.json({ error }, { status }),
  });

  const cl = req.headers.get('content-length');
  if (cl && Number(cl) > max) return reject(413, 'Payload too large.');

  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return reject(400, 'Could not read request body.');
  }
  if (raw.length > max) return reject(413, 'Payload too large.');
  if (!raw.trim()) {
    // Some endpoints are legitimately called with no body (defaults / action
    // routes). allowEmpty preserves that; otherwise an empty body is rejected.
    if (opts?.allowEmpty) return { ok: true, data: {} as T };
    return reject(400, 'Empty request body.');
  }

  try {
    return { ok: true, data: JSON.parse(raw) as T };
  } catch {
    return reject(400, 'Malformed JSON.');
  }
}
