'use client';

// Scroll-driven cinematic intro. Each beat is a full-viewport section
// with a sticky background video. As the user scrolls past each beat,
// the copy fades in around the middle of the section and out near the
// end, giving that horizon.trade-style "scroll unlocks the next scene"
// feel without any heavy scroll-hijack library.
//
// Implementation notes:
// - Each beat is `h-[200vh]` so there's real scroll distance for the
//   fade timeline. The inner content uses `sticky top-0 h-screen` so
//   the video stays pinned while the parent scrolls.
// - Videos are muted + autoplay + loop + playsInline so mobile browsers
//   will actually play them without user interaction.
// - If a video file is missing, the <video> element silently fails and
//   we fall back to the section's black background. No runtime checks
//   needed.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

type Beat = {
  id: string;
  src: string;
  eyebrow?: string;
  title: string;
  subtitle?: string;
};

const BEATS: Beat[] = [
  {
    id: 'hero',
    src: '/intro/beat-0.mp4',
    eyebrow: 'Shape',
    title: 'The future of fitness',
    subtitle: 'starts with you.',
  },
  {
    id: 'connection',
    src: '/intro/beat-1.mp4',
    title: 'Your coach actually knows you.',
    subtitle: 'Real humans. Real accountability.',
  },
  {
    id: 'coaching',
    src: '/intro/beat-2.mp4',
    title: 'Never train alone again.',
    subtitle: 'Trainers and nutritionists in your corner, every day.',
  },
  {
    id: 'community',
    src: '/intro/beat-3.mp4',
    title: '10,000+ people moving together.',
    subtitle: 'One platform. One community.',
  },
  {
    id: 'cta',
    src: '/intro/beat-4.mp4',
    title: 'Your move.',
  },
];

export default function IntroScroll() {
  return (
    <main className="bg-black text-white">
      {BEATS.map((beat, i) => (
        <BeatSection key={beat.id} beat={beat} index={i} isLast={i === BEATS.length - 1} />
      ))}
    </main>
  );
}

function BeatSection({
  beat,
  index,
  isLast,
}: {
  beat: Beat;
  index: number;
  isLast: boolean;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [progress, setProgress] = useState(0);

  // Track scroll progress through this section (0 → 1).
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

  // Pause videos that aren't on screen to save battery/decoder budget.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (progress > 0 && progress < 1) {
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, [progress]);

  // Fade copy in between 0.15 → 0.35 and out between 0.65 → 0.85 of
  // section scroll. Gives a pause where the text sits at full opacity.
  const copyOpacity = (() => {
    if (progress < 0.15) return 0;
    if (progress < 0.35) return (progress - 0.15) / 0.2;
    if (progress < 0.65) return 1;
    if (progress < 0.85) return 1 - (progress - 0.65) / 0.2;
    return 0;
  })();

  // Slight parallax: copy drifts up as section progresses.
  const copyTranslate = `${(0.5 - progress) * 40}px`;

  return (
    <section ref={sectionRef} className="relative h-[200vh]">
      <div className="sticky top-0 h-screen w-full overflow-hidden">
        <video
          ref={videoRef}
          src={beat.src}
          muted
          loop
          playsInline
          preload="metadata"
          className="absolute inset-0 h-full w-full object-cover"
        />
        {/* Dark vignette for copy legibility */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/10 to-black/70" />

        <div
          className="relative z-10 flex h-full w-full flex-col items-center justify-center px-6 text-center"
          style={{
            opacity: copyOpacity,
            transform: `translateY(${copyTranslate})`,
            transition: 'opacity 0.1s linear',
          }}
        >
          {beat.eyebrow && (
            <div className="mb-4 text-[0.72rem] font-medium uppercase tracking-[0.22em] text-white/55">
              {beat.eyebrow}
            </div>
          )}
          <h2
            className="max-w-3xl text-[clamp(2rem,5vw,4.5rem)] font-light leading-[1.05] tracking-[-0.03em]"
          >
            {beat.title}
          </h2>
          {beat.subtitle && (
            <p className="mt-5 max-w-xl text-base font-light text-white/65 md:text-lg">
              {beat.subtitle}
            </p>
          )}

          {isLast && (
            <div className="mt-10 flex flex-col items-center gap-3">
              <Link
                href="/trainers"
                className="inline-flex items-center justify-center border border-teal-400 bg-teal-400 px-8 py-3.5 text-[0.82rem] font-medium uppercase tracking-[0.1em] text-neutral-950 transition-all hover:bg-teal-300"
              >
                Get Started →
              </Link>
              <Link
                href="/home"
                className="text-[0.72rem] uppercase tracking-[0.18em] text-white/45 hover:text-white/70"
              >
                Skip intro
              </Link>
            </div>
          )}
        </div>

        {/* Scroll hint on first beat */}
        {index === 0 && (
          <div
            className="absolute bottom-10 left-1/2 -translate-x-1/2 text-[0.68rem] uppercase tracking-[0.25em] text-white/40"
            style={{ opacity: 1 - Math.min(1, progress * 4) }}
          >
            Scroll ↓
          </div>
        )}
      </div>
    </section>
  );
}
