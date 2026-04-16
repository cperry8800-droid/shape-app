import Link from 'next/link';
import Image from 'next/image';
import CinematicPageShell from '@/components/CinematicPageShell';

export const metadata = {
  title: 'Shape — Real coaching, powered by community.',
  description:
    'Find verified coaches and nutritionists on one platform. Programs, meals, check-ins, and messaging — all in one place.',
};

/* ------------------------------------------------------------------ */
/*  Value-prop & step data                                            */
/* ------------------------------------------------------------------ */

const valueProps = [
  {
    heading: 'Real Coaches',
    body: 'Every coach on Shape is verified \u2014 credentials, experience, reviews. Find someone who fits the way you train.',
  },
  {
    heading: 'Real Nutritionists',
    body: 'Your nutritionist sends the grocery list. You just shop. Meal plans that actually fit your week.',
  },
  {
    heading: 'One Platform',
    body: 'Programs, meals, check\u2011ins and messaging \u2014 all in one place. Your trainer and nutritionist on the same team.',
  },
];

const steps = [
  { num: '1', label: 'Browse', body: 'Find coaches and nutritionists that match your goals.' },
  { num: '2', label: 'Subscribe', body: 'Pick your team. Plans start at $49/month.' },
  { num: '3', label: 'Train', body: 'Get programs, meals, and check\u2011ins \u2014 all in one place.' },
];

/* ------------------------------------------------------------------ */
/*  Page                                                              */
/* ------------------------------------------------------------------ */

export default function HomePage() {
  return (
    <CinematicPageShell title="" subtitle="">
      <div className="mx-auto max-w-5xl">

        {/* ── Hero ─────────────────────────────────────────────── */}
        <section className="flex flex-col items-center py-20 text-center">
          <Image
            src="/logo-text-trimmed.png"
            alt="SHAPE"
            width={340}
            height={80}
            priority
            className="h-auto w-[220px] md:w-[340px]"
            style={{ filter: 'brightness(0) invert(1)' }}
          />
          <p className="mt-6 text-[clamp(1rem,1.6vw,1.25rem)] font-light text-white/60">
            Real coaching, powered by community.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-full bg-white px-8 py-3 text-sm font-medium text-neutral-950 transition-opacity hover:opacity-90"
            >
              Get Started
            </Link>
            <Link
              href="/trainers"
              className="inline-flex items-center justify-center rounded-full border border-white/60 px-8 py-3 text-sm font-medium text-white transition-colors hover:bg-white hover:text-neutral-950"
            >
              Browse Coaches
            </Link>
          </div>
        </section>

        <hr className="border-neutral-800" />

        {/* ── Value Props ──────────────────────────────────────── */}
        <section className="py-20">
          <div className="grid gap-6 md:grid-cols-3">
            {valueProps.map((v) => (
              <div
                key={v.heading}
                className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-8"
              >
                <h3 className="text-lg font-light">{v.heading}</h3>
                <p className="mt-3 text-sm leading-relaxed text-white/60">{v.body}</p>
              </div>
            ))}
          </div>
        </section>

        <hr className="border-neutral-800" />

        {/* ── How It Works ─────────────────────────────────────── */}
        <section className="py-20">
          <h2 className="mb-12 text-center text-2xl font-light">How It Works</h2>
          <div className="grid gap-6 md:grid-cols-3">
            {steps.map((s) => (
              <div
                key={s.num}
                className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-8"
              >
                <span className="text-3xl font-light text-white/20">{s.num}</span>
                <h3 className="mt-4 text-lg font-light">{s.label}</h3>
                <p className="mt-3 text-sm leading-relaxed text-white/60">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        <hr className="border-neutral-800" />

        {/* ── CTA Band ─────────────────────────────────────────── */}
        <section className="flex flex-col items-center py-20 text-center">
          <h2 className="text-2xl font-light">Ready to start?</h2>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-full bg-white px-8 py-3 text-sm font-medium text-neutral-950 transition-opacity hover:opacity-90"
            >
              Get Started
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center rounded-full border border-white/60 px-8 py-3 text-sm font-medium text-white transition-colors hover:bg-white hover:text-neutral-950"
            >
              View Pricing
            </Link>
          </div>
        </section>

      </div>
    </CinematicPageShell>
  );
}
