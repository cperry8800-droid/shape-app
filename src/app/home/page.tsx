// Home page — cinematic video background with marketing content overlaid.
// Reached via "Enter Shape" from the intro.

import Link from 'next/link';

export const metadata = { title: 'Shape — Real coaching, powered by community' };

export default function HomePage() {
  return (
    <>
      <style>{`
        .navbar, .footer, header, footer { display: none !important; }
        html, body { background: #000 !important; margin: 0 !important; padding: 0 !important; }
        body > *:not(script):not(style) { margin: 0 !important; padding: 0 !important; }
      `}</style>

      <div className="relative min-h-screen bg-black text-white">
        {/* Pinned looping video background */}
        <div className="fixed inset-0 -z-10">
          <video
            src="/intro/beat-5.mp4"
            muted
            loop
            autoPlay
            playsInline
            preload="auto"
            className="absolute inset-0 h-full w-full scale-[1.04] object-cover"
          />
          {/* Darken overlay so text is always legible */}
          <div className="absolute inset-0 bg-black/60" />
        </div>

        {/* Nav */}
        <nav className="relative z-10 flex items-center justify-between px-6 py-5 md:px-12">
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
            <Link href="/signup" className="inline-flex items-center justify-center border border-white/60 bg-transparent px-5 py-2 text-[0.68rem] font-medium uppercase tracking-[0.12em] text-white transition-all hover:bg-white hover:text-neutral-950 md:px-6 md:py-2.5">
              Get Started
            </Link>
          </div>
        </nav>

        {/* Hero */}
        <section className="relative z-10 flex min-h-[80vh] flex-col items-center justify-center px-6 text-center">
          <img
            src="/logo-text-trimmed.png"
            alt="Shape"
            className="mb-6 h-[clamp(2.5rem,7vw,5rem)] w-auto [filter:brightness(0)_invert(1)]"
          />
          <p className="mx-auto max-w-lg text-[clamp(1rem,1.6vw,1.25rem)] font-light leading-relaxed text-white/70">
            Real coaching, powered by community.
          </p>
          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:gap-4">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center bg-white text-neutral-950 rounded-full px-8 py-3 text-sm font-medium transition-colors hover:bg-white/90"
            >
              Get Started
            </Link>
            <Link
              href="/trainers"
              className="inline-flex items-center justify-center border border-white/60 rounded-full px-8 py-3 text-sm font-medium text-white transition-colors hover:bg-white/10"
            >
              Browse Coaches
            </Link>
          </div>
        </section>

        {/* Value props */}
        <section className="relative z-10 mx-auto max-w-5xl px-6 py-20 md:px-12">
          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                title: 'Real Coaches',
                body: 'Every coach on Shape is verified — credentials, experience, reviews. Find someone who fits the way you train.',
              },
              {
                title: 'Real Nutritionists',
                body: 'Your nutritionist sends the grocery list. You just shop. Meal plans that actually fit your week.',
              },
              {
                title: 'One Platform',
                body: 'Programs, meals, check-ins and messaging — all in one place. Your trainer and nutritionist on the same team.',
              },
            ].map((card) => (
              <div
                key={card.title}
                className="rounded-xl border border-white/10 bg-white/5 p-8 backdrop-blur-sm"
              >
                <h3 className="mb-3 text-lg font-medium">{card.title}</h3>
                <p className="text-sm leading-relaxed text-white/60">{card.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="relative z-10 mx-auto max-w-3xl px-6 py-16 md:px-12">
          <h2 className="mb-12 text-center text-[clamp(1.5rem,3vw,2.2rem)] font-light">How it works</h2>
          <div className="grid gap-8 md:grid-cols-3">
            {[
              { step: '01', title: 'Browse', body: 'Find coaches and nutritionists that match your goals.' },
              { step: '02', title: 'Subscribe', body: 'Pick your team. Plans start at $49/month.' },
              { step: '03', title: 'Train', body: 'Get programs, meals, and check-ins — all in one place.' },
            ].map((s) => (
              <div key={s.step} className="text-center">
                <div className="mb-3 text-[0.7rem] font-medium uppercase tracking-[0.25em] text-white/30">{s.step}</div>
                <h3 className="mb-2 text-lg font-medium">{s.title}</h3>
                <p className="text-sm text-white/50">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section className="relative z-10 mx-auto max-w-2xl px-6 py-20 text-center md:px-12">
          <h2 className="mb-4 text-[clamp(1.5rem,3vw,2.2rem)] font-light">Ready to start?</h2>
          <p className="mb-8 text-sm text-white/50">Join Shape and get paired with real coaches and nutritionists.</p>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-4">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center bg-white text-neutral-950 rounded-full px-8 py-3 text-sm font-medium transition-colors hover:bg-white/90"
            >
              Get Started
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center border border-white/60 rounded-full px-8 py-3 text-sm font-medium text-white transition-colors hover:bg-white/10"
            >
              View Pricing
            </Link>
          </div>
        </section>

        {/* Footer */}
        <footer className="relative z-10 flex flex-col items-center gap-4 py-10 text-center text-[0.68rem] uppercase tracking-[0.16em] text-white/30">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="70 8 60 84" className="h-7 w-auto">
            <polygon points="72,44 72,88 105,66" fill="#FFFFFF" />
            <polygon points="128,12 128,56 95,34" fill="#FFFFFF" />
          </svg>
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-white">Privacy</Link>
            <Link href="/terms" className="hover:text-white">Terms</Link>
            <Link href="mailto:hello@theshapecommunity.com" className="hover:text-white">Contact</Link>
          </div>
          <div>&copy; {new Date().getFullYear()} Shape</div>
        </footer>
      </div>
    </>
  );
}
