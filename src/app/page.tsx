// Home page — matches legacy shape-website/home.html split-hero layout.
// Server-rendered, pulls stats from Supabase to keep it honest.

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
      <style>{`
        .split-hero { padding: 160px 0 40px; text-align: center; position: relative; }
        .split-hero h1 {
          font-size: clamp(2rem, 4vw, 3rem);
          font-weight: 300;
          letter-spacing: -0.04em;
          line-height: 1.1;
          margin-bottom: 10px;
        }
        .split-hero-sub {
          font-size: clamp(1rem, 1.2vw, 1.15rem);
          color: var(--text-muted);
          max-width: 520px;
          font-weight: 300;
          line-height: 1.8;
          margin: 0 auto 48px;
        }
        .split-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1px;
          background: var(--border);
          margin-top: 60px;
        }
        .split-card {
          background: var(--bg);
          padding: 48px 40px;
          transition: background 0.3s;
          text-align: center;
        }
        .split-card:hover { background: var(--bg-card); }
        .split-label {
          font-size: 0.72rem;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.15em;
          color: var(--text-muted);
          margin-bottom: 20px;
        }
        .split-card h2 {
          font-size: clamp(1.2rem, 2vw, 1.5rem);
          font-weight: 300;
          letter-spacing: -0.03em;
          line-height: 1.2;
          margin-bottom: 16px;
        }
        .split-card p {
          font-size: 0.88rem;
          color: var(--text-muted);
          font-weight: 300;
          line-height: 1.7;
          margin-bottom: 28px;
        }
        .split-card-links {
          display: flex; flex-direction: column; gap: 10px; align-items: center;
        }
        .split-card-links a {
          font-size: 0.82rem;
          font-weight: 400;
          color: var(--text);
          display: inline-flex;
          align-items: center;
          gap: 8px;
          transition: opacity 0.3s;
          text-decoration: none;
        }
        .split-card-links a:hover { opacity: 0.5; }
        .split-card-links .arrow { font-size: 0.75rem; color: var(--text-muted); }
        .stats-bar {
          display: flex;
          gap: 64px;
          padding: 48px 0;
          border-top: 1px solid var(--border);
          justify-content: center;
        }
        .stats-bar .stat { text-align: center; text-decoration: none; color: inherit; }
        .stats-bar .stat strong {
          display: block;
          font-size: clamp(1.4rem, 2.5vw, 2rem);
          font-weight: 300;
          letter-spacing: -0.03em;
          line-height: 1;
        }
        .stats-bar .stat span {
          font-size: 0.72rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin-top: 8px;
          display: block;
        }
        @media (max-width: 768px) {
          .split-grid { grid-template-columns: 1fr; margin-top: 20px; }
          .split-card { padding: 36px 24px; }
          .stats-bar { flex-wrap: wrap; gap: 32px; }
          .split-hero { padding: 120px 0 8px; }
          .split-hero-sub { margin-bottom: 20px; }
        }
      `}</style>

      <section className="split-hero">
        <div className="container-shape">
          <h1>
            Welcome to <span className="gradient-text">Shape</span>
          </h1>
          <p className="split-hero-sub">Real trainers. Real nutritionists. One platform.</p>

          <div className="split-grid">
            <div className="split-card">
              <div className="split-label">I want to train. I want nutrition.</div>
              <h2>Find your coach.</h2>
              <p>
                Browse certified trainers and nutritionists. Subscribe on your terms — custom
                sessions, meal plans, and direct access to the people coaching you.
              </p>
              <div className="split-card-links">
                <Link href="/trainers">Trainer Marketplace <span className="arrow">→</span></Link>
                <Link href="/nutritionists">Nutritionist Marketplace <span className="arrow">→</span></Link>
                <Link href="/signup">Let&rsquo;s do it <span className="arrow">→</span></Link>
              </div>
            </div>
            <div className="split-card">
              <div className="split-label">I&rsquo;m a trainer</div>
              <h2>Launch your business.</h2>
              <p>
                Shape puts you in front of thousands of members looking for custom programs.
                Build your profile, sell your sessions, and let us handle the marketing.
              </p>
              <div className="split-card-links">
                <Link href="/for-trainers">How it works <span className="arrow">→</span></Link>
                <Link href="/signup?role=trainer">Apply now <span className="arrow">→</span></Link>
              </div>
            </div>
            <div className="split-card">
              <div className="split-label">I&rsquo;m a nutritionist</div>
              <h2>Grow your practice.</h2>
              <p>
                Reach clients who need real nutrition guidance. Create meal plans, sell
                consultations, and build your client base — Shape handles the rest.
              </p>
              <div className="split-card-links">
                <Link href="/for-nutritionists">How it works <span className="arrow">→</span></Link>
                <Link href="/signup?role=nutritionist">Apply now <span className="arrow">→</span></Link>
              </div>
            </div>
            <div className="split-card">
              <div className="split-label">I run a gym</div>
              <h2>Fill your floor.</h2>
              <p>
                List your gym on Shape Pass and reach members looking for a place to train.
                Day passes, monthly access, and a direct line to new locals.
              </p>
              <div className="split-card-links">
                <Link href="/for-gyms">How it works <span className="arrow">→</span></Link>
                <Link href="/gyms">Gym directory <span className="arrow">→</span></Link>
              </div>
            </div>
          </div>

          <div className="stats-bar">
            <Link href="/trainers" className="stat">
              <strong>{trainers.length}</strong>
              <span>Trainers</span>
            </Link>
            <Link href="/nutritionists" className="stat">
              <strong>{nutritionists.length}</strong>
              <span>Nutritionists</span>
            </Link>
            <Link href="/gyms" className="stat">
              <strong>{gyms.length}</strong>
              <span>Gyms</span>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
