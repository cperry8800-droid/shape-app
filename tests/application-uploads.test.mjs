// A coach application's documents, uploaded straight to storage (2026-10-12). Owner: "make sure
// application process can upload resume, and other CV materials, as well as certifications and
// designation supportive paperwork, certificates, etc".
//
//   · the rules (src/lib/application-files.mjs) and the website's classic-script mirror
//     (public/application-files.js) answer the same, constant for constant and case for case;
//   · the ticket (src/lib/application-upload-ticket.ts) binds a draft id to a role and an expiry;
//   · /api/apply/uploads checks the list, runs the bot check, and answers with a signed link per
//     file under a new draft id, and the ticket;
//   · the daily cleanup removes uploads that never became an application, and only those.
// The ticket path through /api/apply is driven in tests/provider-apply-submit.test.mjs, and the two
// forms in tests/provider-apply-forms.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const MB = 1024 * 1024;

const lib = await import(pathToFileURL(join(ROOT, 'src/lib/application-files.mjs')).href);
const mirror = require(join(ROOT, 'public/application-files.js'));
const ticket = await loadRealModule(join(ROOT, 'src/lib/application-upload-ticket.ts'), { typescript: true });
process.env.APPLICATION_UPLOAD_SECRET = 'test-upload-secret';

// ── The rules and their mirror ────────────────────────────────────────────────────────────

const CASES = [
  [],
  [{ kind: 'resume', name: 'cv.pdf', type: 'application/pdf', size: 100 }],
  [{ kind: 'resume', name: 'cv.PDF', type: '', size: 100 }],
  [{ kind: 'resume', name: 'cv.docx', type: 'application/octet-stream', size: 100 }],
  [{ kind: 'resume', name: 'tool.exe', type: '', size: 100 }],
  [{ kind: 'resume', name: 'cv.pdf', type: 'text/html', size: 100 }],
  [{ kind: 'resume', name: 'cv.pdf', type: 'application/pdf', size: 0 }],
  [{ kind: 'resume', name: 'cv.pdf', type: 'application/pdf', size: 10 * MB }],
  [{ kind: 'resume', name: 'cv.pdf', type: 'application/pdf', size: 10 * MB + 1 }],
  [{ kind: 'photos', name: 'me.jpg', type: 'image/jpeg', size: 100 }],
  [{ kind: '../x', name: 'me.jpg', type: 'image/jpeg', size: 100 }],
  Array.from({ length: 3 }, (_, i) => ({ kind: 'resume', name: `cv${i}.pdf`, type: 'application/pdf', size: 100 })),
  Array.from({ length: 10 }, (_, i) => ({ kind: 'credential', name: `c${i}.pdf`, type: 'application/pdf', size: 100 })),
  Array.from({ length: 11 }, (_, i) => ({ kind: 'credential', name: `c${i}.pdf`, type: 'application/pdf', size: 100 })),
  Array.from({ length: 8 }, (_, i) => ({ kind: i < 4 ? 'credential' : 'designation', name: `c${i}.pdf`, type: 'application/pdf', size: 9.5 * MB })),
  Array.from({ length: 26 }, (_, i) => ({ kind: 'credential', name: `c${i}.pdf`, type: 'application/pdf', size: 100 })),
];

test('the rules: every category, its limit, and what is refused', () => {
  assert.deepEqual(lib.APPLICATION_FILE_KINDS.map((k) => [k.kind, k.max]), [['resume', 2], ['cv_materials', 6], ['credential', 10], ['designation', 10], ['insurance', 2]]);
  assert.equal(lib.APPLICATION_FILE_BUCKET, 'provider-credentials');
  const answers = CASES.map((c) => lib.applicationFilesProblem(c));
  assert.deepEqual(answers, [
    '',
    '',
    '',
    '',
    'tool.exe must be a PDF, DOC, DOCX, PNG, JPEG or WebP file.',
    'cv.pdf must be a PDF, DOC, DOCX, PNG, JPEG or WebP file.',
    'cv.pdf is empty.',
    '',
    'cv.pdf is 10.1 MB; each file can be up to 10 MB.',
    'me.jpg is in a section the application does not have.',
    'me.jpg is in a section the application does not have.',
    'Attach at most 2 files under Resume / CV.',
    '',
    'Attach at most 10 files under Certifications and certificates.',
    'Your files add up to 76.0 MB; one application can carry up to 75 MB.',
    'Attach at most 25 files to one application.',
  ]);
  assert.equal(lib.applicationUploadPath('d', 'credential', 3, 'NASM cert (2024).pdf'), 'website/d/credential/3-NASM-cert-2024-.pdf');
  assert.equal(lib.applicationSafeFileName('../../etc/passwd'), '..-..-etc-passwd');
});

test('the bucket allows exactly the types the rules take, and no more than 10 MB a file', () => {
  // storage.buckets.provider-credentials, measured live 2026-10-12: the signed links upload into it,
  // so its own allow-list and size limit back the rules up.
  assert.deepEqual([...lib.APPLICATION_FILE_TYPES].sort(), ['application/msword', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png', 'image/webp']);
  assert.equal(lib.APPLICATION_MAX_FILE_BYTES, 10485760);
});

test('the website\'s mirror is the module: every constant, every answer', () => {
  for (const name of ['APPLICATION_FILE_BUCKET', 'APPLICATION_FILE_KINDS', 'APPLICATION_MAX_FILES', 'APPLICATION_MAX_FILE_BYTES', 'APPLICATION_MAX_TOTAL_BYTES', 'APPLICATION_FILE_TYPES', 'APPLICATION_FILE_ACCEPT']) {
    assert.deepEqual(mirror[name], lib[name], name);
  }
  for (const c of CASES) assert.equal(mirror.applicationFilesProblem(c), lib.applicationFilesProblem(c), JSON.stringify(c).slice(0, 80));
  for (const [n, t] of [['a.pdf', ''], ['a.JPEG', null], ['a', 'image/webp'], ['a.webp', 'image/gif'], ['x.doc', 'application/octet-stream']]) {
    assert.equal(mirror.applicationFileType(n, t), lib.applicationFileType(n, t), n);
  }
  assert.equal(mirror.applicationUploadPath('d', 'resume', 1, 'my cv.pdf'), lib.applicationUploadPath('d', 'resume', 1, 'my cv.pdf'));
  for (const page of ['SignupTrainer.html', 'SignupNutritionist.html']) {
    assert.match(read(`public/newdesign/${page}`), /<script src="\/application-files\.js"><\/script>/, `${page} loads the rules`);
  }
});

// ── The ticket ───────────────────────────────────────────────────────────────────────────

const DRAFT = '0b7c1d4e-1111-4222-8333-444455556666';

test('the ticket names its draft for one role until it expires, and nothing forged reads', () => {
  const now = Date.UTC(2026, 9, 12, 12);
  const issued = ticket.issueUploadTicket(DRAFT, 'trainer', now);
  assert.equal(issued.expiresAt, now / 1000 + 2 * 60 * 60);
  assert.equal(ticket.readUploadTicket(issued.ticket, 'trainer', now + 60_000), DRAFT);
  assert.equal(ticket.readUploadTicket(issued.ticket, 'nutritionist', now), null, 'another role');
  assert.equal(ticket.readUploadTicket(issued.ticket, 'trainer', now + 2 * 60 * 60 * 1000 + 1000), null, 'expired');
  const [id, role, exp, mac] = issued.ticket.split('.');
  assert.equal(ticket.readUploadTicket(`${id}.${role}.${Number(exp) + 3600}.${mac}`, 'trainer', now), null, 'a longer expiry is a forgery');
  assert.equal(ticket.readUploadTicket(`11111111-1111-4111-8111-111111111111.${role}.${exp}.${mac}`, 'trainer', now), null, 'another draft is a forgery');
  for (const bad of [null, 42, '', 'a.b.c', `${id}.${role}.${exp}.zz`]) assert.equal(ticket.readUploadTicket(bad, 'trainer', now), null, String(bad));
  assert.equal(ticket.issueUploadTicket('not-a-uuid', 'trainer', now), null);
  assert.equal(ticket.issueUploadTicket(DRAFT, 'client', now), null);
  const saved = { ...process.env };
  try {
    delete process.env.APPLICATION_UPLOAD_SECRET; delete process.env.RATE_LIMIT_SECRET; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    assert.equal(ticket.issueUploadTicket(DRAFT, 'trainer', now), null, 'no secret, no ticket');
    assert.equal(ticket.readUploadTicket(issued.ticket, 'trainer', now), null);
  } finally {
    Object.assign(process.env, saved);
  }
});

// ── /api/apply/uploads ───────────────────────────────────────────────────────────────────

class FakeNextRequest extends Request {}
const nextServer = {
  NextRequest: FakeNextRequest,
  NextResponse: class extends Response {
    static json(body, init = {}) { return new Response(JSON.stringify(body), { ...init, headers: { 'content-type': 'application/json', ...(init.headers || {}) } }); }
  },
};
const requestUtils = await loadRealModule(join(ROOT, 'src/lib/request-utils.ts'), { typescript: true, registry: new Map([['next/server', nextServer]]) });

async function uploadsRoute({ turnstileOk = true, user = null, ipAllowed = true, accountAllowed = true, failLinkAt = -1 } = {}) {
  const links = [];
  const limits = [];
  const admin = {
    rpc: async () => ({ data: null, error: null }),
    storage: { from: (bucket) => ({
      createSignedUploadUrl: async (path) => {
        if (links.length === failLinkAt) return { data: null, error: { message: 'storage is down' } };
        links.push({ bucket, path });
        return { data: { path, token: `token-${links.length}`, signedUrl: `https://storage.test/${path}?token=token-${links.length}` }, error: null };
      },
    }) },
  };
  const route = await loadRealModule(join(ROOT, 'src/app/api/apply/uploads/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/supabase/admin', { createAdminClient: () => admin }],
      ['@/lib/request-utils', requestUtils],
      ['@/lib/turnstile', { verifyTurnstile: async (token) => turnstileOk && token === 'good-token' }],
      ['@/lib/request-auth', { currentUser: async () => user }],
      ['@/lib/rate-limit', { checkRateLimit: async (_c, key, max, win, opts) => { limits.push({ key, max, win, opts }); return { allowed: key.startsWith('apply-uploads:ip:') ? ipAllowed : accountAllowed }; } }],
      ['@/lib/application-files.mjs', lib],
      ['@/lib/application-upload-ticket', ticket],
    ]),
  });
  const post = async (body, headers = {}) => {
    const res = await route.POST(new FakeNextRequest('https://shape.test/api/apply/uploads', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9', ...headers }, body: JSON.stringify(body) }));
    return { status: res.status, body: await res.json() };
  };
  return { post, links, limits };
}

const FILES = [
  { kind: 'resume', name: 'my cv.pdf', type: 'application/pdf', size: 2 * MB },
  { kind: 'credential', name: 'nasm.pdf', type: '', size: 9 * MB },
  { kind: 'designation', name: 'degree.jpg', type: 'image/jpeg', size: 5 * MB },
];

test('the links: one signed upload link per file under a new draft id, and a ticket for that draft and role', async () => {
  const r = await uploadsRoute();
  const res = await r.post({ providerType: 'trainer', files: FILES, turnstileToken: 'good-token' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const { draftId } = res.body;
  assert.match(draftId, /^[0-9a-f-]{36}$/);
  assert.equal(ticket.readUploadTicket(res.body.ticket, 'trainer'), draftId);
  assert.equal(res.body.bucket, 'provider-credentials');
  assert.deepEqual(res.body.uploads.map((u) => [u.kind, u.name, u.type, u.size, u.path]), [
    ['resume', 'my cv.pdf', 'application/pdf', 2 * MB, `website/${draftId}/resume/1-my-cv.pdf`],
    ['credential', 'nasm.pdf', 'application/pdf', 9 * MB, `website/${draftId}/credential/2-nasm.pdf`],
    ['designation', 'degree.jpg', 'image/jpeg', 5 * MB, `website/${draftId}/designation/3-degree.jpg`],
  ]);
  assert.deepEqual(res.body.uploads.map((u) => u.token), ['token-1', 'token-2', 'token-3']);
  assert.deepEqual(r.links.map((l) => l.bucket), ['provider-credentials', 'provider-credentials', 'provider-credentials']);
  assert.ok(r.limits.some((l) => l.key === 'apply-uploads:ip:203.0.113.9' && l.max === 10 && l.win === 3600));
});

test('the links: refused files, roles and bot checks get no link; the account path shares the application\'s daily cap', async () => {
  const cases = [
    ['no files', { providerType: 'trainer', files: [], turnstileToken: 'good-token' }, {}, 400, /No files to upload/],
    ['a member', { providerType: 'client', files: FILES, turnstileToken: 'good-token' }, {}, 400, /providerType must be/],
    ['a refused file', { providerType: 'trainer', files: [{ kind: 'resume', name: 'big.pdf', type: 'application/pdf', size: 11 * MB }], turnstileToken: 'good-token' }, {}, 400, /big\.pdf is 11\.0 MB; each file can be up to 10 MB\./],
    ['no human check', { providerType: 'trainer', files: FILES }, {}, 400, /Captcha check failed/],
    ['a bare Bearer', { providerType: 'trainer', files: FILES }, { headers: { authorization: 'Bearer junk' } }, 400, /Captcha check failed/],
    ['the address over its hour', { providerType: 'trainer', files: FILES, turnstileToken: 'good-token' }, { opts: { ipAllowed: false } }, 429, /Too many uploads/],
    ['the account over its day', { providerType: 'trainer', files: FILES }, { opts: { user: { id: 'u-1' }, accountAllowed: false }, headers: { authorization: 'Bearer real' } }, 400, /Captcha check failed/],
  ];
  for (const [name, body, { opts = {}, headers = {} }, status, message] of cases) {
    const r = await uploadsRoute(opts);
    const res = await r.post(body, headers);
    assert.equal(res.status, status, name);
    assert.match(res.body.error, message, name);
    assert.equal(r.links.length, 0, `${name}: no link`);
  }
  const account = await uploadsRoute({ user: { id: 'u-1' } });
  const ok = await account.post({ providerType: 'nutritionist', files: FILES }, { authorization: 'Bearer real' });
  assert.equal(ok.status, 200);
  assert.ok(account.limits.some((l) => l.key === 'apply:u:u-1' && l.max === 5 && l.opts?.failClosed), 'the same key and cap /api/apply counts');
  assert.equal(ticket.readUploadTicket(ok.body.ticket, 'nutritionist'), ok.body.draftId);
  const broken = await uploadsRoute({ failLinkAt: 1 });
  const failed = await broken.post({ providerType: 'trainer', files: FILES, turnstileToken: 'good-token' });
  assert.equal(failed.status, 500);
  assert.match(failed.body.error, /Nothing was saved/);
});

// ── The cleanup ──────────────────────────────────────────────────────────────────────────

const cleanup = await loadRealModule(join(ROOT, 'src/lib/application-upload-cleanup.ts'), {
  typescript: true,
  registry: new Map([['@/lib/application-files.mjs', lib]]),
});

test('the cleanup removes a day-old draft with no application, and nothing else', async () => {
  const now = Date.UTC(2026, 9, 13, 3, 45);
  const old = new Date(now - 30 * 60 * 60 * 1000).toISOString();
  const fresh = new Date(now - 2 * 60 * 60 * 1000).toISOString();
  const ids = { abandoned: 'aaaaaaaa-1111-4222-8333-444455556666', applied: 'bbbbbbbb-1111-4222-8333-444455556666', recent: 'cccccccc-1111-4222-8333-444455556666', mixed: 'dddddddd-1111-4222-8333-444455556666' };
  const objects = {
    [`website/${ids.abandoned}/resume/1-cv.pdf`]: old,
    [`website/${ids.abandoned}/credential/2-c.pdf`]: old,
    [`website/${ids.applied}/resume/1-cv.pdf`]: old,
    [`website/${ids.recent}/resume/1-cv.pdf`]: fresh,
    [`website/${ids.mixed}/resume/1-cv.pdf`]: old,
    [`website/${ids.mixed}/insurance/2-i.pdf`]: fresh,
  };
  const removed = [];
  const admin = {
    storage: { from: () => ({
      list: async (path) => {
        if (path === 'website') return { data: [...Object.values(ids), 'not-a-draft'].map((name) => ({ name, id: null })), error: null };
        const files = Object.entries(objects).filter(([p]) => p.startsWith(`${path}/`)).map(([p, at]) => ({ name: p.slice(path.length + 1), id: `o-${p}`, created_at: at }));
        return { data: files, error: null };
      },
      remove: async (paths) => { removed.push(...paths); return { error: null }; },
    }) },
    from: () => ({ select: () => ({ in: async (_c, values) => ({ data: values.filter((v) => v === ids.applied).map((id) => ({ id })), error: null }) }) }),
  };
  const result = await cleanup.removeAbandonedApplicationUploads(admin, now);
  assert.deepEqual(result, { folders: 4, abandoned: 1, removed: 2 });
  assert.deepEqual(removed.sort(), [`website/${ids.abandoned}/credential/2-c.pdf`, `website/${ids.abandoned}/resume/1-cv.pdf`]);
  const vercel = JSON.parse(read('vercel.json'));
  assert.ok(vercel.crons.some((c) => c.path === '/api/cron/application-uploads'), 'it runs daily');
  assert.match(read('src/app/api/cron/application-uploads/route.ts'), /if \(!authorized\(request\)\) return NextResponse\.json\(\{ error: 'unauthorized' \}, \{ status: 401 \}\);/);
});
