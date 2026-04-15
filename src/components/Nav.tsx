// Shared top nav. Server component so it can read the Supabase session
// and swap between Log in / Get started and the signed-in chip.
// Visuals match legacy shape-website/styles.css .navbar.

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { logout } from '@/app/login/actions';

const links = [
  { href: '/trainers', label: 'Trainers' },
  { href: '/nutritionists', label: 'Nutritionists' },
  { href: '/gyms', label: 'Gyms' },
  { href: '/pricing', label: 'Pricing' },
];

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
        .nav-logo {
          font-size: 1.15rem;
          font-weight: 500;
          letter-spacing: -0.02em;
          color: var(--text);
          text-decoration: none;
        }
        .nav-links {
          display: flex;
          align-items: center;
          gap: 36px;
        }
        .nav-links a {
          font-size: 0.82rem;
          font-weight: 400;
          letter-spacing: 0.02em;
          color: var(--text-dim);
          text-decoration: none;
          transition: color 0.3s var(--ease);
        }
        .nav-links a:hover { color: var(--text); }
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
        @media (max-width: 900px) {
          .nav-links { display: none; }
        }
      `}</style>
      <nav className="navbar">
        <div className="nav-container">
          <Link href="/" className="nav-logo">Shape</Link>
          <div className="nav-links">
            {links.map((l) => (
              <Link key={l.href} href={l.href}>{l.label}</Link>
            ))}
          </div>
          <div className="nav-actions">
            {user ? (
              <>
                <Link href="/dashboard" className="nav-btn">Dashboard</Link>
                <span className="nav-user">{user.email}</span>
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
