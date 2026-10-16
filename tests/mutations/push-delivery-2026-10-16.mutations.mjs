// Mutation spec for push delivery (2026-10-16): Apple directly for iPhones, Firebase for Android, and
// only a dead token pruned. Each mutation undoes one guard; tests/push-delivery.test.mjs must fail on
// every one.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/push-delivery-2026-10-16.mutations.mjs --fail-on-skipped
const PUSH = 'src/lib/push.ts';
const APP = 'mobile-app/src/services/push.js';

export default {
  test: 'node --test tests/push-delivery.test.mjs',
  timeoutMs: 120_000,
  mutations: [
    { name: 'every FCM 400 prunes the token again', file: PUSH,
      find: "  return status === 400 && /registration token/i.test(String(err?.message ?? ''));",
      replace: '  return status === 400;' },
    { name: 'FCM UNREGISTERED in the details is not dead', file: PUSH,
      find: "  if (err?.details?.some((d) => d && d.errorCode === 'UNREGISTERED')) return true;",
      replace: '' },
    { name: 'an iPhone\'s APNs token goes to FCM', file: PUSH,
      find: "  const toApns = (r: { token: string; platform: string | null }) => r.platform === 'ios' && APNS_TOKEN.test(r.token);",
      replace: '  const toApns = (_r: { token: string; platform: string | null }) => false;' },
    { name: 'an iOS row with an FCM token goes to Apple', file: PUSH,
      find: "  const toApns = (r: { token: string; platform: string | null }) => r.platform === 'ios' && APNS_TOKEN.test(r.token);",
      replace: "  const toApns = (r: { token: string; platform: string | null }) => r.platform === 'ios';" },
    { name: 'an APNs token outside 64-200 characters goes to FCM', file: PUSH,
      find: 'const APNS_TOKEN = /^[0-9a-f]+$/i;',
      replace: 'const APNS_TOKEN = /^[0-9a-f]{64,200}$/i;' },
    { name: 'no retry on Apple\'s sandbox', file: PUSH,
      find: '  if (res.status === 400 && apnsReason(res.body) === \'BadDeviceToken\') {\n    res = await apnsPost(APNS_HOSTS.sandbox, token, headers, payload);',
      replace: '  if (false) {\n    res = await apnsPost(APNS_HOSTS.sandbox, token, headers, payload);' },
    { name: 'a token Apple says is gone is kept', file: PUSH,
      find: "  if (res.status === 410) return 'stale';",
      replace: '' },
    { name: 'an Apple 500 prunes the token', file: PUSH,
      find: "  console.error('[push] APNs send failed:', res.status, res.body);\n  return 'error';",
      replace: "  return 'stale';" },
    { name: 'the provider token is DER-signed', file: PUSH,
      find: "{ key: pem(process.env.APNS_PRIVATE_KEY), dsaEncoding: 'ieee-p1363' }",
      replace: '{ key: pem(process.env.APNS_PRIVATE_KEY) }' },
    { name: 'the route rides inside aps, where the tap handler never reads it', file: PUSH,
      find: "  const payload = JSON.stringify({ ...(msg.data ?? {}), aps: { alert: { title: msg.title, body: msg.body }, sound: 'default' } });",
      replace: "  const payload = JSON.stringify({ aps: { alert: { title: msg.title, body: msg.body }, sound: 'default', ...(msg.data ?? {}) } });" },
    { name: 'an iOS token is sent while APNs is not set up', file: PUSH,
      find: '      if (apnsConfigured()) result = await sendApns(r.token, msg);',
      replace: "      result = apnsConfigured() ? await sendApns(r.token, msg) : 'stale';" },
    { name: 'Android registers without Firebase', file: APP,
      find: "  if (platform() === 'android' && !androidPushReady()) return;",
      replace: '' },
    { name: 'Android offers push without Firebase', file: APP,
      find: "  if (platform() === 'android' && !androidPushReady()) return 'unavailable';",
      replace: '' },
  ],
};
