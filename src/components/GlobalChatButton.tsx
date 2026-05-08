'use client';

export default function GlobalChatButton() {
  return (
    <a
      href="/newdesign/ClientCommunity.html"
      aria-label="Open Shape chat"
      className="fixed bottom-6 right-6 z-[2147483000] inline-flex items-center gap-3 rounded-full bg-[#1ec0a8] px-6 py-4 text-[15px] font-bold text-[#1a1612] no-underline shadow-[0_18px_44px_rgba(0,0,0,0.38),0_4px_14px_rgba(30,192,168,0.35)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-white/80 max-sm:bottom-4 max-sm:right-4 max-sm:px-5 max-sm:py-3.5 max-sm:text-sm"
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
    </a>
  );
}
