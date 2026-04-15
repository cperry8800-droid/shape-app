// Shared top nav. Server component so it can read the Supabase session.
// Visuals + tab structure match legacy shape-website/home.html .navbar.

import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/server';
import { logout } from '@/app/login/actions';

export default async function Nav() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <>
      <style>{`
        .navbar {
          position: fixed;
          top: 0; left: 0; right: 0;
          z-index: 100;
          background: rgba(10, 10, 10, 0.88);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-bottom: 1px solid var(--border);
        }
        .nav-container {
          max-width: 1440px;
          margin: 0 auto;
          padding: 0 24px;
          height: 68px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 32px;
        }
        .nav-logo { display: flex; align-items: center; }
        .nav-logo img { height: 32px; width: auto; display: block; }
        .nav-links {
          display: flex;
          align-items: center;
          gap: 32px;
        }
        .nav-links > a,
        .nav-dropdown > a {
          font-size: 0.82rem;
          font-weight: 400;
          letter-spacing: 0.02em;
          color: var(--text-dim);
          text-decoration: none;
          transition: color 0.3s var(--ease);
          cursor: pointer;
        }
        .nav-links > a:hover,
        .nav-dropdown:hover > a { color: var(--text); }
        .nav-dropdown { position: relative; }
        .nav-dropdown-menu {
          position: absolute;
          top: calc(100% + 14px);
          left: 50%;
          transform: translateX(-50%) translateY(-4px);
          min-width: 220px;
          background: var(--bg-card);
          border: 1px solid var(--border);
          padding: 10px 0;
          opacity: 0;
          pointer-events: none;
          transition: all 0.3s var(--ease);
          box-shadow: 0 24px 60px rgba(0,0,0,0.6);
        }
        .nav-dropdown:hover .nav-dropdown-menu {
          opacity: 1;
          pointer-events: auto;
          transform: translateX(-50%) translateY(0);
        }
        .nav-dropdown-menu::before {
          content: '';
          position: absolute;
          left: 0; right: 0;
          top: -14px;
          height: 14px;
        }
        .nav-dropdown-menu a {
          display: block;
          padding: 10px 20px;
          font-size: 0.78rem;
          color: var(--text-dim);
          text-decoration: none;
          transition: all 0.2s var(--ease);
          white-space: nowrap;
        }
        .nav-dropdown-menu a:hover {
          color: var(--text);
          background: rgba(255,255,255,0.04);
        }
        .nav-actions { display: flex; align-items: center; gap: 10px; }
        .nav-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 9px 20px;
          font-size: 0.74rem;
          font-weight: 500;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          border: 1px solid var(--border-strong);
          color: var(--text);
          background: transparent;
          text-decoration: none;
          cursor: pointer;
          transition: all 0.4s var(--ease);
          font-family: inherit;
        }
        .nav-btn:hover {
          background: var(--text);
          color: var(--bg);
          border-color: var(--text);
        }
        .nav-btn-primary {
          background: var(--text);
          color: var(--bg);
          border-color: var(--text);
        }
        .nav-btn-primary:hover {
          background: transparent;
          color: var(--text);
        }
        .nav-user {
          font-size: 0.78rem;
          color: var(--text-muted);
          max-width: 180px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .nav-spacer { height: 68px; }
        @media (max-width: 1100px) {
          .nav-links { display: none; }
        }
      `}</style>
      <nav className="navbar">
        <div className="nav-container">
          <Link href="/" className="nav-logo" aria-label="Shape home">
            <Image src="/logo.png" alt="Shape" width={120} height={32} priority />
          </Link>

          <div className="nav-links">
            <div className="nav-dropdown">
              <Link href="/trainers">Clients</Link>
              <div className="nav-dropdown-menu">
                <Link href="/trainers">Find a trainer</Link>
                <Link href="/nutritionists">Find a nutritionist</Link>
                <Link href="/dashboard/client">Client dashboard</Link>
              </div>
            </div>
            <div className="nav-dropdown">
              <Link href="/for-trainers">Trainers</Link>
              <div className="nav-dropdown-menu">
                <Link href="/for-trainers">Overview</Link>
                <Link href="/trainers">Trainer marketplace</Link>
                <Link href="/dashboard/trainer">Trainer dashboard</Link>
              </div>
            </div>
            <div className="nav-dropdown">
              <Link href="/for-nutritionists">Nutritionists</Link>
              <div className="nav-dropdown-menu">
                <Link href="/for-nutritionists">Overview</Link>
                <Link href="/nutritionists">Nutritionist marketplace</Link>
                <Link href="/dashboard/nutritionist">Nutritionist dashboard</Link>
              </div>
            </div>
            <div className="nav-dropdown">
              <Link href="/for-gyms">Gyms</Link>
              <div className="nav-dropdown-menu">
                <Link href="/for-gyms">Shape Pass</Link>
                <Link href="/gyms">Gym directory</Link>
              </div>
            </div>
            <Link href="/pricing">Pricing</Link>
            <Link href="/contact">Contact</Link>
          </div>

          <div className="nav-actions">
            {user ? (
              <>
                <Link href="/dashboard" className="nav-btn">Dashboard</Link>
                <form action={logout}>
                  <button type="submit" className="nav-btn">Sign out</button>
                </form>
              </>
            ) : (
              <>
                <Link href="/login" className="nav-btn">Log in</Link>
                <Link href="/signup" className="nav-btn nav-btn-primary">Get started</Link>
              </>
            )}
          </div>
        </div>
      </nav>
      <div className="nav-spacer" />
    </>
  );
}
