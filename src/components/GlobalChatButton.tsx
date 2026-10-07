'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { solveTurnstile } from '@/components/Turnstile';

type Message = {
  from: 'shape' | 'you';
  text: string;
  links?: { label: string; url: string }[];
};

// ⚠ THE REAL NORA, NOT A SCRIPT. This button sat on every Next page with four canned
// replies (one promising a teammate's follow-up) and a hard-coded unread badge.
// It now asks the same endpoint as every other Nora; a failure says so and gives the
// address a person actually reads (nothing records a question for the team).
const NORA_DOWN = "I can't be reached right now. Try again in a moment, or email the Shape team at info@theshapecommunity.com.";

// Nora's follow-ups as plain links: a same-site path only, whatever the reply carries.
export function noraLinks(actions: unknown): { label: string; url: string }[] {
  if (!Array.isArray(actions)) return [];
  const out: { label: string; url: string }[] = [];
  for (const a of actions as Array<{ url?: unknown; label?: unknown }>) {
    if (!a || typeof a.url !== 'string' || !/^\/(?!\/)/.test(a.url)) continue;
    if (typeof a.label !== 'string' || !a.label.trim()) continue;
    out.push({ label: a.label.trim().slice(0, 60), url: a.url });
    if (out.length === 4) break;
  }
  return out;
}

export async function askNora(
  history: Message[],
  fetcher: typeof fetch = fetch,
  solve: () => Promise<string> = solveTurnstile,
): Promise<{ reply: string; links: { label: string; url: string }[] }> {
  const post = async (extra: Record<string, unknown>) => {
    const res = await fetcher('/api/support/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        surface: 'web',
        // This panel renders text and links only, so Nora is asked for no drafted changes.
        confirmCards: false,
        messages: history.slice(-12).map((m) => ({ role: m.from === 'you' ? 'user' : 'assistant', content: m.text })),
        ...extra,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { reply?: unknown; actions?: unknown; needsCheck?: unknown };
    return { res, data };
  };
  try {
    let { res, data } = await post({});
    // A visitor's first question passes the bot check: solve it once and ask again.
    if (res.status === 403 && data.needsCheck === true) {
      const token = await solve().catch(() => '');
      if (token) ({ res, data } = await post({ turnstileToken: token }));
    }
    const ok = res.ok || data.needsCheck === true;
    if (!ok || typeof data.reply !== 'string' || !data.reply.trim()) return { reply: NORA_DOWN, links: [] };
    return { reply: data.reply, links: noraLinks(data.actions) };
  } catch {
    return { reply: NORA_DOWN, links: [] };
  }
}

export default function GlobalChatButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      from: 'shape',
      text: "Hi, I'm Nora, Shape's assistant. Ask me about coaches, billing, the app or your account.",
    },
  ]);

  const [quick, setQuick] = useState<string[]>(['Find me a coach', 'What does Shape cost?', 'How does coaching work?']);
  const [greeted, setGreeted] = useState(false);

  // Nora's greeting and suggestions for this account, the first time the panel opens.
  // This panel cannot show a confirm card, so it asks for the plain set; the greeting is
  // replaced only while it is still the only message.
  useEffect(() => {
    if (!open || greeted) return;
    setGreeted(true);
    fetch('/api/support/chat?plain=1', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((g: { text?: unknown; quick?: unknown } | null) => {
        if (!g || typeof g.text !== 'string' || !g.text.trim()) return;
        const text = g.text;
        setMessages((current) => (current.length === 1 && current[0].from === 'shape' ? [{ from: 'shape', text }] : current));
        if (Array.isArray(g.quick)) setQuick(g.quick.filter((q): q is string => typeof q === 'string' && !!q.trim()).slice(0, 4));
      })
      .catch(() => {});
  }, [open, greeted]);

  if (pathname === '/' || pathname === '/intro-preview') {
    return null;
  }

  async function send(text = draft) {
    const value = text.trim();
    if (!value || busy) return;
    const next: Message[] = [...messages, { from: 'you', text: value }];
    setMessages(next);
    setDraft('');
    setBusy(true);
    const { reply, links } = await askNora(next);
    setMessages((current) => [...current, { from: 'shape', text: reply, links }]);
    setBusy(false);
  }

  return (
    <>
      {open && (
        <section
          aria-label="Shape chat"
          role="dialog"
          className="fixed bottom-[92px] right-6 z-[2147483000] flex h-[540px] max-h-[calc(100vh-116px)] w-[390px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-[18px] border border-white/15 bg-[#1a1612] text-[#f2ede4] shadow-[0_28px_80px_rgba(0,0,0,0.62)] max-sm:bottom-[82px] max-sm:right-4 max-sm:h-[min(560px,calc(100vh-104px))] max-sm:w-[calc(100vw-32px)]"
        >
          <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-gradient-to-b from-[#0ac5a8]/10 to-transparent px-[18px] py-4">
            <div>
              <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[#2ee0c4]">
                Ask Nora
              </div>
              <div className="text-lg font-bold leading-tight">How can I help?</div>
            </div>
            <button
              type="button"
              aria-label="Close chat"
              onClick={() => setOpen(false)}
              className="border-0 bg-transparent px-2 text-2xl leading-none text-white/65"
            >
              &times;
            </button>
          </div>

          <div className="flex flex-1 flex-col gap-2.5 overflow-auto p-[18px]">
            {messages.map((message, index) => (
              <div
                key={`${message.from}-${index}`}
                className={
                  message.from === 'you'
                    ? 'max-w-[84%] self-end rounded-[14px] rounded-tr bg-[#0ac5a8] px-3.5 py-2.5 text-[13.5px] leading-snug text-[#1a1612]'
                    : 'max-w-[84%] self-start rounded-[14px] rounded-tl bg-white/10 px-3.5 py-2.5 text-[13.5px] leading-snug'
                }
              >
                {message.text}
                {message.links && message.links.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {message.links.map((l) => (
                      <a key={l.url + l.label} href={l.url} className="rounded-full border border-[#0ac5a8]/45 px-3 py-1.5 text-xs font-semibold text-[#2ee0c4] no-underline">
                        {l.label}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {busy && (
              <div className="max-w-[84%] self-start rounded-[14px] rounded-tl bg-white/10 px-3.5 py-2.5 text-[13.5px] leading-snug" aria-live="polite">
                Nora is typing…
              </div>
            )}
            {messages.length === 1 && (
              <div className="mt-1 flex flex-wrap gap-2">
                {quick.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => send(item)}
                    className="rounded-full border border-[#0ac5a8]/45 bg-transparent px-3 py-2 text-xs font-semibold text-[#2ee0c4]"
                  >
                    {item}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2 border-t border-white/10 p-3">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  send();
                }
              }}
              rows={1}
              placeholder="Ask Nora…"
              className="min-h-10 flex-1 resize-none rounded-xl border border-white/15 bg-white/[0.045] px-3 py-2.5 text-[13.5px] text-[#f2ede4] outline-none"
            />
            <button
              type="button"
              disabled={!draft.trim() || busy}
              onClick={() => send()}
              className="rounded-full border-0 bg-[#f2ede4] px-4 text-[13px] font-bold text-[#1a1612] disabled:cursor-not-allowed disabled:opacity-45"
            >
              Send
            </button>
          </div>
        </section>
      )}

      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ask Nora"
        className="fixed bottom-6 right-6 z-[2147483000] inline-flex items-center gap-3 rounded-full border-0 bg-[#0ac5a8] px-6 py-4 text-[15px] font-bold text-[#1a1612] shadow-[0_18px_44px_rgba(0,0,0,0.38),0_4px_14px_rgba(10,197,168,0.35)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-white/80 max-sm:bottom-4 max-sm:right-4 max-sm:px-5 max-sm:py-3.5 max-sm:text-sm"
      >
        <svg width="19" height="19" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M2 6.5a4 4 0 0 1 4-4h4a3 3 0 0 1 3 3v3a3 3 0 0 1-3 3H6.5L3.5 14V8.5a3.5 3.5 0 0 1-1.5-2Z"
            stroke="currentColor"
            strokeLinejoin="round"
            strokeWidth="1.35"
          />
        </svg>
        <span>Ask Nora</span>
      </button>
    </>
  );
}
