'use client';

// Scroll-driven cinematic intro. Six sticky full-viewport sections,
// one per Veo clip. No copy overlays — the clips carry the story on
// their own. Only the final beat gets a "Get Started" CTA.
//
// Each section is h-[200vh] so there's real scroll distance; the
// inner wrapper uses sticky top-0 h-screen so the video pins while
// the parent scrolls past. Videos pause when off-screen to save
// battery and decoder budget.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

const BEATS = ['/intro/beat-5.mp4'];

export default function IntroScroll() {
  return (
    <main className="bg-black text-white">
      {BEATS.map((src, i) => (
        <BeatSection key={src} src={src} index={i} isLast={i === BEATS.length - 1} />
      ))}
    </main>
  );
}

function BeatSection({
  src,
  index,
  isLast,
}: {
  src: string;
  index: number;
  isLast: boolean;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;

    let raf = 0;
    const update = () => {
      const rect = el.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      const scrolled = Math.max(0, -rect.top);
      const p = total > 0 ? Math.min(1, scrolled / total) : 0;
      setProgress(p);
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  // Check if the section is on-screen at all (top above viewport bottom,
  // bottom below viewport top). Play while visible, pause otherwise.
  useEffect(() => {
    const el = sectionRef.current;
    const v = videoRef.current;
    if (!el || !v) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            v.play().catch(() => {});
          } else {
            v.pause();
          }
        }
      },
      { threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section ref={sectionRef} className="relative h-[200vh]">
      <div className="sticky top-0 h-screen w-full overflow-hidden">
        <video
          ref={videoRef}
          src={src}
          muted
          loop
          playsInline
          preload="metadata"
          className="absolute inset-0 h-full w-full object-cover"
        />

        {/* Subtle vignette for legibility on CTA */}
        {isLast && (
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent" />
        )}

        {/* Final CTA floats over the last clip */}
        {isLast && (
          <div
            className="absolute inset-x-0 bottom-[12vh] z-10 flex flex-col items-center gap-4 px-6 text-center"
            style={{
              opacity: progress < 0.2 ? 0 : Math.min(1, (progress - 0.2) / 0.2),
              transition: 'opacity 0.1s linear',
            }}
          >
            <Link
              href="/trainers"
              className="inline-flex items-center justify-center border border-teal-400 bg-teal-400 px-10 py-4 text-[0.82rem] font-medium uppercase tracking-[0.12em] text-neutral-950 transition-all hover:bg-teal-300"
            >
              Get Started →
            </Link>
            <Link
              href="/home"
              className="text-[0.68rem] uppercase tracking-[0.2em] text-white/55 hover:text-white/85"
            >
              Skip intro
            </Link>
          </div>
        )}

        {/* Scroll hint on the very first beat */}
        {index === 0 && (
          <div
            className="absolute bottom-10 left-1/2 -translate-x-1/2 text-[0.68rem] uppercase tracking-[0.25em] text-white/45"
            style={{ opacity: 1 - Math.min(1, progress * 4) }}
          >
            Scroll ↓
          </div>
        )}
      </div>
    </section>
  );
}
