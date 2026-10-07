// Mutation spec for the real Nora on pages without React (globalChatButton.js's own
// panel) and on the Next app's button. Each mutation breaks one clause.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/nora-real-older-pages-2026-10-07.mutations.mjs --fail-on-skipped
const BTN = 'public/newdesign/globalChatButton.js';
const NEXT = 'src/components/GlobalChatButton.tsx';

export default {
  test: 'node --test tests/nora-real-on-older-pages.test.mjs',
  timeoutMs: 120_000,
  mutations: [
    { name: 'the panel posts to the wrong endpoint', file: BTN,
      find: '      return fetch("/api/support/chat", {', replace: '      return fetch("/api/support", {' },
    { name: 'the panel drops the web surface', file: BTN,
      find: 'body: JSON.stringify({ messages: history, surface: "web" })', replace: 'body: JSON.stringify({ messages: history })' },
    { name: 'the panel sends Nora\'s turns as the user\'s', file: BTN,
      find: 'return { role: m.me ? "user" : "assistant", content: String(m.t || "") };', replace: 'return { role: "user", content: String(m.t || "") };' },
    { name: 'a server error is shown as a reply', file: BTN,
      find: 'if (!res.ok || !data || typeof data.reply !== "string" || !data.reply.trim()) return { reply: NORA_DOWN, links: [] };',
      replace: 'if (!data || typeof data.reply !== "string") return { reply: NORA_DOWN, links: [] };' },
    { name: 'a network failure leaves the dots', file: BTN,
      find: '      }).catch(function () { return { reply: NORA_DOWN, links: [] }; });', replace: '      }).catch(function () { return { reply: "…", links: [] }; });' },
    { name: 'any link scheme is allowed', file: BTN,
      find: '/^\\/(?!\\/)/.test(a.url)', replace: 'true' },
    { name: 'a protocol-relative link is allowed', file: BTN,
      find: '/^\\/(?!\\/)/.test(a.url)', replace: '/^\\//.test(a.url)' },
    { name: 'links are never rendered', file: BTN,
      find: '        if (m.links && m.links.length) {', replace: '        if (false) {' },
    { name: 'the greeting brings in the team again', file: BTN,
      find: "If I can't sort it out, the Shape team answers at info@theshapecommunity.com.\", time:\"now\"",
      replace: "I'll bring in the Shape team if I can't sort it out.\", time:\"now\"" },
    { name: 'Next: the wrong endpoint', file: NEXT,
      find: "    const res = await fetcher('/api/support/chat', {", replace: "    const res = await fetcher('/api/support', {" },
    { name: 'Next: a server error is shown as a reply', file: NEXT,
      find: "    if (!res.ok || typeof data.reply !== 'string' || !data.reply.trim()) return { reply: NORA_DOWN, links: [] };",
      replace: "    if (typeof data.reply !== 'string') return { reply: NORA_DOWN, links: [] };" },
    { name: 'Next: any link scheme is allowed', file: NEXT,
      find: "    if (!a || typeof a.url !== 'string' || !/^\\/(?!\\/)/.test(a.url)) continue;", replace: "    if (!a || typeof a.url !== 'string') continue;" },
    { name: 'Next: roles are flattened', file: NEXT,
      find: "messages: history.slice(-12).map((m) => ({ role: m.from === 'you' ? 'user' : 'assistant', content: m.text })),",
      replace: "messages: history.slice(-12).map((m) => ({ role: 'user', content: m.text })),"},
  ],
};
