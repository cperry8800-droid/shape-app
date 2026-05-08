'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';

type Message = {
  from: 'shape' | 'you';
  text: string;
};

function replyFor(text: string) {
  const value = text.toLowerCase();
  if (/billing|price|cost|refund|stripe/.test(value)) {
    return 'Got it. Send the email on the account and we will route this to billing.';
  }
  if (/coach|trainer|nutrition|marketplace/.test(value)) {
    return 'Send what you are looking for and we can point you to the right coach or nutritionist.';
  }
  if (/app|bug|android|iphone|login|account/.test(value)) {
    return 'Send the device and issue. Support can use that to troubleshoot the app.';
  }
  return 'Received. A Shape teammate can follow up here or by email.';
}

export default function GlobalChatButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      from: 'shape',
      text: 'Welcome to Shape. Send a question about coaches, billing, the app, or your account.',
    },
  ]);

  if (pathname === '/' || pathname === '/intro-preview') {
    return null;
  }

  function send(text = draft) {
    const value = text.trim();
    if (!value) return;
    setMessages((current) => [
      ...current,
      { from: 'you', text: value },
      { from: 'shape', text: replyFor(value) },
    ]);
    setDraft('');
  }

  return (
    <>
      {open && (
        <section
          aria-label="Shape chat"
          role="dialog"
          className="fixed bottom-[92px] right-6 z-[2147483000] flex h-[540px] max-h-[calc(100vh-116px)] w-[390px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-[18px] border border-white/15 bg-[#1a1612] text-[#f2ede4] shadow-[0_28px_80px_rgba(0,0,0,0.62)] max-sm:bottom-[82px] max-sm:right-4 max-sm:h-[min(560px,calc(100vh-104px))] max-sm:w-[calc(100vw-32px)]"
        >
          <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-gradient-to-b from-[#1ec0a8]/10 to-transparent px-[18px] py-4">
            <div>
              <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[#2ee0c4]">
                Shape chat
              </div>
              <div className="text-lg font-bold leading-tight">How can we help?</div>
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
                    ? 'max-w-[84%] self-end rounded-[14px] rounded-tr bg-[#1ec0a8] px-3.5 py-2.5 text-[13.5px] leading-snug text-[#1a1612]'
                    : 'max-w-[84%] self-start rounded-[14px] rounded-tl bg-white/10 px-3.5 py-2.5 text-[13.5px] leading-snug'
                }
              >
                {message.text}
              </div>
            ))}
            {messages.length === 1 && (
              <div className="mt-1 flex flex-wrap gap-2">
                {['Find a coach', 'Billing help', 'App support'].map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => send(item)}
                    className="rounded-full border border-[#1ec0a8]/45 bg-transparent px-3 py-2 text-xs font-semibold text-[#2ee0c4]"
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
              placeholder="Message Shape..."
              className="min-h-10 flex-1 resize-none rounded-xl border border-white/15 bg-white/[0.045] px-3 py-2.5 text-[13.5px] text-[#f2ede4] outline-none"
            />
            <button
              type="button"
              disabled={!draft.trim()}
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
        aria-label="Open Shape chat"
        className="fixed bottom-6 right-6 z-[2147483000] inline-flex items-center gap-3 rounded-full border-0 bg-[#1ec0a8] px-6 py-4 text-[15px] font-bold text-[#1a1612] shadow-[0_18px_44px_rgba(0,0,0,0.38),0_4px_14px_rgba(30,192,168,0.35)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-white/80 max-sm:bottom-4 max-sm:right-4 max-sm:px-5 max-sm:py-3.5 max-sm:text-sm"
      >
        <svg width="19" height="19" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M2 6.5a4 4 0 0 1 4-4h4a3 3 0 0 1 3 3v3a3 3 0 0 1-3 3H6.5L3.5 14V8.5a3.5 3.5 0 0 1-1.5-2Z"
            stroke="currentColor"
            strokeLinejoin="round"
            strokeWidth="1.35"
          />
        </svg>
        <span>Chat</span>
        <span className="inline-flex h-6 min-w-7 items-center justify-center rounded-full bg-[#1a1612] px-2 font-mono text-xs font-bold leading-none text-[#1ec0a8]">
          24
        </span>
      </button>
    </>
  );
}
