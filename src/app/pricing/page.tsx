import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { startPlatformCheckout } from './actions';
import { logout } from '@/app/login/actions';
import PricingFaq from './PricingFaq';

export const metadata = { title: 'Pricing — Shape' };

const INK = '#f2ede4';
const PAPER = '#1a1612';
const TEAL = '#0ac5a8';
const TEAL_BRIGHT = '#1ec0a8';

const serif = "'Instrument Serif', 'Fraunces', Georgia, serif";
const sans = "'Inter Tight', system-ui, sans-serif";
const mono = "'JetBrains Mono', ui-monospace, monospace";

const PLATFORM_FEATURES = [
  'Browse all trainers & nutritionists',
  'Subscribe to any trainer or nutritionist',
  'Buy individual workout & meal plans',
  'Direct messaging with your pros',
  'Full progress tracking & analytics',
  'Nutrition schedule & macro tracking',
  'Community forum access',
  'Shape Radio — ad-free workout music',
];

const EXAMPLE_COACHES = [
  {
    role: 'Trainer',
    name: 'Maya Okafor',
    city: 'Brooklyn',
    price: 120,
    cadence: '/mo',
    note: 'Strength · hypertrophy',
    avg: '$60–$150 / session average',
  },
  {
    role: 'Nutritionist',
    name: 'Rae Lindqvist',
    city: 'Lisbon',
    price: 180,
    cadence: '/mo',
    note: 'Endurance · plant-based',
    avg: '$120–$250 / consult average',
  },
  {
    role: 'Trainer',
    name: 'Diego Alvarez',
    city: 'Mexico City',
    price: 95,
    cadence: '/mo',
    note: 'Run coaching · mobility',
    avg: '$60–$150 / session average',
  },
];

export default async function PricingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <>
      <style>{`
        .navbar, header > nav, body > header { display: none !important; }
        html, body {
          background: ${PAPER} !important;
          margin: 0 !important;
          padding: 0 !important;
        }
        body > *:not(script):not(style) { margin: 0 !important; padding: 0 !important; }
      `}</style>
      <link
        href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500;600&family=Inter+Tight:wght@300;400;500;600;700&family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500;9..144,600;9..144,700&display=swap"
        rel="stylesheet"
      />
      <div
        style={{
          background: PAPER,
          color: INK,
          minHeight: '100vh',
          position: 'relative',
          fontFamily: sans,
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 0,
            backgroundImage: "url('/Pricing.png')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            pointerEvents: 'none',
          }}
        />
        <div
          aria-hidden
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 0,
            background: 'rgba(26,22,18,0.6)',
            pointerEvents: 'none',
          }}
        />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <PricingNav user={user} />
          <PricingHero />
          <PricingCard user={user} />
          <PricingCoaches />
          <PricingFaq />
          <PricingCTA user={user} />
          <PricingFooter />
        </div>
      </div>
    </>
  );
}

function PricingNav({ user }: { user: { id: string; email?: string | null } | null }) {
  const linkStyle = { color: 'rgba(242,237,228,0.8)', textDecoration: 'none' } as const;
  const activeLinkStyle = { color: INK, textDecoration: 'none' } as const;
  const primaryBtn = {
    padding: '10px 20px',
    borderRadius: 6,
    background: TEAL,
    color: PAPER,
    textDecoration: 'none',
    fontWeight: 500,
    border: 0,
    cursor: 'pointer',
    fontFamily: sans,
    fontSize: 13,
  } as const;
  const ghostBtn = {
    padding: '10px 20px',
    borderRadius: 6,
    background: 'transparent',
    color: INK,
    textDecoration: 'none',
    fontWeight: 500,
    border: '1px solid rgba(242,237,228,0.25)',
    cursor: 'pointer',
    fontFamily: sans,
    fontSize: 13,
  } as const;
  return (
    <nav
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '24px 40px',
        position: 'relative',
        zIndex: 10,
      }}
    >
      <Link href="/" style={{ textDecoration: 'none' }}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="70 8 60 84" style={{ height: 36 }}>
          <polygon points="72,44 72,88 105,66" fill={INK} />
          <polygon points="128,12 128,56 95,34" fill={INK} />
        </svg>
      </Link>
      <div
        style={{
          display: 'flex',
          gap: 28,
          alignItems: 'center',
          fontFamily: sans,
          fontSize: 13,
          fontWeight: 500,
        }}
      >
        <Link href="/trainers" style={linkStyle}>Trainers</Link>
        <Link href="/nutritionists" style={linkStyle}>Nutritionists</Link>
        <Link href="/pricing" style={activeLinkStyle}>Pricing</Link>
        {user ? (
          <>
            {user.email && (
              <span style={{ color: 'rgba(242,237,228,0.55)', fontSize: 12 }}>{user.email}</span>
            )}
            <Link href="/dashboard" style={ghostBtn}>Dashboard</Link>
            <form action={logout}>
              <button type="submit" style={primaryBtn}>Sign out</button>
            </form>
          </>
        ) : (
          <>
            <Link href="/login" style={linkStyle}>Log in</Link>
            <Link href="/signup" style={primaryBtn}>Get started</Link>
          </>
        )}
      </div>
    </nav>
  );
}

function PricingHero() {
  return (
    <section style={{ padding: '100px 40px 40px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ maxWidth: 1320, margin: '0 auto', position: 'relative' }}>
        <div
          style={{
            fontFamily: sans,
            fontSize: 12,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: TEAL,
            marginBottom: 20,
          }}
        >
          Pricing
        </div>
        <h1
          style={{
            fontFamily: serif,
            fontSize: 'clamp(56px, 10vw, 128px)',
            letterSpacing: '-0.04em',
            fontWeight: 400,
            margin: 0,
            lineHeight: 0.9,
          }}
        >
          Five dollars{' '}
          <em style={{ fontStyle: 'italic', fontWeight: 500, color: TEAL }}>a&nbsp;month</em>.
          <br />
          Pay your coach directly.
        </h1>
        <p
          style={{
            fontFamily: sans,
            fontSize: 18,
            color: 'rgba(242,237,228,0.7)',
            margin: '28px 0 0',
            maxWidth: 720,
            lineHeight: 1.55,
          }}
        >
          One flat platform fee. Browse every trainer and nutritionist before paying anything,
          message your pros, track progress, log meals, listen to Shape Radio. Trainers and
          nutritionists set their own rates — you pay them directly, cancel any time.
        </p>
      </div>
    </section>
  );
}

function PricingCard({ user }: { user: { id: string } | null }) {
  return (
    <section style={{ padding: '40px 40px 60px' }}>
      <div
        style={{
          maxWidth: 1000,
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: '1.05fr 1fr',
          gap: 0,
          border: '1px solid rgba(242,237,228,0.12)',
          borderRadius: 16,
          overflow: 'hidden',
        }}
      >
        <div style={{ background: INK, color: PAPER, padding: '48px 44px 40px', position: 'relative' }}>
          <div
            style={{
              position: 'absolute',
              top: 28,
              right: 32,
              background: TEAL,
              color: PAPER,
              fontFamily: mono,
              fontSize: 10,
              letterSpacing: '0.14em',
              padding: '5px 12px',
              borderRadius: 4,
            }}
          >
            INCLUDES SHAPE RADIO
          </div>
          <div
            style={{
              fontFamily: sans,
              fontSize: 12,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'rgba(26,22,18,0.55)',
              marginBottom: 14,
            }}
          >
            Shape Platform
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <div
              style={{
                fontFamily: serif,
                fontSize: 120,
                fontWeight: 400,
                letterSpacing: '-0.04em',
                lineHeight: 0.9,
              }}
            >
              $5
            </div>
            <div style={{ fontSize: 16, color: 'rgba(26,22,18,0.55)' }}>/month</div>
          </div>
          <div
            style={{
              fontFamily: sans,
              fontSize: 13.5,
              color: 'rgba(26,22,18,0.65)',
              marginTop: 14,
              lineHeight: 1.5,
              maxWidth: 360,
            }}
          >
            What every Shape client pays to use the platform. Your coach&apos;s rate is separate
            and paid directly to them.
          </div>
          <div
            style={{
              fontFamily: serif,
              fontSize: 24,
              letterSpacing: '-0.015em',
              fontWeight: 400,
              marginTop: 24,
              lineHeight: 1.3,
              maxWidth: 360,
            }}
          >
            Everything you need. No bundles. No upsell. No seat math.
          </div>
          {user ? (
            <form action={startPlatformCheckout} style={{ marginTop: 36 }}>
              <button
                type="submit"
                style={{
                  padding: '16px 28px',
                  borderRadius: 8,
                  background: TEAL,
                  color: PAPER,
                  border: 0,
                  fontFamily: sans,
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Get started →
              </button>
            </form>
          ) : (
            <Link
              href="/signup?next=/pricing"
              style={{
                marginTop: 36,
                padding: '16px 28px',
                borderRadius: 8,
                background: TEAL,
                color: PAPER,
                fontFamily: sans,
                fontSize: 14,
                fontWeight: 500,
                textDecoration: 'none',
                display: 'inline-block',
              }}
            >
              Get started →
            </Link>
          )}
          <div
            style={{ fontFamily: sans, fontSize: 12, color: 'rgba(26,22,18,0.5)', marginTop: 16 }}
          >
            Cancel any time. No commitments.
          </div>
        </div>

        <div style={{ background: 'rgba(242,237,228,0.03)', padding: '48px 44px 40px' }}>
          <div
            style={{
              fontFamily: mono,
              fontSize: 11,
              letterSpacing: '0.14em',
              color: TEAL,
              marginBottom: 20,
            }}
          >
            WHAT&apos;S INCLUDED
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {PLATFORM_FEATURES.map((f, i) => (
              <div
                key={i}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '16px 1fr',
                  gap: 12,
                  fontSize: 14,
                  lineHeight: 1.45,
                  color: INK,
                }}
              >
                <span style={{ color: TEAL, fontSize: 13 }}>✓</span>
                <span>{f}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function PricingCoaches() {
  return (
    <section style={{ padding: '80px 40px' }}>
      <div style={{ maxWidth: 1320, margin: '0 auto' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 80,
            alignItems: 'end',
            marginBottom: 48,
          }}
        >
          <div>
            <div
              style={{
                fontFamily: sans,
                fontSize: 12,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: TEAL,
                marginBottom: 14,
              }}
            >
              Coaches price themselves
            </div>
            <h2
              style={{
                fontFamily: serif,
                fontSize: 'clamp(40px, 5vw, 64px)',
                letterSpacing: '-0.03em',
                fontWeight: 400,
                margin: 0,
                lineHeight: 0.95,
                color: INK,
              }}
            >
              Your coach sets the rate.{' '}
              <em style={{ fontStyle: 'italic', color: TEAL }}>You pay them directly.</em>
            </h2>
          </div>
          <p
            style={{
              fontFamily: sans,
              fontSize: 15.5,
              color: 'rgba(242,237,228,0.7)',
              lineHeight: 1.6,
              maxWidth: 440,
              margin: 0,
            }}
          >
            Subscribe monthly for ongoing programming, or buy one-off plans and sessions à la
            carte. Save each workout or program to your personal library you can access at any
            time. Every rate is visible on the coach&apos;s profile before you commit. Typical
            ranges below — but the coach is always the source of truth.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {EXAMPLE_COACHES.map((c, i) => (
            <div
              key={i}
              style={{
                padding: 28,
                background: 'rgba(242,237,228,0.04)',
                border: '1px solid rgba(242,237,228,0.1)',
                borderRadius: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 999,
                    background: 'rgba(242,237,228,0.08)',
                  }}
                />
                <div>
                  <div
                    style={{
                      fontFamily: mono,
                      fontSize: 10,
                      letterSpacing: '0.12em',
                      color: TEAL,
                      marginBottom: 2,
                    }}
                  >
                    {c.role.toUpperCase()}
                  </div>
                  <div
                    style={{ fontFamily: serif, fontSize: 22, letterSpacing: '-0.015em', color: INK }}
                  >
                    {c.name}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 13, color: 'rgba(242,237,228,0.65)' }}>
                {c.city} · {c.note}
              </div>
              <div style={{ borderTop: '1px solid rgba(242,237,228,0.1)', margin: '20px 0' }} />
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <div
                  style={{
                    fontFamily: serif,
                    fontSize: 40,
                    letterSpacing: '-0.02em',
                    lineHeight: 1,
                    color: INK,
                  }}
                >
                  ${c.price}
                </div>
                <div style={{ fontSize: 13, color: 'rgba(242,237,228,0.55)' }}>{c.cadence}</div>
              </div>
              <div style={{ fontSize: 12, color: 'rgba(242,237,228,0.5)', marginTop: 6 }}>
                {c.avg}
              </div>
            </div>
          ))}
        </div>
        <div style={{ textAlign: 'center', marginTop: 36 }}>
          <Link
            href="/trainers"
            style={{
              fontFamily: sans,
              fontSize: 14,
              color: TEAL,
              fontWeight: 500,
              textDecoration: 'none',
            }}
          >
            Browse all coaches →
          </Link>
        </div>
      </div>
    </section>
  );
}

function PricingCTA({ user }: { user: { id: string } | null }) {
  return (
    <section style={{ padding: '60px 40px 100px' }}>
      <div
        style={{
          maxWidth: 1100,
          margin: '0 auto',
          padding: '56px 56px',
          background: 'rgba(30,192,168,0.08)',
          border: '1px solid rgba(30,192,168,0.25)',
          borderRadius: 14,
          display: 'grid',
          gridTemplateColumns: '1.4fr 1fr',
          gap: 40,
          alignItems: 'center',
        }}
      >
        <div>
          <div
            style={{
              fontFamily: sans,
              fontSize: 12,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: TEAL_BRIGHT,
              marginBottom: 14,
            }}
          >
            One platform fee. One marketplace.
          </div>
          <h2
            style={{
              fontFamily: serif,
              fontSize: 'clamp(36px, 5vw, 56px)',
              letterSpacing: '-0.03em',
              fontWeight: 400,
              margin: 0,
              lineHeight: 0.95,
              color: INK,
            }}
          >
            $5 a month.{' '}
            <em style={{ fontStyle: 'italic', color: TEAL }}>Cancel any time.</em>
          </h2>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {user ? (
            <form action={startPlatformCheckout}>
              <button
                type="submit"
                style={{
                  width: '100%',
                  padding: '16px 26px',
                  borderRadius: 8,
                  background: INK,
                  color: PAPER,
                  border: 0,
                  fontFamily: sans,
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Get started →
              </button>
            </form>
          ) : (
            <Link
              href="/signup?next=/pricing"
              style={{
                padding: '16px 26px',
                borderRadius: 8,
                background: INK,
                color: PAPER,
                fontFamily: sans,
                fontSize: 14,
                fontWeight: 500,
                textDecoration: 'none',
                textAlign: 'center',
              }}
            >
              Get started →
            </Link>
          )}
          <Link
            href="/trainers"
            style={{
              padding: '16px 26px',
              borderRadius: 8,
              background: 'transparent',
              color: INK,
              border: '1px solid rgba(242,237,228,0.25)',
              fontFamily: sans,
              fontSize: 14,
              fontWeight: 500,
              textAlign: 'center',
              textDecoration: 'none',
            }}
          >
            Browse the marketplace
          </Link>
        </div>
      </div>
    </section>
  );
}

function PricingFooter() {
  return (
    <footer
      style={{
        padding: '40px 40px',
        borderTop: '1px solid rgba(242,237,228,0.08)',
      }}
    >
      <div
        style={{
          maxWidth: 1320,
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16,
          fontFamily: mono,
          fontSize: 11,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'rgba(242,237,228,0.5)',
        }}
      >
        <span>© {new Date().getFullYear()} Shape · All rights reserved</span>
        <div style={{ display: 'flex', gap: 24 }}>
          <Link href="/privacy" style={{ color: 'inherit', textDecoration: 'none' }}>
            Privacy
          </Link>
          <Link href="/terms" style={{ color: 'inherit', textDecoration: 'none' }}>
            Terms
          </Link>
          <Link href="/help" style={{ color: 'inherit', textDecoration: 'none' }}>
            Help
          </Link>
        </div>
      </div>
    </footer>
  );
}
