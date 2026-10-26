// System push, end to end in code (owner, 2026-10-16: "can we start these", on Firebase and APNs).
// Production had 0 registered push devices, and three things in the repo meant none could register or
// receive:
//   1. iOS: AppDelegate never handed the APNs device token to @capacitor/push-notifications, so the
//      app's 'registration' listener never fired.
//   2. iOS: had it fired, the token is a raw APNs token, which FCM (the only sender) cannot deliver to.
//      src/lib/push.ts now sends iOS tokens to Apple directly (HTTP/2, a .p8 key).
//   3. Android: no google-services.json in any build, and register() without it crashes the app.
//      push.js now registers on Android only in a build that has it (vite.config.ts), and CI writes it
//      from a secret.
// Also: FCM's every-400-is-a-dead-token rule, which would have wiped every device on one bad payload.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// ── The sender ─────────────────────────────────────────────────────────────────────────────────
// A fake node:http2: every request is recorded, and `answer(host, path)` decides the response.
function fakeHttp2(answer) {
  const sent = [];
  return {
    sent,
    mod: {
      connect(origin) {
        const session = new EventEmitter();
        session.close = () => {};
        session.request = (headers) => {
          const req = new EventEmitter();
          let body = '';
          req.setEncoding = () => {};
          req.setTimeout = () => {};
          req.close = () => {};
          req.end = (payload) => {
            body = payload;
            const host = origin.replace('https://', '');
            sent.push({ host, path: headers[':path'], headers, body: JSON.parse(body) });
            const [status, resBody] = answer(host, headers[':path']);
            setImmediate(() => {
              req.emit('response', { ':status': status });
              if (resBody) req.emit('data', JSON.stringify(resBody));
              req.emit('end');
            });
          };
          return req;
        };
        return session;
      },
    },
  };
}

// A push_tokens table the sender reads and prunes.
function tokensDb(rows) {
  const deleted = [];
  return {
    deleted,
    from(table) {
      assert.equal(table, 'push_tokens');
      return {
        select: () => ({ eq: async () => ({ data: rows.slice(), error: null }) }),
        delete: () => ({ in: async (_col, tokens) => { deleted.push(...tokens); return { error: null }; } }),
      };
    },
  };
}

const IOS = 'A'.repeat(64);
const DROID = 'fcm-token-1';
const { privateKey: ecKey, publicKey: ecPub } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
const { privateKey: rsaKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const APNS_ENV = {
  APNS_KEY_ID: 'KEY1234567', APNS_TEAM_ID: 'TEAM123456',
  // As Vercel stores it: newlines as literal \n.
  APNS_PRIVATE_KEY: ecKey.export({ type: 'pkcs8', format: 'pem' }).replace(/\n/g, '\\n'),
};
const FCM_ENV = {
  FCM_PROJECT_ID: 'shape-84d22', FCM_CLIENT_EMAIL: 'push@shape-84d22.iam.gserviceaccount.com',
  FCM_PRIVATE_KEY: rsaKey.export({ type: 'pkcs8', format: 'pem' }).replace(/\n/g, '\\n'),
};

async function withEnv(env, fn) {
  const keys = [...Object.keys(APNS_ENV), ...Object.keys(FCM_ENV), 'APNS_BUNDLE_ID'];
  const before = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  for (const k of keys) delete process.env[k];
  Object.assign(process.env, env);
  try { return await fn(); } finally {
    for (const k of keys) { if (before[k] === undefined) delete process.env[k]; else process.env[k] = before[k]; }
  }
}

async function loadPush(http2, fcmAnswer = () => [200, {}]) {
  const fcm = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('https://oauth2.googleapis.com/')) return { ok: true, json: async () => ({ access_token: 'goog', expires_in: 3600 }) };
    const body = JSON.parse(init.body);
    fcm.push(body.message);
    const [status, resBody] = fcmAnswer(body.message.token);
    return { ok: status === 200, status, text: async () => JSON.stringify(resBody), json: async () => resBody };
  };
  const mod = await loadRealModule(join(ROOT, 'src/lib/push.ts'), {
    typescript: true,
    registry: new Map([['node:http2', http2.mod], ['crypto', crypto]]),
  });
  return { mod, fcm, restore: () => { globalThis.fetch = realFetch; } };
}

test('an iOS token goes to Apple, signed with the .p8 key; an Android token goes to FCM', async () => {
  await withEnv({ ...APNS_ENV, ...FCM_ENV }, async () => {
    const h2 = fakeHttp2(() => [200, null]);
    const { mod, fcm, restore } = await loadPush(h2);
    try {
      // An iOS row holding an FCM token (an iOS build on Firebase Messaging) goes to FCM, not to Apple
      // and not to the bin.
      const db = tokensDb([{ token: IOS, platform: 'ios' }, { token: DROID, platform: 'android' }, { token: 'fcm:ios-token', platform: 'ios' }]);
      // It answers how many devices took it (Codex on #2476: the morning job holds a notice none took).
      assert.deepEqual(await mod.sendPushToUser(db, 'u1', { title: 'New message', body: 'Tom: see you at 6', data: { route: 'chat:abc', type: 'message' } }), { sent: 3, failed: 0 });
      assert.equal(h2.sent.length, 1);
      const a = h2.sent[0];
      assert.equal(a.host, 'api.push.apple.com', 'production first');
      assert.equal(a.path, `/3/device/${IOS}`);
      assert.equal(a.headers['apns-topic'], 'com.theshapecommunity.app');
      assert.equal(a.headers['apns-push-type'], 'alert');
      assert.deepEqual(a.body, { route: 'chat:abc', type: 'message', aps: { alert: { title: 'New message', body: 'Tom: see you at 6' }, sound: 'default' } },
        'the route rides beside aps, where the tap handler reads notification.data.route');
      // The provider token: ES256, the key id in the header, the team as issuer, and a signature
      // the key's public half verifies.
      const [h, c, s] = a.headers.authorization.replace(/^bearer /, '').split('.');
      assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url')), { alg: 'ES256', kid: 'KEY1234567' });
      assert.equal(JSON.parse(Buffer.from(c, 'base64url')).iss, 'TEAM123456');
      assert.ok(crypto.verify('sha256', Buffer.from(`${h}.${c}`), { key: ecPub, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')));
      assert.deepEqual(fcm.map((m) => m.token), [DROID, 'fcm:ios-token'], 'the APNs token never reaches FCM');
      assert.equal(db.deleted.length, 0);
    } finally { restore(); }
  });
});

test('an APNs token of any length goes to Apple: Apple says device tokens vary in length', async () => {
  await withEnv({ ...APNS_ENV, ...FCM_ENV }, async () => {
    const h2 = fakeHttp2(() => [200, null]);
    const { mod, fcm, restore } = await loadPush(h2);
    try {
      const SHORT = 'ab'.repeat(16), LONG = 'CD'.repeat(150);
      const db = tokensDb([{ token: SHORT, platform: 'ios' }, { token: LONG, platform: 'ios' }]);
      await mod.sendPushToUser(db, 'u1', { title: 'Hi', body: 'there' });
      assert.deepEqual(h2.sent.map((m) => m.path).sort(), [`/3/device/${LONG}`, `/3/device/${SHORT}`].sort());
      assert.equal(fcm.length, 0, 'neither reaches FCM');
      assert.equal(db.deleted.length, 0);
    } finally { restore(); }
  });
});

test('a sandbox token is retried on the sandbox; a dead one, on either service, is pruned; a bad payload is not', async () => {
  await withEnv({ ...APNS_ENV, ...FCM_ENV }, async () => {
    const SANDBOX = 'B'.repeat(64), GONE = 'C'.repeat(64), NOWHERE = 'D'.repeat(64);
    const h2 = fakeHttp2((host, path) => {
      const tk = path.split('/').pop();
      if (tk === SANDBOX) return host === 'api.push.apple.com' ? [400, { reason: 'BadDeviceToken' }] : [200, null];
      if (tk === GONE) return [410, { reason: 'Unregistered' }];
      if (tk === NOWHERE) return [400, { reason: 'BadDeviceToken' }];
      return [500, { reason: 'InternalServerError' }];
    });
    const fcmAnswer = (tk) => tk === 'dead' ? [404, { error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }]
      : tk === 'not-a-token' ? [400, { error: { status: 'INVALID_ARGUMENT', message: 'The registration token is not a valid FCM registration token' } }]
      : [400, { error: { status: 'INVALID_ARGUMENT', message: 'Invalid value at \'message.data[0].value\'' } }];
    const { mod, restore } = await loadPush(h2, fcmAnswer);
    const errLog = console.error; console.error = () => {};
    try {
      const db = tokensDb([
        { token: SANDBOX, platform: 'ios' }, { token: GONE, platform: 'ios' }, { token: NOWHERE, platform: 'ios' }, { token: 'E'.repeat(64), platform: 'ios' },
        { token: 'dead', platform: 'android' }, { token: 'not-a-token', platform: 'android' }, { token: 'fine-but-bad-payload', platform: 'android' },
      ]);
      // The sandbox token took it; the Apple 500 and the refused payload failed; the dead ones are neither.
      assert.deepEqual(await mod.sendPushToUser(db, 'u1', { title: 't', body: 'b' }), { sent: 1, failed: 2 });
      assert.deepEqual(h2.sent.filter((r) => r.path.endsWith(SANDBOX)).map((r) => r.host), ['api.push.apple.com', 'api.sandbox.push.apple.com']);
      assert.deepEqual(db.deleted.sort(), [GONE, NOWHERE, 'dead', 'not-a-token'].sort(),
        'Unregistered, a token neither Apple host knows, FCM UNREGISTERED and an invalid FCM token; never an Apple 500 or a payload FCM refused');
    } finally { restore(); console.error = errLog; }
  });
  // The rule on its own.
  const { mod, restore } = await loadPush(fakeHttp2(() => [200, null]));
  restore();
  assert.equal(mod.fcmTokenIsDead(404, ''), true);
  // UNREGISTERED is dead whatever status carries it, not only through the 404 rule.
  assert.equal(mod.fcmTokenIsDead(400, JSON.stringify({ error: { details: [{ errorCode: 'UNREGISTERED' }] } })), true);
  assert.equal(mod.fcmTokenIsDead(400, JSON.stringify({ error: { message: 'Invalid JSON payload received.' } })), false);
  assert.equal(mod.fcmTokenIsDead(400, 'not json'), false);
  assert.equal(mod.fcmTokenIsDead(403, JSON.stringify({ error: { details: [{ errorCode: 'SENDER_ID_MISMATCH' }] } })), false);
});

test('a token whose service is not set up is left alone, and with neither set nothing is read', async () => {
  // APNs only: the Android token is kept for when FCM is configured.
  await withEnv(APNS_ENV, async () => {
    const h2 = fakeHttp2(() => [200, null]);
    const { mod, fcm, restore } = await loadPush(h2);
    try {
      const db = tokensDb([{ token: IOS, platform: 'ios' }, { token: DROID, platform: 'android' }]);
      await mod.sendPushToUser(db, 'u1', { title: 't', body: 'b' });
      assert.equal(h2.sent.length, 1);
      assert.equal(fcm.length, 0);
      assert.deepEqual(db.deleted, []);
      assert.equal(mod.pushConfigured(), true);
    } finally { restore(); }
  });
  // FCM only: the iOS token is NOT sent to FCM (which would refuse it and, under the old rule, delete it).
  await withEnv(FCM_ENV, async () => {
    const h2 = fakeHttp2(() => [200, null]);
    const { mod, fcm, restore } = await loadPush(h2);
    try {
      const db = tokensDb([{ token: IOS, platform: 'ios' }, { token: DROID, platform: 'android' }]);
      await mod.sendPushToUser(db, 'u1', { title: 't', body: 'b' });
      assert.equal(h2.sent.length, 0);
      assert.deepEqual(fcm.map((m) => m.token), [DROID]);
      assert.deepEqual(db.deleted, []);
    } finally { restore(); }
  });
  await withEnv({}, async () => {
    const { mod, restore } = await loadPush(fakeHttp2(() => [200, null]));
    try {
      assert.equal(mod.pushConfigured(), false);
      assert.deepEqual(await mod.sendPushToUser({ from() { throw new Error('read with nothing to send'); } }, 'u1', { title: 't', body: 'b' }), { sent: 0, failed: 0 });
    } finally { restore(); }
  });
});

// ── The app ────────────────────────────────────────────────────────────────────────────────────
async function loadAppPush(platform, ready) {
  const calls = [];
  const plugin = {
    checkPermissions: async () => ({ receive: 'granted' }),
    requestPermissions: async () => ({ receive: 'granted' }),
    addListener: async () => ({ remove: () => {} }),
    register: async () => { calls.push('register'); },
  };
  globalThis.window = { Capacitor: { isNativePlatform: () => true, getPlatform: () => platform, Plugins: { PushNotifications: plugin } } };
  if (ready === undefined) delete globalThis.__SHAPE_ANDROID_PUSH__; else globalThis.__SHAPE_ANDROID_PUSH__ = ready;
  const mod = await loadRealModule(join(ROOT, 'mobile-app/src/services/push.js'), {});
  return { mod, calls };
}

test('Android registers only in a build that has Firebase; iOS needs nothing from it', async () => {
  const before = { window: globalThis.window, had: '__SHAPE_ANDROID_PUSH__' in globalThis, flag: globalThis.__SHAPE_ANDROID_PUSH__ };
  try {
    for (const flag of [undefined, false]) {
      const bare = await loadAppPush('android', flag);
      await bare.mod.registerPush({ prompt: true });
      assert.deepEqual(bare.calls, [], 'register() without Firebase crashes the app, so it is never called');
      assert.equal(await bare.mod.pushPermission(), 'unavailable', 'and nothing offers to turn push on');
    }
    const ready = await loadAppPush('android', true);
    await ready.mod.registerPush();
    assert.deepEqual(ready.calls, ['register']);
    const ios = await loadAppPush('ios', undefined);
    await ios.mod.registerPush();
    assert.deepEqual(ios.calls, ['register'], 'iOS registers without the Android flag');
  } finally {
    globalThis.window = before.window;
    if (before.had) globalThis.__SHAPE_ANDROID_PUSH__ = before.flag; else delete globalThis.__SHAPE_ANDROID_PUSH__;
  }
  // The flag is whether the build has google-services.json.
  const vite = read('mobile-app/vite.config.ts');
  assert.match(vite, /const androidPushReady = fs\.existsSync\(path\.resolve\(__dirname, 'android\/app\/google-services\.json'\)\);/);
  assert.match(vite, /__SHAPE_ANDROID_PUSH__: JSON\.stringify\(androidPushReady\),/);
});

test('iOS hands its device token to the plugin, and CI writes Firebase\'s file before each Android web build', () => {
  const delegate = read('mobile-app/ios/App/App/AppDelegate.swift');
  assert.match(delegate, /didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data\) \{\s+NotificationCenter\.default\.post\(name: \.capacitorDidRegisterForRemoteNotifications, object: deviceToken\)/);
  assert.match(delegate, /didFailToRegisterForRemoteNotificationsWithError error: Error\) \{\s+NotificationCenter\.default\.post\(name: \.capacitorDidFailToRegisterForRemoteNotifications, object: error\)/);
  const yml = read('.github/workflows/android-build.yml');
  const writes = [...yml.matchAll(/- name: Firebase config \(push\)/g)].map((m) => m.index);
  const builds = [...yml.matchAll(/- name: Build web assets/g)].map((m) => m.index);
  assert.equal(writes.length, 2, 'the debug job and the signed release job');
  assert.equal(builds.length, 2);
  for (let i = 0; i < 2; i++) assert.ok(writes[i] < builds[i] && (i === 0 || writes[i] > builds[i - 1]), 'each job writes it before its own web build');
  assert.equal((yml.match(/GOOGLE_SERVICES_JSON: \$\{\{ secrets\.GOOGLE_SERVICES_JSON \}\}/g) || []).length, 2);
  // Never committed: it carries a Google API key the secret scan flags.
  assert.match(read('mobile-app/android/.gitignore'), /^app\/google-services\.json$/m);
});
