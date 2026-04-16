'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function CinematicNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav
      className={`sticky top-0 z-50 flex items-center justify-between px-6 py-5 md:px-12 transition-colors bg-neutral-950/95 backdrop-blur-xl border-b border-white/10 md:border-b-0 ${
        scrolled
          ? 'md:bg-neutral-950/85 md:backdrop-blur-xl md:border-b md:border-white/10'
          : 'md:bg-transparent md:backdrop-blur-0 md:border-b-0'
      }`}
    >
      <Link href="/" aria-label="Shape home">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="70 8 60 84" className="h-10 w-auto md:h-12">
          <polygon points="72,44 72,88 105,66" fill="#FFFFFF" />
          <polygon points="128,12 128,56 95,34" fill="#FFFFFF" />
        </svg>
      </Link>
      <div className="flex items-center gap-6 text-[0.72rem] font-medium uppercase tracking-[0.16em] text-white/80 md:gap-8 md:text-[0.76rem]">
        <Link href="/trainers" className="hidden hover:text-white md:inline">Coaches</Link>
        <Link href="/nutritionists" className="hidden hover:text-white md:inline">Nutritionists</Link>
        <Link href="/pricing" className="hidden hover:text-white md:inline">Pricing</Link>
        <Link href="/login" className="hover:text-white">Log in</Link>
        <Link
          href="/signup"
          className="inline-flex items-center justify-center border border-white/60 bg-transparent px-5 py-2 text-[0.68rem] font-medium uppercase tracking-[0.12em] text-white transition-all hover:bg-white hover:text-neutral-950 md:px-6 md:py-2.5"
        >
          Get Started
        </Link>
      </div>
    </nav>
  );
}
