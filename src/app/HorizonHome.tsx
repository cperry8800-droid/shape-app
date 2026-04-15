'use client';

// Horizon.trade-style logged-out marketing home.
// Pinned fullscreen video stack with 5 scroll sections (hero + 4 beats).
// Active section drives which background video is visible via opacity
// crossfade. IntersectionObserver watches sentinel divs — cheap and
// smooth on mobile.

import { useEffect, useRef, useState } from 'react';

const BEATS = [
  '/intro/beat-5.mp4', // hero — mountain
  '/intro/beat-5.mp4', // §1 Real trainers (reuse mountain or swap later)
  '/intro/beat-6.mp4', // §2 Real nutritionists — market
  '/intro/beat-7.mp4', // §3 Trainer+nutritionist studio
  '/intro/beat-8.mp4', // §4 Data / built around you
];

const SECTIONS: Array<{
  eyebrow?: string;
  heading: string;
  sub?: string;
  cta?: { label: string; href: string };
}> = [
  {
    eyebrow: 'Welcome to',
    heading: 'SHAPE',
    sub: 'Real coaching, powered by community.',
    cta: { label: 'Get Started', href: '/signup' },
  },
  {
    eyebrow: '01',
    heading: 'Real trainers',
    sub: 'Every coach on Shape is verified — credentials, experience, reviews. Find someone who fits the way you train.',
  },
  {
    eyebrow: '02',
    heading: 'Real nutritionists',
    sub: 'Your nutritionist sends the grocery list. You just shop. Meal plans that actually fit your week.',
  },
  {
    eyebrow: '03',
    heading: 'One platform',
    sub: 'Programs, meals, check-ins and messaging — all in one place. Your trainer and nutritionist on the same team.',
  },
  {
    eyebrow: '04',
    heading: 'Built around you',
    sub: 'Progress tracked, habits measured, community alongside you. Every step, visible.',
    cta: { label: 'Enter Shape', href: '/signup' },
  },
];

export default function HorizonHome() {
  const [active, setActive] = useState(0);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Autoplay every video on mount so crossfades are instant.
  useEffect(() => {
    videoRefs.current.forEach((v) => v?.play().catch(() => {}));
  }, []);

  // IntersectionObserver on sentinel sections. Whichever section owns
  // the viewport center becomes the active background.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const idx = Number(entry.target.getAttribute('data-index'));
            if (!Number.isNaN(idx)) setActive(idx);
          }
        });
      },
      { threshold: 0.55 }
    );
    sectionRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <>
      {/* Hide global nav/footer for the marketing home. */}
      <style>{`
        .navbar, .footer, header[class*="navbar"], footer[class*="footer"] { display: none !important; }
        html, body { background: #000 !important; margin: 0 !important; padding: 0 !important; }
        body > *:not(script):not(style) { margin: 0 !important; padding: 0 !important; }
      `}</style>

      {/* Pinned fullscreen video stack. */}
      <div className="fixed inset-0 -z-10 bg-black">
        {BEATS.map((src, i) => (
          <video
            key={`${src}-${i}`}
            ref={(el) => {
              videoRefs.current[i] = el;
            }}
            src={src}
            muted
            loop
            playsInline
            preload="auto"
            className="absolute inset-0 h-full w-full object-cover transition-opacity duration-[1400ms] ease-out"
            style={{ opacity: active === i ? 1 : 0 }}
          />
        ))}
        {/* Subtle vignette so copy stays legible over busy frames. */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/40 via-black/10 to-black/60" />
      </div>

      {/* Transparent top nav — triangles + minimal links. */}
      <nav className="fixed inset-x-0 top-0 z-30 flex items-center justify-between px-6 py-5 md:px-12">
        <a href="/" aria-label="Shape home" className="pointer-events-auto">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="70 8 60 84"
            className="h-10 w-auto md:h-12"
          >
            <polygon points="72,44 72,88 105,66" fill="#FFFFFF" />
            <polygon points="128,12 128,56 95,34" fill="#FFFFFF" />
          </svg>
        </a>
        <div className="flex items-center gap-6 text-[0.7rem] font-medium uppercase tracking-[0.18em] text-white md:gap-10 md:text-[0.78rem]">
          <a href="#trainers" className="hidden hover:text-white/80 md:inline">
            Trainers
          </a>
          <a href="#nutritionists" className="hidden hover:text-white/80 md:inline">
            Nutritionists
          </a>
          <a href="#community" className="hidden hover:text-white/80 md:inline">
            Community
          </a>
          <a
            href="/login"
            className="hover:text-white/80"
          >
            Log in
          </a>
          <a
            href="/signup"
            className="inline-flex items-center justify-center border border-white bg-transparent px-5 py-2 text-[0.68rem] font-medium uppercase tracking-[0.14em] text-white transition-all hover:bg-white hover:text-neutral-950 md:px-6 md:py-2.5 md:text-[0.72rem]"
          >
            Get Started
          </a>
        </div>
      </nav>

      {/* Scroll sections. Each is 100vh and triggers its matching video. */}
      <main className="relative z-10">
        {SECTIONS.map((s, i) => (
          <section
            key={s.heading}
            ref={(el) => {
              sectionRefs.current[i] = el;
            }}
            data-index={i}
            className="flex min-h-screen items-center justify-center px-6 text-center text-white"
          >
            <div
              className="max-w-3xl transition-all duration-[1200ms] ease-out"
              style={{
                opacity: active === i ? 1 : 0.25,
                transform: active === i ? 'translateY(0)' : 'translateY(24px)',
              }}
            >
              {s.eyebrow && (
                <div className="mb-4 text-[0.72rem] font-medium uppercase tracking-[0.32em] text-white/80 md:mb-6 md:text-[0.82rem]">
                  {s.eyebrow}
                </div>
              )}
              {i === 0 ? (
                <div className="flex items-center justify-center">
                  <img
                    src="/logo-text-trimmed.png"
                    alt="Shape"
                    className="h-[clamp(3rem,9vw,7rem)] w-auto [filter:brightness(0)_invert(1)]"
                  />
                </div>
              ) : (
                <h2 className="text-[clamp(2.2rem,6vw,5rem)] font-extralight leading-none tracking-[-0.02em]">
                  {s.heading}
                </h2>
              )}
              {s.sub && (
                <p className="mx-auto mt-6 max-w-xl text-[clamp(0.95rem,1.4vw,1.15rem)] font-light leading-relaxed text-white/85 md:mt-8">
                  {s.sub}
                </p>
              )}
              {s.cta && (
                <div className="mt-10 flex flex-col items-center gap-3 md:mt-12">
                  <a
                    href={s.cta.href}
                    className="group inline-flex items-center justify-center gap-3 border border-white bg-transparent px-10 py-4 text-[0.82rem] font-medium uppercase tracking-[0.14em] text-white transition-all hover:bg-white hover:text-neutral-950"
                  >
                    <span>{s.cta.label}</span>
                    <span>→</span>
                  </a>
                  {i === SECTIONS.length - 1 && (
                    <a
                      href="/login"
                      className="inline-flex items-center justify-center border border-white bg-transparent px-9 py-3 text-[0.72rem] font-medium uppercase tracking-[0.14em] text-white transition-all hover:bg-white hover:text-neutral-950"
                    >
                      Log in
                    </a>
                  )}
                </div>
              )}
            </div>
          </section>
        ))}
      </main>

      {/* Minimal footer — just the mark and legal links. */}
      <footer className="relative z-10 flex flex-col items-center gap-4 py-10 text-center text-[0.72rem] uppercase tracking-[0.18em] text-white/60">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="70 8 60 84"
          className="h-8 w-auto"
        >
          <polygon points="72,44 72,88 105,66" fill="#FFFFFF" />
          <polygon points="128,12 128,56 95,34" fill="#FFFFFF" />
        </svg>
        <div className="flex gap-6">
          <a href="/privacy" className="hover:text-white">Privacy</a>
          <a href="/terms" className="hover:text-white">Terms</a>
          <a href="mailto:hello@theshapecommunity.com" className="hover:text-white">Contact</a>
        </div>
        <div className="text-white/40">© {new Date().getFullYear()} Shape</div>
      </footer>
    </>
  );
}
