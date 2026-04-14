// Home page — real landing page for Shape.
// Server-rendered, pulls a few stats from Supabase to keep it honest.

import Link from 'next/link';
import { getTrainers, getNutritionists, getGyms } from '@/lib/queries';

export default async function Home() {
  const [trainers, nutritionists, gyms] = await Promise.all([
    getTrainers(),
    getNutritionists(),
    getGyms(),
  ]);

  return (
    <>
      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-24 text-center">
        <div className="inline-block text-[0.68rem] uppercase tracking-[0.12em] font-semibold text-teal-400 bg-teal-400/10 border border-teal-400/20 rounded-full px-3 py-1 mb-8">
          Train · Eat · Move
        </div>
        <h1 className="text-5xl md:text-7xl font-light tracking-tight mb-6 max-w-4xl mx-auto">
          Everything you need to{' '}
          <span className="bg-gradient-to-r from-teal-400 to-cyan-400 bg-clip-text text-transparent">
            move better
          </span>
        </h1>
        <p className="text-neutral-400 text-lg md:text-xl max-w-2xl mx-auto mb-10">
          Subscribe to certified trainers, nutritionists, and gyms on one platform. Custom programs, meal plans, and ongoing coaching.
        </p>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <Link
            href="/signup"
            className="text-sm font-medium bg-teal-400 text-neutral-950 rounded-full px-6 py-3 hover:bg-teal-300 transition-colors"
          >
            Get started free
          </Link>
          <Link
            href="/trainers"
            className="text-sm font-medium border border-neutral-700 text-neutral-100 rounded-full px-6 py-3 hover:bg-neutral-900 transition-colors"
          >
            Browse trainers
          </Link>
        </div>
      </section>

      {/* Stats */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="grid grid-cols-3 gap-4">
          <StatCard n={trainers.length} label="Trainers" href="/trainers" />
          <StatCard n={nutritionists.length} label="Nutritionists" href="/nutritionists" />
          <StatCard n={gyms.length} label="Gyms" href="/gyms" />
        </div>
      </section>

      {/* Feature grid */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Feature
            title="Certified coaches"
            body="Every trainer and nutritionist holds a real industry credential — NASM, CSCS, RDN, and more."
          />
          <Feature
            title="Ongoing support"
            body="Subscribe monthly for personalized programs, meal plans, and direct messaging with your coach."
          />
          <Feature
            title="Cancel anytime"
            body="No lock-in. Pause or switch coaches whenever you want. Your data stays yours."
          />
        </div>
      </section>
    </>
  );
}

function StatCard({ n, label, href }: { n: number; label: string; href: string }) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6 hover:border-neutral-700 hover:bg-neutral-900 transition-colors block"
    >
      <div className="text-4xl font-semibold tracking-tight">{n}</div>
      <div className="text-sm text-neutral-400 mt-1">{label}</div>
    </Link>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
      <h3 className="font-semibold mb-2">{title}</h3>
      <p className="text-sm text-neutral-500 leading-relaxed">{body}</p>
    </div>
  );
}
