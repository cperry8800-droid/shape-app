'use client';

import { useState } from 'react';

const TEAL = '#0ac5a8';
const INK = '#f2ede4';

const serif = "'Instrument Serif', 'Fraunces', Georgia, serif";
const sans = "'Inter Tight', system-ui, sans-serif";

const FAQ = [
  {
    q: 'What do I get for $5/month?',
    a: "Full platform access — browse trainers and nutritionists, message your pros, track your progress, log meals, listen to Shape Radio ad-free, and join the community. The $5 is the Shape Platform fee. Anything you buy from an individual coach (a subscription, a plan, a one-off session) is separate and goes directly to them.",
  },
  {
    q: 'Do I have to subscribe to a coach?',
    a: 'No. For $5/mo you can browse, message intro calls, buy one-off plans, and use the community. A lot of members stay at the platform level and only buy workouts or meal plans à la carte. Others subscribe to one or more coaches for ongoing programming.',
  },
  {
    q: 'How much do trainers and nutritionists cost?',
    a: "Each pro sets their own price. Trainers typically run $60–$150 per session or $80–$250/month for full programming. Nutritionists typically run $120–$250 per consult or $120–$300/month for plans + reviews. You see each coach's rate on their profile before you subscribe.",
  },
  {
    q: 'Can I cancel any time?',
    a: 'Yes — the $5/mo cancels instantly from your settings. Coach subscriptions cancel on the same screen. No penalties, no lock-in. Your data and training history stay with you.',
  },
  {
    q: 'Do trainers and nutritionists pay to be on Shape?',
    a: 'No monthly dues, no setup fees. Shape takes a 15% platform fee on everything clients pay you — you only pay when you earn. Standard card processing is separate.',
  },
  {
    q: 'Is Shape Radio really included?',
    a: 'Yes — ad-free workout mixes, BPM-curated stations, live DJ sets from residents. Part of the $5/mo. Offline downloads included. No upsell.',
  },
];

export default function PricingFaq() {
  const [open, setOpen] = useState<number>(0);
  return (
    <section style={{ padding: '100px 40px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div
          style={{
            fontFamily: sans,
            fontSize: 12,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: TEAL,
            marginBottom: 16,
          }}
        >
          FAQ
        </div>
        <h2
          style={{
            fontFamily: serif,
            fontSize: 56,
            letterSpacing: '-0.03em',
            fontWeight: 400,
            margin: '0 0 40px',
            lineHeight: 1,
            color: INK,
          }}
        >
          Things people{' '}
          <em style={{ fontStyle: 'italic', color: TEAL }}>actually ask.</em>
        </h2>
        {FAQ.map((f, i) => (
          <div
            key={i}
            style={{ borderTop: '1px solid rgba(242,237,228,0.1)', padding: '24px 0' }}
          >
            <button
              onClick={() => setOpen(open === i ? -1 : i)}
              style={{
                width: '100%',
                textAlign: 'left',
                background: 'transparent',
                border: 0,
                color: INK,
                cursor: 'pointer',
                padding: 0,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span
                style={{
                  fontFamily: serif,
                  fontSize: 26,
                  letterSpacing: '-0.015em',
                  fontWeight: 400,
                }}
              >
                {f.q}
              </span>
              <span style={{ fontSize: 22, color: 'rgba(242,237,228,0.5)' }}>
                {open === i ? '−' : '+'}
              </span>
            </button>
            {open === i && (
              <div
                style={{
                  fontFamily: sans,
                  fontSize: 15,
                  color: 'rgba(242,237,228,0.75)',
                  lineHeight: 1.6,
                  marginTop: 16,
                  maxWidth: 780,
                }}
              >
                {f.a}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
